import { useTheme } from '../../contexts/ThemeContext';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className={`relative w-12 h-6 rounded-full transition-all duration-300 ${className}`}
      style={{
        background: theme === 'dark' 
          ? 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' 
          : 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
        border: '1px solid var(--border)',
        boxShadow: theme === 'dark' 
          ? 'inset 0 1px 4px rgba(0,0,0,0.3)' 
          : 'inset 0 1px 4px rgba(0,0,0,0.1)'
      }}
      aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
    >
      <span
        className="absolute top-0.5 w-5 h-5 rounded-full transition-all duration-300 flex items-center justify-center"
        style={{
          left: theme === 'dark' ? '2px' : 'calc(100% - 22px)',
          background: theme === 'dark' 
            ? 'linear-gradient(135deg, #F7931A 0%, #FFD700 100%)' 
            : 'linear-gradient(135deg, #3182CE 0%, #63B3ED 100%)',
          boxShadow: theme === 'dark' 
            ? '0 2px 8px rgba(247, 147, 26, 0.4)' 
            : '0 2px 8px rgba(49, 130, 206, 0.3)'
        }}
      >
        {theme === 'dark' ? (
          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
          </svg>
        ) : (
          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
          </svg>
        )}
      </span>
    </button>
  );
}
