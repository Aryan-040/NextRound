import { HTMLAttributes } from 'react';
export type BadgeVariant = 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'muted';
export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> { variant?: BadgeVariant; }
const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-bg-raised text-text-primary', accent: 'bg-accent-dim text-accent',
  success: 'bg-[#14532d] text-success', warning: 'bg-[#713f12] text-warning',
  danger:  'bg-[#7f1d1d] text-danger',  muted:   'bg-bg-surface text-text-secondary',
};
export function Badge({ variant = 'default', children, className = '', ...props }: BadgeProps) {
  return (
    <span className={['inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-sans text-xs font-medium whitespace-nowrap', variantClasses[variant], className].filter(Boolean).join(' ')} {...props}>
      {children}
    </span>
  );
}
