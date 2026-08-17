import { type ReactNode } from 'react';

interface BadgeProps {
  variant?: 'success' | 'warning' | 'error' | 'info' | 'neutral';
  children: ReactNode;
}

export function Badge({ variant = 'neutral', children }: BadgeProps) {
  const variants = {
    success: 'badge-success',
    warning: 'badge-warning',
    error: 'badge-error',
    info: 'badge-info',
    neutral: 'badge-neutral',
  };
  return <span className={variants[variant]}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: BadgeProps['variant']; label: string }> = {
    completed: { variant: 'success', label: 'Completed' },
    processed: { variant: 'success', label: 'Processed' },
    sent: { variant: 'success', label: 'Sent' },
    delivered: { variant: 'success', label: 'Delivered' },
    active: { variant: 'success', label: 'Active' },
    assigned: { variant: 'success', label: 'Assigned' },
    pending: { variant: 'warning', label: 'Pending' },
    pending_review: { variant: 'warning', label: 'Pending Review' },
    draft: { variant: 'neutral', label: 'Draft' },
    scheduled: { variant: 'info', label: 'Scheduled' },
    created: { variant: 'info', label: 'Created' },
    sending: { variant: 'warning', label: 'Sending' },
    reversed: { variant: 'error', label: 'Reversed' },
    failed: { variant: 'error', label: 'Failed' },
    rejected: { variant: 'error', label: 'Rejected' },
    duplicate: { variant: 'warning', label: 'Duplicate' },
    unmatched: { variant: 'warning', label: 'Unmatched' },
    inactive: { variant: 'neutral', label: 'Inactive' },
  };
  const cfg = map[status] || { variant: 'neutral' as const, label: status };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}
