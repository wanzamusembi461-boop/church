/*
# Church Management - Core Tables Part 3 (tables only)

Creates:
- unmatched_transactions, notifications, notification_recipients
- reminders, reminder_recipients, audit_logs
All with RLS enabled. Policies added in part 3b.
*/

CREATE TABLE IF NOT EXISTS unmatched_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sms_message_id uuid NOT NULL REFERENCES sms_messages(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  reference text,
  phone_number text,
  sender_name text,
  provider text,
  transaction_date timestamptz,
  status text NOT NULL DEFAULT 'unmatched' CHECK (status IN ('unmatched','assigned','rejected')),
  assigned_to_member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  assigned_by uuid,
  assigned_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_unmatched_status ON unmatched_transactions(status);
ALTER TABLE unmatched_transactions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  recipient_type text NOT NULL DEFAULT 'all' CHECK (recipient_type IN ('all','selected','category','defaulters','group')),
  category_id uuid REFERENCES contribution_categories(id) ON DELETE SET NULL,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  scheduled_date timestamptz,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('draft','sent','scheduled')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_status ON notifications(status);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS notification_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(notification_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_nr_member ON notification_recipients(member_id);
CREATE INDEX IF NOT EXISTS idx_nr_notif ON notification_recipients(notification_id);
CREATE INDEX IF NOT EXISTS idx_nr_read ON notification_recipients(is_read);
ALTER TABLE notification_recipients ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  template text NOT NULL,
  category_id uuid REFERENCES contribution_categories(id) ON DELETE SET NULL,
  reminder_type text NOT NULL DEFAULT 'upcoming' CHECK (reminder_type IN ('upcoming','missed','partial','outstanding','monthly','special')),
  recipient_type text NOT NULL DEFAULT 'defaulters' CHECK (recipient_type IN ('all','defaulters','selected','category')),
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created','sending','sent','failed')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders(status);
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS reminder_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_id uuid NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  rendered_message text,
  delivery_status text NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending','sent','delivered','failed')),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(reminder_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_rr_member ON reminder_recipients(member_id);
ALTER TABLE reminder_recipients ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_name text,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  before_values jsonb,
  after_values jsonb,
  ip_address text,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;