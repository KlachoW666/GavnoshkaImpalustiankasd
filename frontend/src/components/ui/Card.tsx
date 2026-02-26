import { HTMLAttributes, forwardRef, ReactNode } from 'react';

type CardVariant = 'default' | 'glass' | 'accent' | 'danger' | 'success' | 'premium';
type CardPadding = 'none' | 'compact' | 'normal' | 'spacious';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: CardPadding;
  hoverable?: boolean;
  glow?: boolean;
  header?: ReactNode;
  footer?: ReactNode;
}

const paddingMap: Record<CardPadding, string> = {
  none: '',
  compact: 'p-3 sm:p-4',
  normal: 'p-4 sm:p-5',
  spacious: 'p-5 sm:p-6',
};

const variantStyles: Record<CardVariant, React.CSSProperties> = {
  default: {
    background: 'var(--bg-glass)',
    border: 'var(--border-input)',
    backdropFilter: 'blur(var(--glass-blur))',
    WebkitBackdropFilter: 'blur(var(--glass-blur))',
  },
  glass: {
    background: 'var(--bg-glass-strong)',
    border: '1px solid rgba(255,255,255,0.06)',
    backdropFilter: 'blur(var(--glass-blur-strong))',
    WebkitBackdropFilter: 'blur(var(--glass-blur-strong))',
    boxShadow: 'var(--shadow-sm)',
  },
  accent: {
    background: 'linear-gradient(145deg, rgba(255, 199, 0, 0.05) 0%, var(--bg-card) 100%)',
    border: '1px solid var(--border)',
    borderTop: '2px solid var(--accent)',
    backdropFilter: 'blur(var(--glass-blur))',
    WebkitBackdropFilter: 'blur(var(--glass-blur))',
  },
  danger: {
    background: 'linear-gradient(145deg, rgba(255, 23, 68, 0.05) 0%, var(--bg-card) 100%)',
    border: '1px solid var(--border)',
    borderTop: '2px solid var(--danger)',
    backdropFilter: 'blur(var(--glass-blur))',
    WebkitBackdropFilter: 'blur(var(--glass-blur))',
  },
  success: {
    background: 'linear-gradient(145deg, rgba(0, 230, 118, 0.05) 0%, var(--bg-card) 100%)',
    border: '1px solid var(--border)',
    borderTop: '2px solid var(--success)',
    backdropFilter: 'blur(var(--glass-blur))',
    WebkitBackdropFilter: 'blur(var(--glass-blur))',
  },
  premium: {
    background: 'linear-gradient(145deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.01) 100%)',
    border: '1px solid var(--border-accent)',
    backdropFilter: 'blur(var(--glass-blur-strong))',
    WebkitBackdropFilter: 'blur(var(--glass-blur-strong))',
    boxShadow: 'var(--shadow-glow)',
  },
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'default', padding = 'normal', hoverable = false, glow = false, header, footer, className = '', children, style, ...rest }, ref) => {
    const baseStyle: React.CSSProperties = {
      borderRadius: 'var(--radius)',
      transition: 'all 0.15s ease-in-out',
      position: 'relative',
      overflow: 'hidden',
      ...variantStyles[variant],
      ...(hoverable && {
        cursor: 'pointer',
      }),
      ...(glow && {
        boxShadow: variant === 'accent' || variant === 'premium' ? 'var(--shadow-glow)' : variant === 'danger' ? 'var(--shadow-glow-danger)' : 'var(--shadow-glow-success)',
      }),
      ...style,
    };

    return (
      <div
        ref={ref}
        className={`${paddingMap[padding]} ${hoverable ? 'hover-lift' : ''} ${className}`}
        style={baseStyle}
        {...rest}
      >
        {header && (
          <div className="mb-4 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
            {header}
          </div>
        )}
        {children}
        {footer && (
          <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
            {footer}
          </div>
        )}
      </div>
    );
  }
);
Card.displayName = 'Card';

export function StatCard({
  label,
  value,
  change,
  icon,
  variant = 'default'
}: {
  label: string;
  value: string | number;
  change?: number;
  icon?: ReactNode;
  variant?: CardVariant;
}) {
  return (
    <Card variant={variant} hoverable>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="stat-card-label">{label}</p>
          <p className="stat-card-value" style={{ color: variant === 'success' ? 'var(--success)' : variant === 'danger' ? 'var(--danger)' : 'var(--text-primary)' }}>
            {value}
          </p>
          {change !== undefined && (
            <p className={`text-sm mt-1 font-medium`} style={{ color: change >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {change >= 0 ? '+' : ''}{change.toFixed(2)}%
            </p>
          )}
        </div>
        {icon && (
          <div className="p-2 rounded-lg" style={{ background: 'var(--bg-hover)' }}>
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}
