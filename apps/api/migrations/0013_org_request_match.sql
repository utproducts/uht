-- Track when an organization request matches an org that already exists,
-- so admins can approve-and-merge instead of creating a duplicate.
ALTER TABLE organization_requests ADD COLUMN matched_org_id TEXT;
