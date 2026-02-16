import { HTMLAttributes, forwardRef } from 'react';

type CardVariant = 'default' | 'glass' | 'accent' | 'danger';
type CardPadding = 'none' | 'compact' | 'normal' | 'spacious';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: CardPadding;
  hoverable?: boolean;
  glow?: boolean;
}

const paddingMap: Record<CardPadding, string> = {
  none: '',
  compact: 'p-3 sm:p-4',
  normal: 'p-4 sm:p-5',
  spacious: 'p-5 sm:p-6',
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'default', padding = 'normal', hoverable = false, glow = false, className = '', children, ...rest }, ref) => {
    const base = 'border transition-colors duration-150';
    const radius = 'rounded-lg';
    const variantClass =
      variant === 'glass'
        ? 'glass'
        : variant === 'accent'
        ? 'bg-[var(--bg-card-solid)] border-l-[3px] border-l-[var(--accent)] border-[var(--border)]'
        : variant === 'danger'
        ? 'bg-[var(--bg-card-solid)] border-l-[3px] border-l-[var(--danger)] border-[var(--border)]'
        : 'bg-[var(--bg-card-solid)] border-[var(--border)]';

    const hoverClass = hoverable ? 'hover:border-[var(--border-hover)] cursor-pointer' : '';
    const glowClass = glow ? 'glow-accent' : '';

    return (
      <div
        ref={ref}
        className={`${base} ${radius} ${variantClass} ${paddingMap[padding]} ${hoverClass} ${glowClass} ${className}`}
        {...rest}
      >
        {children}
      </div>
    );
  }
);
Card.displayName = 'Card';
