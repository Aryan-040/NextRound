import { ButtonHTMLAttributes, forwardRef } from 'react';
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean; }
const variantClasses: Record<ButtonVariant, string> = {
  primary:   'bg-accent text-bg-base font-medium hover:bg-[#7AAAF4] focus-visible:ring-accent disabled:bg-accent-dim disabled:text-text-secondary',
  secondary: 'bg-bg-raised text-text-primary border border-bg-raised hover:border-accent hover:text-accent focus-visible:ring-accent',
  ghost:     'bg-transparent text-text-secondary hover:text-text-primary hover:bg-bg-raised focus-visible:ring-accent',
  danger:    'bg-transparent text-danger border border-danger hover:bg-danger hover:text-bg-base focus-visible:ring-danger',
};
const sizeClasses: Record<ButtonSize, string> = { sm: 'px-3 py-1.5 text-sm rounded', md: 'px-4 py-2 text-sm rounded-md', lg: 'px-6 py-3 text-base rounded-md' };
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading = false, disabled, children, className = '', ...props }, ref) => (
    <button ref={ref} disabled={disabled || loading}
      className={['inline-flex items-center justify-center gap-2 font-sans transition-colors duration-150',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base',
        'disabled:pointer-events-none disabled:opacity-50', variantClasses[variant], sizeClasses[size], className].filter(Boolean).join(' ')} {...props}>
      {loading && <svg className="animate-spin h-4 w-4 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>}
      {children}
    </button>
  )
);
Button.displayName = 'Button';
