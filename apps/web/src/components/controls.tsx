import { useEffect, useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { formatDateOnly, parseDisplayDate } from '@nursery/domain';
import { Icon, type IconName } from './Icon.js';

export function Button({ children, icon, variant = 'primary', className = '', ...props }: Readonly<{
  children: ReactNode;
  icon?: IconName;
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
}> & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={`button button--${variant} ${className}`} {...props}>{icon && <Icon name={icon} />}{children}</button>;
}

type FieldFrameProps = Readonly<{
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}>;

function FieldFrame({ id, label, hint, error, required, children }: FieldFrameProps) {
  return (
    <div className={`field ${error ? 'field--invalid' : ''}`}>
      <label className="field__label" htmlFor={id}>{label}{required && <span className="field__required" aria-hidden="true"> *</span>}</label>
      {children}
      {hint && !error && <div className="field__hint" id={`${id}-hint`}>{hint}</div>}
      {error && <div className="field__error" id={`${id}-error`}><Icon name="warning" />{error}</div>}
    </div>
  );
}

export function TextField({ label, hint, error, id: suppliedId, required, ...props }: Readonly<{
  label: string;
  hint?: string;
  error?: string;
}> & InputHTMLAttributes<HTMLInputElement>) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return <FieldFrame id={id} label={label} hint={hint} error={error} required={required}>
    <input className="field__control" id={id} required={required} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...props} />
  </FieldFrame>;
}

export function SelectField({ label, hint, error, children, id: suppliedId, required, ...props }: Readonly<{
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}> & SelectHTMLAttributes<HTMLSelectElement>) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return <FieldFrame id={id} label={label} hint={hint} error={error} required={required}>
    <select className="field__control" id={id} required={required} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...props}>{children}</select>
  </FieldFrame>;
}

export function DateField({ label, hint, error, value, onValueChange, id: suppliedId, required }: Readonly<{
  label: string;
  hint?: string;
  error?: string;
  value: string;
  onValueChange: (isoDate: string) => void;
  id?: string;
  required?: boolean;
}>) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  const [displayValue, setDisplayValue] = useState(() => value ? formatDateOnly(value) : '');

  useEffect(() => setDisplayValue(value ? formatDateOnly(value) : ''), [value]);

  return <FieldFrame id={id} label={label} hint={hint} error={error} required={required}>
    <input
      className="field__control field__control--date"
      id={id}
      inputMode="numeric"
      autoComplete="off"
      placeholder="dd/MM/yyyy"
      value={displayValue}
      required={required}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
      onChange={(event) => {
        const nextDisplay = event.target.value;
        setDisplayValue(nextDisplay);
        const parsed = parseDisplayDate(nextDisplay);
        if (parsed) onValueChange(parsed);
        else if (!nextDisplay) onValueChange('');
      }}
    />
  </FieldFrame>;
}

export function ErrorSummary({ title, errors }: Readonly<{ title: string; errors: ReadonlyArray<Readonly<{ fieldId: string; message: string }>> }>) {
  if (errors.length === 0) return null;
  return <div className="error-summary" role="alert" tabIndex={-1}><strong>{title}</strong><ul>{errors.map((error) => <li key={error.fieldId}><a href={`#${error.fieldId}`}>{error.message}</a></li>)}</ul></div>;
}
