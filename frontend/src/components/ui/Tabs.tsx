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
  const sizeClass = size === 'sm' ? 'text-xs px-3 py-1.5' : 'text-sm px-4 py-2';

  if (variant === 'underline') {
    return (
      <div className="flex gap-1 border-b" style={{ borderColor: 'var(--border)' }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`${sizeClass} font-medium transition-all duration-200 relative pb-2.5 flex items-center gap-2 ${
              active === t.id
                ? 'text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {t.icon}
            {t.label}
            {t.count != null && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--bg-hover-strong)]">{t.count}</span>
            )}
            {active === t.id && (
              <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-[var(--accent)]" />
            )}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-hover)' }}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={`${sizeClass} font-medium rounded-md transition-all duration-200 flex items-center gap-2 ${
            active === t.id
              ? 'bg-[var(--bg-card-solid)] text-[var(--text-primary)] shadow-sm'
              : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
          }`}
        >
          {t.icon}
          {t.label}
          {t.count != null && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--bg-hover-strong)]">{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
