/*
# Church Management - RLS Policies for Part 3 tables

Adds policies to: unmatched_transactions, notifications, notification_recipients,
reminders, reminder_recipients, audit_logs.
Members can read their own notifications/reminders; admins have full access.
*/

-- unmatched_transactions: admin only
DROP POLICY IF EXISTS "admin_all_unmatched" ON unmatched_transactions;
CREATE POLICY "admin_all_unmatched" ON unmatched_transactions
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM members m WHERE m.user_id = auth.uid() AND m.role IN ('super_admin','treasurer'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM members m WHERE m.user_id = auth.uid() AND m.role IN ('super_admin','treasurer'))
  );

-- notifications
DROP POLICY IF EXISTS "admin_all_notifications" ON notifications;
CREATE POLICY "admin_all_notifications" ON notifications
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM members m WHERE m.user_id = auth.uid() AND m.role IN ('super_admin','treasurer'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM members m WHERE m.user_id = auth.uid() AND m.role IN ('super_admin','treasurer'))
  );

DROP POLICY IF EXISTS "members_select_notifications" ON notifications;
CREATE POLICY "members_select_notifications" ON notifications
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM notification_recipients nr
            JOIN members m ON m.id = nr.member_id
            WHERE nr.notification_id = notifications.id AND m.user_id = auth.uid())
    OR notifications.recipient_type = 'all'
  );

-- notification_recipients
DROP POLICY IF EXISTS "admin_all_nr" ON notification_recipients;
CREATE POLICY "admin_all_nr" ON notification_recipients
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM members m WHERE m.user_id = auth.uid() AND m.role IN ('super_admin','treasurer'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM members m WHERE m.user_id = auth.uid() AND m.role IN ('super_admin','treasurer'))
  );

DROP POLICY IF EXISTS "members_select_own_nr" ON notification_recipients;
CREATE POLICY "members_select_own_nr" ON notification_recipients
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM members m WHERE m.user_id = auth.uid() AND m.id = notification_recipients.member_id)
  );

DROP POLICY IF EXISTS "members_update_own_nr" ON notification_recipients;
CREATE POLICY "members_update_own_nr" ON notification_recipients
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM members m WHERE m.user_id = auth.uid() AND m.id = notification_recipients.member_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM members m WHERE m.user_id = auth.uid() AND m.id = notification_recipients.member_id)
  );

-- reminders
DROP POLICY IF EXISTS "admin_all_reminders" ON reminders;
CREATE POLICY "admin_all_reminders" ON reminders
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM members m WHERE m.user_id = auth.uid() AND m.role IN ('super_admin','treasurer'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM members m WHERE m.user_id = auth.uid() AND m.role IN ('super_admin','treasurer'))
  );

DROP POLICY IF EXISTS "members_select_reminders" ON reminders;
CREATE POLICY "members_select_reminders" ON reminders
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM reminder_recipients rr
            JOIN members m ON m.id = rr.member_id
            WHERE rr.reminder_id = reminders.id AND m.user_id = auth.uid())
  );

-- reminder_recipients
DROP POLICY IF EXISTS "admin_all_rr" ON reminder_recipients;
CREATE POLICY "admin_all_rr" ON reminder_recipients
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM members m WHERE m.user_id = auth.uid() AND m.role IN ('super_admin','treasurer'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM members m WHERE m.user_id = auth.uid() AND m.role IN ('super_admin','treasurer'))
  );

DROP POLICY IF EXISTS "members_select_own_rr" ON reminder_recipients;
CREATE POLICY "members_select_own_rr" ON reminder_recipients
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM members m WHERE m.user_id = auth.uid() AND m.id = reminder_recipients.member_id)
  );

-- audit_logs: admin read, any authenticated insert
DROP POLICY IF EXISTS "admin_all_audit" ON audit_logs;
CREATE POLICY "admin_all_audit" ON audit_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM members m WHERE m.user_id = auth.uid() AND m.role IN ('super_admin','treasurer'))
  );

DROP POLICY IF EXISTS "admin_insert_audit" ON audit_logs;
CREATE POLICY "admin_insert_audit" ON audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);