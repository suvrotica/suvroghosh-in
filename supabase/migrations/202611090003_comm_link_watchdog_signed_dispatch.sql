-- Managed pg_net queues may be readable/mutable by ordinary roles. Never enqueue
-- the reusable Vault key: use a purpose-bound, expiring proof and a one-use claim.
-- This corrects 002 without relying on project-owner access to managed queue ACLs.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
DO $$ BEGIN
	IF to_regprocedure('extensions.hmac(bytea,bytea,text)') IS NULL THEN
		RAISE EXCEPTION 'radio_watchdog_hmac_not_available';
	END IF;
END $$;

-- A separately reviewed activation starts scheduling after the compatible deploy.
UPDATE public.comm_link_watchdog SET enabled = false, last_tick_at = NULL,
	last_ack_at = NULL, dispatch_id = NULL, dispatch_until = NULL,
	worker_owner = NULL, worker_until = NULL, consecutive_failures = 0 WHERE id = 1;

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
	SELECT EXISTS (
		SELECT 1 FROM jsonb_array_elements(s -> 'rooms') AS room
		WHERE room ->> 'mode' = 'radio'
			AND coalesce(room #>> '{pttLease,publisherId}', '') <> ''
			AND ((room #>> '{pttLease,expiresAtMs}')::numeric <= now_ms + 2000
				OR room ->> 'isEnded' = 'true')
	) INTO due_expiry;
	SELECT EXISTS (
		SELECT 1 FROM jsonb_array_elements(s -> 'rooms') AS room,
			jsonb_array_elements(room -> 'participants') AS member
		WHERE room ->> 'mode' = 'radio' AND room ->> 'isEnded' = 'false'
			AND member ->> 'isConnected' = 'true' AND member ->> 'admissionStatus' = 'admitted'
			AND (member ->> 'lastSeenAt')::timestamptz >= clock_timestamp() - interval '30 seconds'
	) INTO occupied;
	-- No HTTP invocation for idle/unoccupied Radio rooms. Warm occupied rooms and
	-- refresh acknowledgements during long holds; expiry dispatch never depends on health.
	IF NOT due_expiry AND NOT (occupied AND (w.last_ack_at IS NULL OR w.last_ack_at <= clock_timestamp() - interval '10 seconds')) THEN
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