-- Organization admins: allows multiple owners/admins per organization.
-- organizations.owner_id remains for legacy/platform-admin access, but
-- user-facing "org owner" visibility (my-teams, org dashboard) uses this table.
CREATE TABLE IF NOT EXISTS organization_admins (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'owner',
  invited_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_admins_user ON organization_admins(user_id);
CREATE INDEX IF NOT EXISTS idx_org_admins_org ON organization_admins(organization_id);

-- Pending invites for org owners (auto-linked on signup by email)
CREATE TABLE IF NOT EXISTS organization_invites (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  invited_by TEXT,
  accepted_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  accepted_at TEXT,
  UNIQUE(organization_id, email)
);

CREATE INDEX IF NOT EXISTS idx_org_invites_email ON organization_invites(email);
