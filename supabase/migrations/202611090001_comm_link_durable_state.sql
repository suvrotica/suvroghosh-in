-- Request-scoped COMM-LINK state with a PostgreSQL-fenced serialization lease.
-- The row is authoritative across function instances. Never hydrate from the old
-- best-effort mirror tables: doing so could resurrect deleted rooms or invitations.
CREATE TABLE IF NOT EXISTS public.comm_link_state (
	id smallint PRIMARY KEY CHECK (id = 1),
	version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
	snapshot jsonb NOT NULL,
	lock_owner uuid,
	lock_until timestamptz,
	updated_at timestamptz NOT NULL DEFAULT now(),
	CHECK (octet_length(snapshot::text) <= 4194304),
	CHECK (snapshot ->> 'schemaVersion' = '1')
);
ALTER TABLE public.comm_link_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.comm_link_state FROM PUBLIC, anon, authenticated, service_role;
-- Block the predecessor's best-effort mirror writes during the release cutover.
-- Existing rows remain untouched; only the fenced SECURITY DEFINER RPCs can
-- perform the retention/erasure cleanup below.
REVOKE ALL ON public.comm_link_accounts, public.comm_link_rooms,
	public.comm_link_invitations, public.comm_link_memberships,
	public.comm_link_abuse_reports FROM service_role;

INSERT INTO public.comm_link_state(id, snapshot) VALUES (1,
	'{"schemaVersion":1,"accounts":[],"rooms":[],"invitations":[],"abuseReports":[],"revokedAccounts":[]}'::jsonb
) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.comm_link_state_acquire(p_owner uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE current_state public.comm_link_state%ROWTYPE;
BEGIN
	IF p_owner IS NULL THEN RAISE EXCEPTION 'Lease owner is required'; END IF;
	SELECT * INTO STRICT current_state FROM public.comm_link_state WHERE id = 1 FOR UPDATE;
	IF current_state.lock_owner IS NOT NULL AND current_state.lock_until > clock_timestamp() THEN
		RETURN jsonb_build_object('acquired', false);
	END IF;
	UPDATE public.comm_link_state SET lock_owner = p_owner,
		lock_until = clock_timestamp() + interval '45 seconds' WHERE id = 1;
	RETURN jsonb_build_object('acquired', true, 'version', current_state.version, 'snapshot', current_state.snapshot);
END;
$$;

CREATE OR REPLACE FUNCTION public.comm_link_state_commit(p_owner uuid, p_version bigint, p_snapshot jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE changed integer;
BEGIN
	IF p_snapshot IS NULL OR jsonb_typeof(p_snapshot) <> 'object'
		OR p_snapshot ->> 'schemaVersion' IS DISTINCT FROM '1'
		OR octet_length(p_snapshot::text) > 4194304
		OR jsonb_typeof(p_snapshot -> 'accounts') IS DISTINCT FROM 'array'
		OR jsonb_typeof(p_snapshot -> 'rooms') IS DISTINCT FROM 'array'
		OR jsonb_typeof(p_snapshot -> 'invitations') IS DISTINCT FROM 'array'
		OR jsonb_typeof(p_snapshot -> 'abuseReports') IS DISTINCT FROM 'array'
		OR jsonb_typeof(p_snapshot -> 'revokedAccounts') IS DISTINCT FROM 'array' THEN
		RAISE EXCEPTION 'Invalid bounded radio snapshot';
	END IF;
	IF jsonb_array_length(p_snapshot -> 'accounts') > 2000
		OR jsonb_array_length(p_snapshot -> 'rooms') > 25
		OR jsonb_array_length(p_snapshot -> 'invitations') > 500
		OR jsonb_array_length(p_snapshot -> 'abuseReports') > 1000
		OR jsonb_array_length(p_snapshot -> 'revokedAccounts') > 10000
		OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_snapshot -> 'rooms') AS r
			WHERE jsonb_typeof(r -> 'participants') IS DISTINCT FROM 'array'
			OR jsonb_typeof(r -> 'explicitMemberEmails') IS DISTINCT FROM 'array') THEN
		RAISE EXCEPTION 'Radio snapshot capacity exceeded';
	END IF;
	IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_snapshot -> 'rooms') AS r
		WHERE jsonb_array_length(r -> 'participants') > 128
		OR jsonb_array_length(r -> 'explicitMemberEmails') > 128) THEN
		RAISE EXCEPTION 'Radio room capacity exceeded';
	END IF;
	UPDATE public.comm_link_state SET snapshot = p_snapshot, version = version + 1,
		lock_owner = NULL, lock_until = NULL, updated_at = clock_timestamp()
	WHERE id = 1 AND lock_owner = p_owner AND version = p_version AND lock_until > clock_timestamp();
	GET DIAGNOSTICS changed = ROW_COUNT;
	IF changed = 1 THEN
		-- Erasure also removes stale copies written by the earlier mirror-only store.
		DELETE FROM public.comm_link_invitations WHERE created_by_user_id IN
			(SELECT entry ->> 0 FROM jsonb_array_elements(p_snapshot -> 'revokedAccounts') AS entry);
		DELETE FROM public.comm_link_memberships WHERE user_id IN
			(SELECT entry ->> 0 FROM jsonb_array_elements(p_snapshot -> 'revokedAccounts') AS entry);
		DELETE FROM public.comm_link_rooms WHERE host_user_id IN
			(SELECT entry ->> 0 FROM jsonb_array_elements(p_snapshot -> 'revokedAccounts') AS entry);
		DELETE FROM public.comm_link_accounts WHERE id IN
			(SELECT entry ->> 0 FROM jsonb_array_elements(p_snapshot -> 'revokedAccounts') AS entry);
		DELETE FROM public.comm_link_rooms WHERE created_at < clock_timestamp() - interval '1 day';
		DELETE FROM public.comm_link_accounts WHERE updated_at < clock_timestamp() - interval '30 days';
		DELETE FROM public.comm_link_abuse_reports WHERE created_at < clock_timestamp() - interval '30 days';
	END IF;
	RETURN changed = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.comm_link_state_release(p_owner uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
	UPDATE public.comm_link_state SET lock_owner = NULL, lock_until = NULL
	WHERE id = 1 AND lock_owner = p_owner;
$$;

REVOKE ALL ON FUNCTION public.comm_link_state_acquire(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.comm_link_state_commit(uuid,bigint,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.comm_link_state_release(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comm_link_state_acquire(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.comm_link_state_commit(uuid,bigint,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.comm_link_state_release(uuid) TO service_role;

-- Legacy mirrors are deliberately not imported into the new authority. Existing
-- reports remain available to the operator until their 30-day retention expires.
