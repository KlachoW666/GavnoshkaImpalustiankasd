import { HTMLAttributes } from 'react';

type BadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'long' | 'short' | 'neutral';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant: BadgeVariant;
  dot?: boolean;
  pulse?: boolean;
}

const variantStyles: Record<BadgeVariant, { bg: string; color: string; border: string }> = {
  success: { bg: 'var(--success-dim)', color: 'var(--success)', border: 'rgba(14,203,129,0.25)' },
  danger: { bg: 'var(--danger-dim)', color: 'var(--danger)', border: 'rgba(246,70,93,0.25)' },
  warning: { bg: 'var(--warning-dim)', color: 'var(--warning)', border: 'rgba(252,213,53,0.25)' },
  info: { bg: 'var(--info-dim)', color: 'var(--info)', border: 'rgba(30,144,255,0.25)' },
  long: { bg: 'var(--success-dim)', color: 'var(--success)', border: 'rgba(14,203,129,0.25)' },
  short: { bg: 'var(--danger-dim)', color: 'var(--danger)', border: 'rgba(246,70,93,0.25)' },
  neutral: { bg: 'var(--bg-hover-strong)', color: 'var(--text-secondary)', border: 'var(--border)' },
};

export function Badge({ variant, dot, pulse, className = '', children, ...rest }: BadgeProps) {
  const s = variantStyles[variant];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wider ${className}`}
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
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
