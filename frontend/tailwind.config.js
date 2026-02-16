/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        /* Bybit backgrounds */
        'bg-base': '#000',
        'bg-surface': '#101014',
        'bg-topbar': '#101014',
        'bg-sidebar': '#101014',

        /* Bybit gold accent */
        accent: { DEFAULT: '#FF9C2E', dark: '#F0960E', hover: '#FFC35C' },

        /* Bybit trading */
        success: { DEFAULT: '#20B26C', dim: 'rgba(32,178,108,0.16)' },
        danger:  { DEFAULT: '#EF454A', dim: 'rgba(239,69,74,0.16)' },
        warning: { DEFAULT: '#FCD535', dim: 'rgba(252,213,53,0.12)' },
        info:    { DEFAULT: '#1E90FF', dim: 'rgba(30,144,255,0.12)' },

        /* BDS tokens */
        bds: {
          'green-normal':  '#20B26C',
          'green-hover':   '#41BF7E',
          'red-normal':    '#EF454A',
          'red-hover':     '#FC7272',
          'brand-normal':  '#FF9C2E',
          'brand-hover':   '#FFC35C',
          'gray-t1':       '#FFFFFF',
          'gray-t2':       '#ADB1B8',
          'gray-t3':       '#71757A',
          'gray-t4':       '#595D61',
          'gray-border':   '#404347',
          'gray-line':     '#25282C',
          'gray-card':     '#16171A',
          'gray-area':     '#101014',
          'gray-page':     '#000000',
        },

        primary: { DEFAULT: '#FF9C2E', light: '#FFC35C', dark: '#F0960E' },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      borderRadius: {
        'bds': '4px',
        'bds-lg': '8px',
      },
      boxShadow: {
        'glow':         '0 0 20px rgba(255,156,46,0.25)',
        'glow-primary': '0 0 20px rgba(255,156,46,0.2)',
        'glow-success': '0 0 16px rgba(32,178,108,0.25)',
        'glow-danger':  '0 0 16px rgba(239,69,74,0.25)',
        'glow-brand':   '0 0 16px rgba(255,156,46,0.2)',
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(90deg, #FFD748 0%, #F7A600 100%)',
        'gradient-button':  'linear-gradient(90deg, #FFD748 0%, #F7A600 100%)',
        'gradient-brand':   'linear-gradient(90deg, #FFD748 0%, #F7A600 100%)',
        'gradient-green':   'linear-gradient(135deg, #20B26C 0%, #00944F 100%)',
        'gradient-danger':  'linear-gradient(135deg, #EF454A 0%, #CC3939 100%)',
        'gradient-ruby':    'linear-gradient(90deg, #FC7272 0%, #F03339 100%)',
      },
      animation: {
        'in':                  'in 0.2s ease-out',
        'slide-in-from-right': 'slideInRight 0.2s ease-out',
        'pulse-glow':          'pulseGlow 2s ease-in-out infinite',
      },
      keyframes: {
        in:           { from: { opacity: 0, transform: 'translateY(-6px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        slideInRight: { from: { opacity: 0, transform: 'translateX(1rem)' }, to: { opacity: 1, transform: 'translateX(0)' } },
        pulseGlow:    { '0%,100%': { boxShadow: '0 0 8px rgba(255,156,46,0.2)' }, '50%': { boxShadow: '0 0 20px rgba(255,156,46,0.3)' } },
      },
    },
  },
  plugins: [],
};
