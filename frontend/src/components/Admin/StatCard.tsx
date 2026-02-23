/**
 * StatCard - карточка статистики для дашборда
 */

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  icon?: string;
  color?: 'default' | 'success' | 'danger' | 'warning' | 'accent';
  onClick?: () => void;
}

export function StatCard({
  title,
  value,
  subtitle,
  trend,
  trendValue,
  icon,
  color = 'default',
  onClick
}: StatCardProps) {
  const colorMap = {
    default: 'var(--accent-dim)',
    success: 'rgba(16, 185, 129, 0.1)',
    danger: 'rgba(239, 68, 68, 0.1)',
    warning: 'rgba(245, 158, 11, 0.1)',
    accent: 'var(--accent)'
  };

  const textColorMap = {
    default: 'var(--accent)',
    success: 'var(--success)',
    danger: 'var(--danger)',
    warning: 'var(--warning)',
    accent: 'var(--accent)'
  };

  return (
    <div
      className={`rounded-xl p-4 ${onClick ? 'cursor-pointer hover:scale-[1.02] transition-transform' : ''}`}
      style={{ background: 'var(--bg-card-solid)', border: '1px solid var(--border)' }}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          {title}
        </span>
        {icon && <span className="text-lg">{icon}</span>}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          {value}
        </span>
        {trend && trendValue && (
          <span
            className="text-xs font-medium"
            style={{
              color: trend === 'up' ? 'var(--success)' : trend === 'down' ? 'var(--danger)' : 'var(--text-muted)'
            }}
          >
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : ''} {trendValue}
          </span>
        )}
      </div>
      {subtitle && (
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>
      )}
    </div>
  );
}
