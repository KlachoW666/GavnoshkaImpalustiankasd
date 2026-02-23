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
    background: 'var(--bg-card-solid)',
    border: '1px solid var(--border)',
  },
  glass: {
    background: 'rgba(255, 255, 255, 0.03)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid var(--border)',
  },
  accent: {
    background: 'linear-gradient(145deg, var(--accent-dim) 0%, var(--bg-card-solid) 50%)',
    border: '1px solid var(--border-accent)',
    borderLeft: '3px solid var(--accent)',
  },
  danger: {
    background: 'linear-gradient(145deg, var(--danger-dim) 0%, var(--bg-card-solid) 50%)',
    border: '1px solid rgba(255, 71, 87, 0.3)',
    borderLeft: '3px solid var(--danger)',
  },
  success: {
    background: 'linear-gradient(145deg, var(--success-dim) 0%, var(--bg-card-solid) 50%)',
    border: '1px solid rgba(0, 214, 143, 0.3)',
    borderLeft: '3px solid var(--success)',
  },
  premium: {
    background: 'linear-gradient(145deg, rgba(247, 147, 26, 0.08) 0%, rgba(255, 215, 0, 0.04) 100%)',
    border: '1px solid var(--border-accent)',
    boxShadow: 'var(--shadow-glow)',
  },
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'default', padding = 'normal', hoverable = false, glow = false, header, footer, className = '', children, style, ...rest }, ref) => {
    const baseStyle: React.CSSProperties = {
      borderRadius: 'var(--radius-xl)',
      transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
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
