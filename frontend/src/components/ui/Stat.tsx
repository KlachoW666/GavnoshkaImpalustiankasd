interface StatProps {
  label: string;
  value: string | number;
  change?: number;
  prefix?: string;
  suffix?: string;
  icon?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export function Stat({ label, value, change, prefix, suffix, icon, size = 'md' }: StatProps) {
  const valueSize = size === 'lg' ? 'text-xl' : size === 'sm' ? 'text-sm' : 'text-lg';
  const isPositive = change != null && change >= 0;

  return (
    <div className="flex items-start gap-3">
      {icon && (
        <div
          className="w-9 h-9 rounded flex items-center justify-center shrink-0"
          style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
        >
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xs font-medium truncate" style={{ color: 'var(--text-muted)' }}>{label}</p>
        <p className={`${valueSize} font-bold tabular-nums tracking-tight mt-0.5`} style={{ color: 'var(--text-primary)' }}>
          {prefix}{typeof value === 'number' ? value.toLocaleString('en-US') : value}{suffix}
        </p>
        {change != null && (
          <p className="text-xs font-medium mt-0.5 tabular-nums" style={{ color: isPositive ? 'var(--success)' : 'var(--danger)' }}>
            {isPositive ? '+' : ''}{change.toFixed(2)}%
          </p>
        )}
      </div>
    </div>
  );
}
