import { SVGAttributes } from 'react';
export type SpinnerSize = 'sm' | 'md' | 'lg';
export interface SpinnerProps extends SVGAttributes<SVGElement> { size?: SpinnerSize; label?: string; }
const sizeMap: Record<SpinnerSize, string> = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-8 w-8' };
export function Spinner({ size = 'md', label = 'Loading…', className = '', ...props }: SpinnerProps) {
  return (
    <span role="status" aria-label={label} className="inline-flex">
      <svg className={['animate-spin text-accent', sizeMap[size], className].filter(Boolean).join(' ')} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true" {...props}>
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}
