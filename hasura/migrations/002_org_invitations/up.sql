-- ============================================================
-- MIGRATION 002 — Org Invitations
-- Tracks pending invitations sent to emails before they sign up
-- ============================================================

CREATE TABLE public.org_invitations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email       TEXT        NOT NULL,
  role        TEXT        NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'editor', 'viewer')),
  invited_by  UUID        NOT NULL,   -- auth.users.id of the inviter (no FK needed; user may be deleted)
  token       UUID        NOT NULL DEFAULT gen_random_uuid(),
  status      TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  UNIQUE (org_id, email)               -- one pending invite per email per org
);

COMMENT ON TABLE public.org_invitations IS 'Pending email invitations to join an organization. Accepted when the invitee logs in and visits the accept link.';
COMMENT ON COLUMN public.org_invitations.token IS 'UUID token embedded in the magic-link accept URL.';
COMMENT ON COLUMN public.org_invitations.status IS 'pending | accepted | declined | expired';

CREATE INDEX idx_org_invitations_token  ON public.org_invitations (token);
CREATE INDEX idx_org_invitations_org_id ON public.org_invitations (org_id);
CREATE INDEX idx_org_invitations_email  ON public.org_invitations (email);
