/*
# Church Management - Core Tables Part 1

## Tables
- church_settings: Church profile info (name, logo, address, contact, setup status)
- admin_settings: System config (SMS API, password policy, session timeout, currency)
- members: Church members linked to auth.users. Phone = username. Role-based (super_admin/treasurer/member). Tracks password_changed flag for first-login enforcement.

## Security
- RLS enabled on all tables.
- Admin-only access for church_settings and admin_settings.
- Members can read/update own profile; admins have full access to all members.
*/

CREATE TABLE IF NOT EXISTS church_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_name text,
  logo_url text,
  address text,
  phone text,
  email text,
  website text,
  about text,
  setup_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE church_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS admin_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sms_api_key_encrypted text,
  sms_provider text DEFAULT 'forwarder',
  sms_sender_id text,
  sms_parsing_config jsonb DEFAULT '{}'::jsonb,
  password_min_length integer DEFAULT 8,
  session_timeout_minutes integer DEFAULT 60,
  currency text DEFAULT 'KES',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone_number text NOT NULL UNIQUE,
  email text,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('super_admin','treasurer','member')),
  is_active boolean NOT NULL DEFAULT true,
  password_changed boolean NOT NULL DEFAULT false,
  date_registered timestamptz NOT NULL DEFAULT now(),
  last_login timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_members_user_id ON members(user_id);
CREATE INDEX IF NOT EXISTS idx_members_phone ON members(phone_number);
CREATE INDEX IF NOT EXISTS idx_members_role ON members(role);
CREATE INDEX IF NOT EXISTS idx_members_active ON members(is_active);

ALTER TABLE members ENABLE ROW LEVEL SECURITY;

-- members: self access
DROP POLICY IF EXISTS "members_select_own" ON members;
CREATE POLICY "members_select_own" ON members
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "members_update_own" ON members;
CREATE POLICY "members_update_own" ON members
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- members: admin full access
DROP POLICY IF EXISTS "admin_select_all_members" ON members;
CREATE POLICY "admin_select_all_members" ON members
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM members m WHERE m.user_id = auth.uid() AND m.role IN ('super_admin','treasurer'))
  );

DROP POLICY IF EXISTS "admin_insert_members" ON members;
CREATE POLICY "admin_insert_members" ON members
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM members m WHERE m.user_id = auth.uid() AND m.role IN ('super_admin','treasurer'))
  );

DROP POLICY IF EXISTS "admin_update_members" ON members;
CREATE POLICY "admin_update_members" ON members
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM members m WHERE m.user_id = auth.uid() AND m.role IN ('super_admin','treasurer'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM members m WHERE m.user_id = auth.uid() AND m.role IN ('super_admin','treasurer'))
  );

DROP POLICY IF EXISTS "admin_delete_members" ON members;
CREATE POLICY "admin_delete_members" ON members
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM members m WHERE m.user_id = auth.uid() AND m.role IN ('super_admin','treasurer'))
  );

-- church_settings: admin-only (now members table exists)
DROP POLICY IF EXISTS "admin_all_church_settings" ON church_settings;
CREATE POLICY "admin_all_church_settings" ON church_settings
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM members m WHERE m.user_id = auth.uid() AND m.role IN ('super_admin','treasurer'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM members m WHERE m.user_id = auth.uid() AND m.role IN ('super_admin','treasurer'))
  );

-- admin_settings: admin-only
DROP POLICY IF EXISTS "admin_all_admin_settings" ON admin_settings;
CREATE POLICY "admin_all_admin_settings" ON admin_settings
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM members m WHERE m.user_id = auth.uid() AND m.role IN ('super_admin','treasurer'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM members m WHERE m.user_id = auth.uid() AND m.role IN ('super_admin','treasurer'))
  );

-- updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;