/*
# Fix: Allow public read of church settings and admin existence check

## Problem
The RootRedirect component needs to check if setup is complete (church_settings.setup_completed 
and whether a super_admin exists). But RLS blocks unauthenticated reads, so it always 
thinks setup hasn't been done and keeps redirecting to /setup.

## Fix
- Allow public (anon, authenticated) SELECT on church_settings — this is just church info 
  (name, address, phone, email) and the setup_completed flag. Not sensitive.
- Allow public SELECT on members but ONLY for the purpose of checking if super_admin exists.
  We do this by allowing anon to read members where role = 'super_admin' (just to check existence).
*/

-- Allow public read of church_settings (church info is public)
DROP POLICY IF EXISTS "public_read_church_settings" ON church_settings;
CREATE POLICY "public_read_church_settings" ON church_settings
  FOR SELECT TO anon, authenticated
  USING (true);

-- Keep admin write access (already exists, but ensure it's there)
-- admin_all_church_settings already covers all operations for authenticated admins

-- Allow public to check if a super_admin exists (needed for setup detection)
DROP POLICY IF EXISTS "public_check_admin_exists" ON members;
CREATE POLICY "public_check_admin_exists" ON members
  FOR SELECT TO anon, authenticated
  USING (role = 'super_admin');