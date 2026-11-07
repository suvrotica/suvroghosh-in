-- Migration: COMM-LINK Audio Conferencing & Push-to-Talk (/tools/radio)
-- Stores conferencing accounts (Google OIDC sub), rooms, hashed invitation tokens,
-- participant memberships, speaking leases, and abuse/grievance reports.
-- Strictly isolated from the blog owner's Handwritten Notes tables and auth.
-- All tables enforce Row-Level Security with anon/authenticated access revoked
-- so all room authorization is mediated by the SvelteKit server via service_role.

CREATE TABLE IF NOT EXISTS public.comm_link_accounts (
	id text PRIMARY KEY,
	google_sub text NOT NULL UNIQUE,
	email text NOT NULL,
	display_name text NOT NULL,
	avatar_url text,
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.comm_link_rooms (
	id text PRIMARY KEY,
	slug text NOT NULL,
	name text NOT NULL,
	host_user_id text NOT NULL,
	host_display_name text NOT NULL,
	mode text NOT NULL CHECK (mode IN ('conversation', 'radio')),
	access_policy text NOT NULL CHECK (access_policy IN ('approval_required', 'members_only')),
	is_locked boolean NOT NULL DEFAULT false,
	is_ended boolean NOT NULL DEFAULT false,
	max_participants integer NOT NULL DEFAULT 12 CHECK (max_participants BETWEEN 2 AND 12),
	explicit_member_emails jsonb NOT NULL DEFAULT '[]'::jsonb,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	ended_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.comm_link_invitations (
	id text PRIMARY KEY,
	room_id text NOT NULL REFERENCES public.comm_link_rooms(id) ON DELETE CASCADE,
	token_hash text NOT NULL UNIQUE,
	created_by_user_id text NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	expires_at timestamptz NOT NULL,
	revoked_at timestamptz,
	max_uses integer,
	use_count integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.comm_link_memberships (
	room_id text NOT NULL REFERENCES public.comm_link_rooms(id) ON DELETE CASCADE,
	user_id text NOT NULL,
	display_name text NOT NULL,
	email text NOT NULL,
	role text NOT NULL CHECK (role IN ('host', 'participant')),
	status text NOT NULL CHECK (status IN ('none', 'pending_approval', 'admitted', 'denied', 'removed')),
	is_connected boolean NOT NULL DEFAULT false,
	is_listener_only boolean NOT NULL DEFAULT false,
	is_muted boolean NOT NULL DEFAULT true,
	joined_at timestamptz NOT NULL DEFAULT now(),
	last_seen_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.comm_link_abuse_reports (
	id text PRIMARY KEY,
	reporter_user_id text NOT NULL,
	room_id text,
	target_user_id text,
	reason text NOT NULL CHECK (reason IN ('harassment', 'impersonation', 'spam', 'unauthorised_access', 'privacy', 'other')),
	details text NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comm_link_rooms_host_user_id ON public.comm_link_rooms(host_user_id);
CREATE INDEX IF NOT EXISTS idx_comm_link_invitations_room_id ON public.comm_link_invitations(room_id);
CREATE INDEX IF NOT EXISTS idx_comm_link_memberships_user_id ON public.comm_link_memberships(user_id);

ALTER TABLE public.comm_link_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comm_link_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comm_link_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comm_link_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comm_link_abuse_reports ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.comm_link_accounts FROM anon, authenticated;
REVOKE ALL ON TABLE public.comm_link_rooms FROM anon, authenticated;
REVOKE ALL ON TABLE public.comm_link_invitations FROM anon, authenticated;
REVOKE ALL ON TABLE public.comm_link_memberships FROM anon, authenticated;
REVOKE ALL ON TABLE public.comm_link_abuse_reports FROM anon, authenticated;

GRANT ALL ON TABLE public.comm_link_accounts TO service_role;
GRANT ALL ON TABLE public.comm_link_rooms TO service_role;
GRANT ALL ON TABLE public.comm_link_invitations TO service_role;
GRANT ALL ON TABLE public.comm_link_memberships TO service_role;
GRANT ALL ON TABLE public.comm_link_abuse_reports TO service_role;
