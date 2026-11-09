-- Independent PTT expiry worker. Scheduling/secret provisioning are deliberately
-- separate: this migration leaves the watchdog disabled and makes PTT fail closed.
DO $$
DECLARE
	service_privileges text[];
	service_column_privileges jsonb;
	column_list text;
	privilege text;
	column_privilege jsonb;
	id_reader_roles text[];
	id_reader_role text;
BEGIN
	IF to_regclass('net.http_request_queue') IS NOT NULL THEN
		SELECT array_agg(r) INTO id_reader_roles FROM unnest(ARRAY['anon','authenticated']) AS r
			WHERE has_column_privilege(r,'net.http_request_queue','id','SELECT');
		SELECT array_agg(p) INTO service_privileges FROM unnest(ARRAY['SELECT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS p
			WHERE has_table_privilege('service_role', 'net.http_request_queue', p);
		SELECT coalesce(jsonb_agg(jsonb_build_object('column',a.attname,'privilege',p)), '[]'::jsonb)
			INTO service_column_privileges FROM pg_attribute AS a CROSS JOIN unnest(ARRAY['SELECT','UPDATE','REFERENCES']) AS p
			WHERE a.attrelid = 'net.http_request_queue'::regclass AND a.attnum > 0 AND NOT a.attisdropped
				AND has_column_privilege('service_role','net.http_request_queue',a.attname,p);
		SELECT string_agg(quote_ident(attname), ',') INTO column_list FROM pg_attribute
			WHERE attrelid = 'net.http_request_queue'::regclass AND attnum > 0 AND NOT attisdropped;
		-- Reading leaks queued bearer headers; UPDATE can redirect a secret-bearing
		-- request even without SELECT. Leave only INSERT for security-invoker pg_net.
		REVOKE SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON net.http_request_queue FROM PUBLIC, anon, authenticated;
		EXECUTE format('REVOKE SELECT (%s), UPDATE (%s), REFERENCES (%s) ON net.http_request_queue FROM PUBLIC, anon, authenticated', column_list, column_list, column_list);
		-- Security-invoker net.http_post/get use INSERT ... RETURNING id. Retain
		-- only that column read, and only for roles that already possessed it.
		FOREACH id_reader_role IN ARRAY coalesce(id_reader_roles, ARRAY[]::text[]) LOOP
			EXECUTE format('GRANT SELECT (id) ON net.http_request_queue TO %I', id_reader_role);
		END LOOP;
		-- Preserve exactly the trusted service role's pre-existing effective access.
		FOREACH privilege IN ARRAY coalesce(service_privileges, ARRAY[]::text[]) LOOP
			EXECUTE format('GRANT %s ON net.http_request_queue TO service_role', privilege);
		END LOOP;
		FOR column_privilege IN SELECT value FROM jsonb_array_elements(service_column_privileges) LOOP
			IF NOT has_column_privilege('service_role','net.http_request_queue',column_privilege ->> 'column',column_privilege ->> 'privilege') THEN
				EXECUTE format('GRANT %s (%I) ON net.http_request_queue TO service_role', column_privilege ->> 'privilege', column_privilege ->> 'column');
			END IF;
		END LOOP;
	END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.comm_link_watchdog (
	id smallint PRIMARY KEY CHECK (id = 1),
	enabled boolean NOT NULL DEFAULT false,
	last_tick_at timestamptz,
	last_ack_at timestamptz,
	last_dispatch_at timestamptz,
	dispatch_id uuid,
	dispatch_until timestamptz,
	worker_owner uuid,
	worker_until timestamptz,
	last_http_request_id bigint,
	consecutive_failures integer NOT NULL DEFAULT 0,
	last_log_cleanup_at timestamptz
);
ALTER TABLE public.comm_link_watchdog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.comm_link_watchdog FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO public.comm_link_watchdog(id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.comm_link_state_acquire(p_owner uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
SET statement_timeout = '3s' SET lock_timeout = '1500ms' AS $$
DECLARE
	current_state public.comm_link_state%ROWTYPE;
	watchdog public.comm_link_watchdog%ROWTYPE;
	ready_until_ms numeric := 0;
BEGIN
	IF p_owner IS NULL THEN RAISE EXCEPTION 'Lease owner is required'; END IF;
	SELECT * INTO STRICT current_state FROM public.comm_link_state WHERE id = 1 FOR UPDATE;
	IF current_state.lock_owner IS NOT NULL AND current_state.lock_until > clock_timestamp() THEN
		RETURN jsonb_build_object('acquired', false);
	END IF;
	SELECT * INTO watchdog FROM public.comm_link_watchdog WHERE id = 1;
	IF watchdog.enabled AND watchdog.consecutive_failures = 0
		AND watchdog.last_tick_at > clock_timestamp() - interval '6 seconds'
		AND watchdog.last_ack_at > clock_timestamp() - interval '15 seconds' THEN
		ready_until_ms := extract(epoch FROM least(watchdog.last_tick_at + interval '6 seconds', watchdog.last_ack_at + interval '15 seconds')) * 1000;
	END IF;
	UPDATE public.comm_link_state SET lock_owner = p_owner,
		lock_until = clock_timestamp() + interval '45 seconds' WHERE id = 1;
	RETURN jsonb_build_object('acquired', true, 'version', current_state.version,
		'snapshot', current_state.snapshot, 'watchdogReadyUntilMs', ready_until_ms);
END;
$$;

CREATE OR REPLACE FUNCTION public.comm_link_watchdog_claim(p_dispatch_id uuid, p_owner uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
SET statement_timeout = '3s' SET lock_timeout = '1s' AS $$
DECLARE changed integer;
BEGIN
	IF p_dispatch_id IS NULL OR p_owner IS NULL THEN RETURN false; END IF;
	UPDATE public.comm_link_watchdog SET worker_owner = p_owner,
		worker_until = clock_timestamp() + interval '25 seconds',
		dispatch_until = clock_timestamp() + interval '25 seconds'
	WHERE id = 1 AND enabled AND dispatch_id = p_dispatch_id
		AND dispatch_until > clock_timestamp() AND worker_owner IS NULL;
	GET DIAGNOSTICS changed = ROW_COUNT;
	RETURN changed = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.comm_link_watchdog_finish(p_dispatch_id uuid, p_owner uuid, p_success boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
SET statement_timeout = '3s' SET lock_timeout = '1s' AS $$
DECLARE changed integer;
BEGIN
	UPDATE public.comm_link_watchdog SET
		last_ack_at = CASE WHEN p_success THEN clock_timestamp() ELSE NULL END,
		consecutive_failures = CASE WHEN p_success THEN 0 ELSE least(consecutive_failures + 1, 1000000) END,
		dispatch_until = NULL, worker_owner = NULL, worker_until = NULL
	WHERE id = 1 AND dispatch_id = p_dispatch_id AND worker_owner = p_owner
		AND worker_until > clock_timestamp();
	GET DIAGNOSTICS changed = ROW_COUNT;
	RETURN changed = 1;
END;
$$;

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
	SELECT net.http_post(
		url := 'https://www.suvroghosh.in/api/internal/radio-watchdog',
		headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret),
		body := jsonb_build_object('dispatchId', new_dispatch),
		timeout_milliseconds := 20000
	) INTO request_id;
	UPDATE public.comm_link_watchdog SET dispatch_id = new_dispatch,
		dispatch_until = clock_timestamp() + interval '30 seconds', worker_owner = NULL, worker_until = NULL,
		last_dispatch_at = clock_timestamp(), last_http_request_id = request_id WHERE id = 1;
	RETURN request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.comm_link_state_acquire(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.comm_link_watchdog_claim(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.comm_link_watchdog_finish(uuid,uuid,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_comm_link_watchdog() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.comm_link_state_acquire(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.comm_link_watchdog_claim(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.comm_link_watchdog_finish(uuid,uuid,boolean) TO service_role;
