/*
# Church Management - Core Tables Part 2

## Tables
- contribution_categories: Contribution types (welfare, development, building fund, etc) with frequency, targets, defaulter rules, reminder config
- contribution_requirements: Per-member expected contribution amounts per category (drives defaulter calculation)
- sms_messages: Raw SMS storage + parsed fields + processing status (pending/processed/pending_review/failed/duplicate/unmatched)
- transactions: Financial transactions from SMS processing. Immutable (reversals not deletes). Unique on reference for dedup.
- transaction_reversals: Audit record of reversed transactions with reasons

## Security
- RLS enabled on all tables.
- Members can read active categories and own requirements/transactions.
- Admins have full access to all.
*/

CREATE TABLE IF NOT EXISTS contribution_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  target_amount numeric(12,2) DEFAULT 0,
  frequency text NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('one_time','daily','weekly','monthly','quarterly','annual')),
  minimum_amount numeric(12,2) DEFAULT 0,
  monthly_requirement numeric(12,2) DEFAULT 0,
  start_date date,
  end_date date,
  is_active boolean NOT NULL DEFAULT true,
  defaulter_grace_days integer DEFAULT 7,
  reminder_days_before integer DEFAULT 3,
  reminder_enabled boolean NOT NULL DEFAULT true,
  reminder_template text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_categories_active ON contribution_categories(is_active);
ALTER TABLE contribution_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_categories" ON contribution_categories;
CREATE POLICY "admin_all_categories" ON contribution_categories
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM members m WHERE m.user_id = auth.uid() AND m.role IN ('super_admin','treasurer'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM members m WHERE m.user_id = auth.uid() AND m.role IN ('super_admin','treasurer'))
  );

DROP POLICY IF EXISTS "members_select_categories" ON contribution_categories;
CREATE POLICY "members_select_categories" ON contribution_categories
  FOR SELECT TO authenticated
  USING (is_active = true);

CREATE TABLE IF NOT EXISTS contribution_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES contribution_categories(id) ON DELETE CASCADE,
  expected_amount numeric(12,2) NOT NULL DEFAULT 0,
  due_date date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(member_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_req_member ON contribution_requirements(member_id);
CREATE INDEX IF NOT EXISTS idx_req_category ON contribution_requirements(category_id);
ALTER TABLE contribution_requirements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_requirements" ON contribution_requirements;
CREATE POLICY "admin_all_requirements" ON contribution_requirements
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM members m WHERE m.user_id = auth.uid() AND m.role IN ('super_admin','treasurer'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM members m WHERE m.user_id = auth.uid() AND m.role IN ('super_admin','treasurer'))
  );

DROP POLICY IF EXISTS "members_select_own_requirements" ON contribution_requirements;
CREATE POLICY "members_select_own_requirements" ON contribution_requirements
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM members m WHERE m.user_id = auth.uid() AND m.id = contribution_requirements.member_id)
  );

CREATE TABLE IF NOT EXISTS sms_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_text text NOT NULL,
  sender text,
  recipient text,
  device_id text,
  received_at timestamptz NOT NULL DEFAULT now(),
  parsed_amount numeric(12,2),
  parsed_reference text,
  parsed_phone text,
  parsed_name text,
  parsed_date timestamptz,
  parsed_provider text,
  processing_status text NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending','processed','pending_review','failed','duplicate','unmatched')),
  transaction_id uuid,
  member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_status ON sms_messages(processing_status);
CREATE INDEX IF NOT EXISTS idx_sms_reference ON sms_messages(parsed_reference);
CREATE INDEX IF NOT EXISTS idx_sms_phone ON sms_messages(parsed_phone);
CREATE INDEX IF NOT EXISTS idx_sms_member ON sms_messages(member_id);
ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_sms" ON sms_messages;
CREATE POLICY "admin_all_sms" ON sms_messages
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM members m WHERE m.user_id = auth.uid() AND m.role IN ('super_admin','treasurer'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM members m WHERE m.user_id = auth.uid() AND m.role IN ('super_admin','treasurer'))
  );

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  category_id uuid REFERENCES contribution_categories(id) ON DELETE SET NULL,
  sms_message_id uuid REFERENCES sms_messages(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL,
  reference text,
  provider text,
  transaction_date timestamptz,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','reversed','pending')),
  matched_by text DEFAULT 'sms_auto' CHECK (matched_by IN ('sms_auto','manual')),
  manually_assigned_by uuid,
  manually_assigned_at timestamptz,
  corrected_by uuid,
  corrected_at timestamptz,
  correction_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tx_member ON transactions(member_id);
CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_tx_reference ON transactions(reference);
CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_tx_status ON transactions(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_reference_unique ON transactions(reference) WHERE reference IS NOT NULL;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members_select_own_tx" ON transactions;
CREATE POLICY "members_select_own_tx" ON transactions
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM members m WHERE m.user_id = auth.uid() AND m.id = transactions.member_id)
  );

DROP POLICY IF EXISTS "admin_select_all_tx" ON transactions;
CREATE POLICY "admin_select_all_tx" ON transactions
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM members m WHERE m.user_id = auth.uid() AND m.role IN ('super_admin','treasurer'))
  );

DROP POLICY IF EXISTS "admin_insert_tx" ON transactions;
CREATE POLICY "admin_insert_tx" ON transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM members m WHERE m.user_id = auth.uid() AND m.role IN ('super_admin','treasurer'))
  );

DROP POLICY IF EXISTS "admin_update_tx" ON transactions;
CREATE POLICY "admin_update_tx" ON transactions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM members m WHERE m.user_id = auth.uid() AND m.role IN ('super_admin','treasurer'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM members m WHERE m.user_id = auth.uid() AND m.role IN ('super_admin','treasurer'))
  );

CREATE TABLE IF NOT EXISTS transaction_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
  reversed_by uuid NOT NULL,
  reversal_reason text NOT NULL,
  reversed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reversal_tx ON transaction_reversals(transaction_id);
ALTER TABLE transaction_reversals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_reversals" ON transaction_reversals;
CREATE POLICY "admin_all_reversals" ON transaction_reversals
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM members m WHERE m.user_id = auth.uid() AND m.role IN ('super_admin','treasurer'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM members m WHERE m.user_id = auth.uid() AND m.role IN ('super_admin','treasurer'))
  );