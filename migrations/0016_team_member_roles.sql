PRAGMA foreign_keys = ON;

-- Normalize team_members.role to the enum {owner, admin, member}.
-- Anything outside that set falls back to 'member' (least-privileged).
-- The 'admin' tier is introduced here; existing data only has owner/member,
-- so this UPDATE is a no-op against clean databases but cleans up any stray
-- casing or unknown values that may have leaked in over time.
UPDATE team_members
SET role = 'member'
WHERE role NOT IN ('owner', 'admin', 'member');
