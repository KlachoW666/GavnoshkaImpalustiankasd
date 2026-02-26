/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        /* Base Backgrounds */
        'bg-base': '#050509',
        'bg-surface': '#0A0A0F',
        'bg-topbar': 'rgba(10,10,15,0.85)',
        'bg-sidebar': 'rgba(10,10,15,0.95)',

        /* Neon Cyber Gold */
        accent: {
          DEFAULT: '#FFC700',
          dark: '#B28B00',
          hover: '#FFD933',
          glow: 'rgba(255,199,0,0.4)'
        },

        /* Semantic Colors */
        success: { DEFAULT: '#00E676', dim: 'rgba(0,230,118,0.15)', glow: 'rgba(0,230,118,0.3)' },
        danger: { DEFAULT: '#FF1744', dim: 'rgba(255,23,68,0.15)', glow: 'rgba(255,23,68,0.4)' },
        warning: { DEFAULT: '#FF9100', dim: 'rgba(255,145,0,0.15)', glow: 'rgba(255,145,0,0.3)' },
        info: { DEFAULT: '#2979FF', dim: 'rgba(41,121,255,0.15)', glow: 'rgba(41,121,255,0.4)' },

        /* Primary alias mapped to Accent */
        primary: { DEFAULT: '#FFC700', light: '#FFD933', dark: '#B28B00' },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      borderRadius: {
        'bds': '12px',
        'bds-lg': '16px',
        'bds-xl': '24px',
      },
      boxShadow: {
        'glow': '0 0 20px rgba(255,199,0,0.4)',
        'glow-primary': '0 0 20px rgba(255,199,0,0.4)',
        'glow-success': '0 0 20px rgba(0,230,118,0.3)',
        'glow-danger': '0 0 20px rgba(255,23,68,0.4)',
        'glow-brand': '0 0 20px rgba(255,199,0,0.4)',
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #FFD000 0%, #E59500 100%)',
        'gradient-button': 'linear-gradient(135deg, #FFD000 0%, #E59500 100%)',
        'gradient-brand': 'linear-gradient(135deg, #FFC700 0%, #E59500 100%)',
        'gradient-green': 'linear-gradient(135deg, #00E676 0%, #00B259 100%)',
        'gradient-danger': 'linear-gradient(135deg, #FF1744 0%, #CC002B 100%)',
        'gradient-ruby': 'linear-gradient(90deg, #FF1744 0%, #FF5252 100%)',
      },
      animation: {
        'in': 'in 0.2s ease-out',
        'slide-in-from-right': 'slideInRight 0.2s ease-out',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
      },
      keyframes: {
        in: { from: { opacity: 0, transform: 'translateY(-6px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        slideInRight: { from: { opacity: 0, transform: 'translateX(1rem)' }, to: { opacity: 1, transform: 'translateX(0)' } },
        pulseGlow: { '0%,100%': { boxShadow: '0 0 10px rgba(255,199,0,0.3)' }, '50%': { boxShadow: '0 0 30px rgba(255,199,0,0.6)' } },
      },
    },
  },
  plugins: [],
};
