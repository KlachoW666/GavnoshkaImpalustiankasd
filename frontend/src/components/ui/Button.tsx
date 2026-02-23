import { ButtonHTMLAttributes, forwardRef, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success' | 'outline';
type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: ReactNode;
  iconPosition?: 'left' | 'right';
}

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: 'var(--accent-gradient)',
    color: '#000',
    border: 'none',
    boxShadow: '0 4px 14px var(--accent-glow)',
  },
  secondary: {
    background: 'var(--bg-hover)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border)',
  },
  danger: {
    background: 'var(--gradient-danger)',
    color: '#fff',
    border: 'none',
    boxShadow: '0 4px 14px var(--danger-glow)',
  },
  success: {
    background: 'var(--gradient-success)',
    color: '#fff',
    border: 'none',
    boxShadow: '0 4px 14px var(--success-glow)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--text-secondary)',
    border: 'none',
  },
  outline: {
    background: 'transparent',
    color: 'var(--accent)',
    border: '1px solid var(--accent)',
  },
};

const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
  sm: { padding: '6px 12px', fontSize: '12px', borderRadius: 'var(--radius)' },
  md: { padding: '10px 18px', fontSize: '14px', borderRadius: 'var(--radius-md)' },
  lg: { padding: '12px 24px', fontSize: '15px', borderRadius: 'var(--radius-lg)' },
  xl: { padding: '14px 32px', fontSize: '16px', borderRadius: 'var(--radius-xl)' },
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, fullWidth, icon, iconPosition = 'left', className = '', children, disabled, style, ...rest }, ref) => {
    const baseStyle: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      fontWeight: 600,
      cursor: disabled || loading ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      width: fullWidth ? '100%' : 'auto',
      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      position: 'relative' as const,
      overflow: 'hidden',
      ...sizeStyles[size],
      ...variantStyles[variant],
      ...style,
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`focus-ring hover-lift ${className}`}
        style={baseStyle}
        {...rest}
      >
        {loading && (
          <svg className="animate-spin-slow" style={{ width: size === 'sm' ? 14 : 16, height: size === 'sm' ? 14 : 16 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
          </svg>
        )}
        {!loading && icon && iconPosition === 'left' && icon}
        {children}
        {!loading && icon && iconPosition === 'right' && icon}
      </button>
    );
  }
);
Button.displayName = 'Button';
