-- Warm health probes must not contend for the serialized room-state lease.
-- Keep this predicate aligned with store.ts pttLeaseNeedsRevocation. It does not
-- grant, extend, clear or otherwise modify any publisher's authority.
CREATE OR REPLACE FUNCTION public.comm_link_watchdog_needs_sweep(p_snapshot jsonb, p_now_ms numeric)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
	SELECT EXISTS (
		SELECT 1 FROM jsonb_array_elements(p_snapshot -> 'rooms') AS room
		WHERE coalesce(room #>> '{pttLease,publisherId}', '') <> ''
			AND (room ->> 'isEnded' = 'true'
				OR room ->> 'mode' IS DISTINCT FROM 'radio'
				OR coalesce(room #>> '{pttLease,holderUserId}', '') = ''
				OR room #>> '{pttLease,expiresAtMs}' IS NULL
				OR (room #>> '{pttLease,expiresAtMs}')::numeric <= p_now_ms
				OR room #>> '{pttLease,acquiredAtMs}' IS NULL
				OR p_now_ms - (room #>> '{pttLease,acquiredAtMs}')::numeric >= 45000
				OR NOT EXISTS (
					SELECT 1 FROM jsonb_array_elements(room -> 'participants') AS member
					WHERE member ->> 'userId' = room #>> '{pttLease,holderUserId}'
						AND member ->> 'isConnected' = 'true'
						AND member ->> 'admissionStatus' = 'admitted'
						AND coalesce(member ->> 'isListenerOnly', 'false') <> 'true'
						AND coalesce(member ->> 'hostMuted', 'false') <> 'true'
				))
	);
$$;

CREATE OR REPLACE FUNCTION public.comm_link_watchdog_claim_v2(p_dispatch_id uuid, p_owner uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
SET statement_timeout = '3s' SET lock_timeout = '1s' AS $$
DECLARE snapshot jsonb;
BEGIN
	IF NOT public.comm_link_watchdog_claim(p_dispatch_id, p_owner) THEN
		RETURN jsonb_build_object('claimed', false, 'needsSweep', false);
	END IF;
	-- MVCC read only: do not acquire, wait for or modify the room coordination lease.
	-- A publisher becoming due after this read remains visible to the next cron
	-- tick, whose expiry dispatch is independent of the warm acknowledgement.
	SELECT s.snapshot INTO STRICT snapshot FROM public.comm_link_state AS s WHERE id = 1;
	RETURN jsonb_build_object('claimed', true, 'needsSweep',
		public.comm_link_watchdog_needs_sweep(snapshot, extract(epoch FROM clock_timestamp()) * 1000));
END;
$$;

REVOKE ALL ON FUNCTION public.comm_link_watchdog_needs_sweep(jsonb,numeric) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.comm_link_watchdog_claim_v2(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comm_link_watchdog_claim_v2(uuid,uuid) TO service_role;

-- Refresh occupied-room health at six seconds of the fifteen-second ACK window.
CREATE OR REPLACE FUNCTION public.request_comm_link_watchdog()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
SET statement_timeout = '3s' SET lock_timeout = '1s' AS $$
DECLARE
	w public.comm_link_watchdog%ROWTYPE;
	s jsonb;
	now_ms numeric := extract(epoch FROM clock_timestamp()) * 1000;
	due_expiry boolean;
	occupied boolean;
	secret text;
	new_dispatch uuid;
	request_id bigint;
	expires_at bigint;
	proof text;
BEGIN
	SELECT * INTO w FROM public.comm_link_watchdog WHERE id = 1 FOR UPDATE SKIP LOCKED;
	IF NOT FOUND OR NOT w.enabled THEN RETURN NULL; END IF;
	UPDATE public.comm_link_watchdog SET last_tick_at = clock_timestamp() WHERE id = 1;
	-- Only this two-second job's historical run rows are pruned; no global cron setting changes.
	IF w.last_log_cleanup_at IS NULL OR w.last_log_cleanup_at < clock_timestamp() - interval '1 minute' THEN
		DELETE FROM cron.job_run_details WHERE jobid IN
			(SELECT jobid FROM cron.job WHERE jobname = 'comm-link-radio-watchdog')
			AND end_time < clock_timestamp() - interval '2 hours';
		UPDATE public.comm_link_watchdog SET last_log_cleanup_at = clock_timestamp() WHERE id = 1;
	END IF;
	IF w.dispatch_until > clock_timestamp() THEN RETURN NULL; END IF;
	IF w.dispatch_until IS NOT NULL THEN
		UPDATE public.comm_link_watchdog SET last_ack_at = NULL,
			consecutive_failures = least(consecutive_failures + 1, 1000000) WHERE id = 1;
	END IF;
	IF w.last_dispatch_at > clock_timestamp() - interval '2 seconds' THEN RETURN NULL; END IF;
	SELECT snapshot INTO s FROM public.comm_link_state WHERE id = 1;
	due_expiry := public.comm_link_watchdog_needs_sweep(s, now_ms + 2000);
	SELECT EXISTS (
		SELECT 1 FROM jsonb_array_elements(s -> 'rooms') AS room,
			jsonb_array_elements(room -> 'participants') AS member
		WHERE room ->> 'mode' = 'radio' AND room ->> 'isEnded' = 'false'
			AND member ->> 'isConnected' = 'true' AND member ->> 'admissionStatus' = 'admitted'
			AND (member ->> 'lastSeenAt')::timestamptz >= clock_timestamp() - interval '30 seconds'
	) INTO occupied;
	-- No HTTP invocation for idle/unoccupied Radio rooms. Warm occupied rooms and
	-- refresh acknowledgements during long holds; expiry dispatch never depends on health.
	IF NOT due_expiry AND NOT (occupied AND (w.last_ack_at IS NULL OR w.last_ack_at <= clock_timestamp() - interval '6 seconds')) THEN
		RETURN NULL;
	END IF;
	SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name = 'comm_link_watchdog_token';
	IF secret IS NULL OR octet_length(secret) < 32 THEN RAISE EXCEPTION 'radio_watchdog_secret_not_configured'; END IF;
	new_dispatch := gen_random_uuid();
	expires_at := floor(extract(epoch FROM clock_timestamp()))::bigint + 25;
	proof := encode(extensions.hmac(
		convert_to('comm-link-watchdog:v1' || chr(10) || new_dispatch::text || chr(10) || expires_at::text || chr(10) || 'POST' || chr(10) || 'https://www.suvroghosh.in/api/internal/radio-watchdog', 'UTF8'),
		convert_to(secret, 'UTF8'), 'sha256'), 'hex');
	SELECT net.http_post(
		url := 'https://www.suvroghosh.in/api/internal/radio-watchdog',
		headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || proof),
		body := jsonb_build_object('dispatchId', new_dispatch, 'expiresAt', expires_at),
		timeout_milliseconds := 20000
	) INTO request_id;
	UPDATE public.comm_link_watchdog SET dispatch_id = new_dispatch,
		dispatch_until = to_timestamp(expires_at), worker_owner = NULL, worker_until = NULL,
		last_dispatch_at = clock_timestamp(), last_http_request_id = request_id WHERE id = 1;
	RETURN request_id;
END;
$$;

COMMENT ON FUNCTION public.request_comm_link_watchdog() IS 'comm-link-watchdog:hmac-sha256:v1';
REVOKE ALL ON FUNCTION public.request_comm_link_watchdog() FROM PUBLIC, anon, authenticated, service_role;
