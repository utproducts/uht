-- Test/sandbox events: excluded from every aggregate tally via this flag
-- (previously excluded by the name prefix 'claude-test%')
ALTER TABLE events ADD COLUMN is_test INTEGER DEFAULT 0;
