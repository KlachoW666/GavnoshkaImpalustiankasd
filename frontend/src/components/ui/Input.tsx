import { InputHTMLAttributes, forwardRef, ReactNode } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  variant?: 'default' | 'glass';
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, icon, iconPosition = 'left', fullWidth = true, variant = 'default', className = '', style, ...rest }, ref) => {
    const inputStyle: React.CSSProperties = {
      background: variant === 'glass' ? 'rgba(255, 255, 255, 0.03)' : 'var(--bg-hover)',
      border: `1px solid ${error ? 'var(--danger)' : 'var(--border)'}`,
      borderRadius: 'var(--radius-md)',
      color: 'var(--text-primary)',
      padding: icon && iconPosition === 'left' ? '12px 16px 12px 44px' : icon && iconPosition === 'right' ? '12px 44px 12px 16px' : '12px 16px',
      width: fullWidth ? '100%' : 'auto',
      fontSize: '14px',
      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      outline: 'none',
      ...style,
    };

    return (
      <div className={fullWidth ? 'w-full' : ''}>
        {label && (
          <label className="block text-xs font-medium mb-2 uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            {label}
          </label>
        )}
        <div className="relative">
          {icon && iconPosition === 'left' && (
            <span className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
              {icon}
            </span>
          )}
          <input
            ref={ref}
            className={`focus-ring ${className}`}
            style={inputStyle}
            onFocus={(e) => {
              e.target.style.borderColor = error ? 'var(--danger)' : 'var(--accent)';
              e.target.style.boxShadow = `0 0 0 3px ${error ? 'var(--danger-dim)' : 'var(--accent-dim)'}`;
            }}
            onBlur={(e) => {
              e.target.style.borderColor = error ? 'var(--danger)' : 'var(--border)';
              e.target.style.boxShadow = 'none';
            }}
            {...rest}
          />
          {icon && iconPosition === 'right' && (
            <span className="absolute right-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
              {icon}
            </span>
          )}
        </div>
        {error && (
          <p className="mt-2 text-xs font-medium flex items-center gap-1.5" style={{ color: 'var(--danger)' }}>
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {error}
          </p>
        )}
        {hint && !error && (
          <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>{hint}</p>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, {
  label?: string;
  error?: string;
  hint?: string;
  fullWidth?: boolean;
  rows?: number;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ label, error, hint, fullWidth = true, rows = 4, className = '', style, ...rest }, ref) => {
    const textareaStyle: React.CSSProperties = {
      background: 'var(--bg-hover)',
      border: `1px solid ${error ? 'var(--danger)' : 'var(--border)'}`,
      borderRadius: 'var(--radius-md)',
      color: 'var(--text-primary)',
      padding: '12px 16px',
      width: fullWidth ? '100%' : 'auto',
      fontSize: '14px',
      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      outline: 'none',
      resize: 'vertical',
      minHeight: `${rows * 24 + 24}px`,
      ...style,
    };

    return (
      <div className={fullWidth ? 'w-full' : ''}>
        {label && (
          <label className="block text-xs font-medium mb-2 uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          className={`focus-ring ${className}`}
          style={textareaStyle}
          rows={rows}
          onFocus={(e) => {
            e.target.style.borderColor = error ? 'var(--danger)' : 'var(--accent)';
            e.target.style.boxShadow = `0 0 0 3px ${error ? 'var(--danger-dim)' : 'var(--accent-dim)'}`;
          }}
          onBlur={(e) => {
            e.target.style.borderColor = error ? 'var(--danger)' : 'var(--border)';
            e.target.style.boxShadow = 'none';
          }}
          {...rest}
        />
        {error && (
          <p className="mt-2 text-xs font-medium" style={{ color: 'var(--danger)' }}>{error}</p>
        )}
        {hint && !error && (
          <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>{hint}</p>
        )}
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';
