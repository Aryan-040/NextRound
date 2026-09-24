import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from 'react';
const base = 'w-full bg-bg-raised text-text-primary placeholder:text-text-secondary border border-bg-raised rounded-md px-3 py-2 font-sans text-sm transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-bg-base disabled:opacity-50 disabled:pointer-events-none';
const errCls = 'border-danger focus-visible:ring-danger';
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> { error?: boolean; errorMessage?: string; label?: string; hint?: string; }
export const Input = forwardRef<HTMLInputElement, InputProps>(({ label, error, errorMessage, hint, id, className = '', ...props }, ref) => {
  const fieldId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label htmlFor={fieldId} className="text-sm font-medium text-text-primary">{label}</label>}
      <input ref={ref} id={fieldId} aria-invalid={error ? 'true' : undefined} className={[base, error ? errCls : '', className].filter(Boolean).join(' ')} {...props} />
      {errorMessage && <p role="alert" className="text-xs text-danger">{errorMessage}</p>}
      {!errorMessage && hint && <p className="text-xs text-text-secondary">{hint}</p>}
    </div>
  );
});
Input.displayName = 'Input';
export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> { error?: boolean; errorMessage?: string; label?: string; hint?: string; }
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({ label, error, errorMessage, hint, id, className = '', ...props }, ref) => {
  const fieldId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label htmlFor={fieldId} className="text-sm font-medium text-text-primary">{label}</label>}
      <textarea ref={ref} id={fieldId} aria-invalid={error ? 'true' : undefined} className={[base, 'resize-y min-h-[120px]', error ? errCls : '', className].filter(Boolean).join(' ')} {...props} />
      {errorMessage && <p role="alert" className="text-xs text-danger">{errorMessage}</p>}
      {!errorMessage && hint && <p className="text-xs text-text-secondary">{hint}</p>}
    </div>
  );
});
Textarea.displayName = 'Textarea';
