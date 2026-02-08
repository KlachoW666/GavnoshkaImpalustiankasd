/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#F4620E', light: '#FF8533', dark: '#E55A00' },
        success: '#4CAF50',
        danger: '#FF5252',
        warning: '#FFAB00',
        recehtok: {
          purple: '#5A1D9F', blue: '#283FC7', orange: '#F4620E', muted: '#8795B7',
          cyan: '#22C9E8', magenta: '#E91E8C', bg: '#1F1B36', main: '#1A1A2E'
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace']
      },
      boxShadow: {
        'glow': '0 0 24px rgba(244, 98, 14, 0.4)',
        'glow-purple': '0 0 30px rgba(90, 29, 159, 0.35)',
        'glow-success': '0 0 20px rgba(0, 230, 118, 0.3)',
        'glow-danger': '0 0 20px rgba(255, 82, 82, 0.3)'
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #5A1D9F 0%, #283FC7 100%)',
        'gradient-button': 'linear-gradient(135deg, #F4620E 0%, #FF8533 100%)',
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
