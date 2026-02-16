interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

interface TabsProps {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
  variant?: 'pill' | 'underline';
  size?: 'sm' | 'md';
}

export function Tabs({ tabs, active, onChange, variant = 'pill', size = 'md' }: TabsProps) {
  const sizeClass = size === 'sm' ? 'text-xs px-3 py-1.5' : 'text-sm px-3 py-2';

  if (variant === 'underline') {
    return (
      <div className="flex gap-0 border-b" style={{ borderColor: 'var(--border)' }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`${sizeClass} font-medium transition-colors duration-150 relative pb-2.5 flex items-center gap-2 ${
              active === t.id
                ? 'text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {t.icon}
            {t.label}
            {t.count != null && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-hover-strong)]">{t.count}</span>
            )}
            {active === t.id && (
              <span className="absolute bottom-0 left-1 right-1 h-0.5 rounded-full bg-[var(--accent)]" />
            )}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-1 p-0.5 rounded" style={{ background: 'var(--bg-hover)' }}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={`${sizeClass} font-medium rounded transition-colors duration-150 flex items-center gap-2 ${
            active === t.id
              ? 'bg-[var(--accent-dim)] text-[var(--accent)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
          }`}
        >
          {t.icon}
          {t.label}
          {t.count != null && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-hover-strong)]">{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
