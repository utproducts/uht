-- The admin org tools (bulk-import, merge-org) create organizations with
-- owner_id = 'system_migration_user' (real ownership lives in organization_admins).
-- organizations.owner_id has a FK to users(id), so that placeholder user must exist.
INSERT OR IGNORE INTO users (id, email, password_hash, first_name, last_name, created_at)
VALUES ('system_migration_user', 'system@ultimatetournaments.com', 'LOCKED-no-login-system-placeholder-account', 'System', 'Placeholder', datetime('now'));
