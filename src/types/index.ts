export interface Member {
  id: string;
  user_id: string | null;
  full_name: string;
  phone_number: string;
  email: string | null;
  role: 'super_admin' | 'treasurer' | 'member';
  is_active: boolean;
  password_changed: boolean;
  date_registered: string;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChurchSettings {
  id: string;
  church_name: string | null;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  about: string | null;
  setup_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminSettings {
  id: string;
  sms_api_key_encrypted: string | null;
  sms_provider: string;
  sms_sender_id: string | null;
  sms_parsing_config: Record<string, unknown>;
  password_min_length: number;
  session_timeout_minutes: number;
  currency: string;
}

export interface ContributionCategory {
  id: string;
  name: string;
  description: string | null;
  target_amount: number;
  frequency: 'one_time' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';
  minimum_amount: number;
  monthly_requirement: number;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  defaulter_grace_days: number;
  reminder_days_before: number;
  reminder_enabled: boolean;
  reminder_template: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContributionRequirement {
  id: string;
  member_id: string;
  category_id: string;
  expected_amount: number;
  due_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  member_id: string | null;
  category_id: string | null;
  sms_message_id: string | null;
  amount: number;
  reference: string | null;
  provider: string | null;
  transaction_date: string | null;
  status: 'completed' | 'reversed' | 'pending';
  matched_by: 'sms_auto' | 'manual';
  manually_assigned_by: string | null;
  manually_assigned_at: string | null;
  corrected_by: string | null;
  corrected_at: string | null;
  correction_reason: string | null;
  created_at: string;
  updated_at: string;
  member?: Member | null;
  category?: ContributionCategory | null;
}

export interface SmsMessage {
  id: string;
  raw_text: string;
  sender: string | null;
  recipient: string | null;
  device_id: string | null;
  received_at: string;
  parsed_amount: number | null;
  parsed_reference: string | null;
  parsed_phone: string | null;
  parsed_name: string | null;
  parsed_date: string | null;
  parsed_provider: string | null;
  processing_status: 'pending' | 'processed' | 'pending_review' | 'failed' | 'duplicate' | 'unmatched';
  transaction_id: string | null;
  member_id: string | null;
  error_message: string | null;
  created_at: string;
}

export interface UnmatchedTransaction {
  id: string;
  sms_message_id: string;
  amount: number;
  reference: string | null;
  phone_number: string | null;
  sender_name: string | null;
  provider: string | null;
  transaction_date: string | null;
  status: 'unmatched' | 'assigned' | 'rejected';
  assigned_to_member_id: string | null;
  assigned_by: string | null;
  assigned_at: string | null;
  rejection_reason: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  recipient_type: 'all' | 'selected' | 'category' | 'defaulters' | 'group';
  category_id: string | null;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  scheduled_date: string | null;
  status: 'draft' | 'sent' | 'scheduled';
  created_by: string | null;
  created_at: string;
  recipients?: NotificationRecipient[];
}

export interface NotificationRecipient {
  id: string;
  notification_id: string;
  member_id: string;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  member?: Member;
}

export interface Reminder {
  id: string;
  title: string;
  template: string;
  category_id: string | null;
  reminder_type: 'upcoming' | 'missed' | 'partial' | 'outstanding' | 'monthly' | 'special';
  recipient_type: 'all' | 'defaulters' | 'selected' | 'category';
  status: 'created' | 'sending' | 'sent' | 'failed';
  created_by: string | null;
  created_at: string;
  category?: ContributionCategory | null;
}

export interface ReminderRecipient {
  id: string;
  reminder_id: string;
  member_id: string;
  rendered_message: string | null;
  delivery_status: 'pending' | 'sent' | 'delivered' | 'failed';
  sent_at: string | null;
  created_at: string;
  member?: Member;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  before_values: Record<string, unknown> | null;
  after_values: Record<string, unknown> | null;
  ip_address: string | null;
  details: string | null;
  created_at: string;
}

export interface TransactionReversal {
  id: string;
  transaction_id: string;
  reversed_by: string;
  reversal_reason: string;
  reversed_at: string;
}
