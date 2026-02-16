import { HTMLAttributes } from 'react';

type BadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'long' | 'short' | 'neutral';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant: BadgeVariant;
  dot?: boolean;
  pulse?: boolean;
}

const variantStyles: Record<BadgeVariant, { bg: string; color: string }> = {
  success: { bg: 'var(--success-dim)', color: 'var(--success)' },
  danger: { bg: 'var(--danger-dim)', color: 'var(--danger)' },
  warning: { bg: 'var(--accent-dim)', color: 'var(--accent)' },
  info: { bg: 'var(--info-dim)', color: 'var(--info)' },
  long: { bg: 'var(--success-dim)', color: 'var(--success)' },
  short: { bg: 'var(--danger-dim)', color: 'var(--danger)' },
  neutral: { bg: 'var(--bg-hover-strong)', color: 'var(--text-secondary)' },
};

export function Badge({ variant, dot, pulse, className = '', children, ...rest }: BadgeProps) {
  const s = variantStyles[variant];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider ${className}`}
      style={{ background: s.bg, color: s.color }}
      {...rest}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full ${pulse ? 'animate-pulse' : ''}`}
          style={{ background: s.color }}
        />
      )}
      {children}
    </span>
  );
}
