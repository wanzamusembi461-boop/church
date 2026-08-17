/*
# Fix: Allow self-insert for first admin setup

## Problem
The setup wizard needs to create the first admin member, but RLS INSERT policy
requires an existing admin (chicken-and-egg). This adds a self-insert policy
that allows a user to insert their own member row, but constrains role to 'member'
so users can't self-elevate to admin via this path.

## Security
- INSERT: allows authenticated users to insert a member row for themselves (user_id = auth.uid())
  - role must be 'member' (cannot self-elevate)
- UPDATE: allows updating own row but only if role stays 'member' (cannot self-elevate via update either)
  - The super_admin role upgrade is done via SQL migration or edge function with service role key.
*/

-- Drop the restrictive admin-only insert and add a self-insert fallback
-- Keep admin insert (for importing members) AND add self-insert for setup
-- We already have admin_insert_members. Add self-insert:
DROP POLICY IF EXISTS "self_insert_member" ON members;
CREATE POLICY "self_insert_member" ON members
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND role = 'member');

-- Update the self-update policy to prevent role escalation
DROP POLICY IF EXISTS "members_update_own" ON members;
CREATE POLICY "members_update_own" ON members
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND role = 'member');