/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Cyber-Tech Gradient (логотип): Amber-500 → Orange-600, фон #1A1A1A
        primary: { DEFAULT: '#F59E0B', light: '#FBBF24', dark: '#EA580C' },
        amber: '#F59E0B',
        orange: '#EA580C',
        'bg-dark': '#1A1A1A',
        success: '#4CAF50',
        danger: '#FF5252',
        warning: '#F59E0B',
        recehtok: {
          purple: '#5A1D9F', blue: '#283FC7', orange: '#EA580C', muted: '#8795B7',
          cyan: '#22C9E8', magenta: '#E91E8C', bg: '#1A1A1A', main: '#1A1A1A'
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace']
      },
      boxShadow: {
        'glow': '0 0 24px rgba(245, 158, 11, 0.4)',
        'glow-primary': '0 0 24px rgba(245, 158, 11, 0.35)',
        'glow-purple': '0 0 30px rgba(90, 29, 159, 0.35)',
        'glow-success': '0 0 20px rgba(0, 230, 118, 0.3)',
        'glow-danger': '0 0 20px rgba(255, 82, 82, 0.3)'
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #F59E0B 0%, #EA580C 100%)',
        'gradient-button': 'linear-gradient(135deg, #F59E0B 0%, #EA580C 100%)',
        'gradient-cyber': 'linear-gradient(135deg, #F59E0B 0%, #EA580C 100%)',
        'gradient-success': 'linear-gradient(135deg, #00E676 0%, #69F0AE 100%)',
        'gradient-danger': 'linear-gradient(135deg, #FF5252 0%, #FF8A80 100%)'
      },
      animation: {
        'in': 'in 0.3s ease-out',
        'slide-in-from-right': 'slideInRight 0.3s ease-out'
      },
      keyframes: {
        in: { from: { opacity: 0, transform: 'translateY(-8px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        slideInRight: { from: { opacity: 0, transform: 'translateX(1rem)' }, to: { opacity: 1, transform: 'translateX(0)' } }
      }
    }
  },
  plugins: []
};
