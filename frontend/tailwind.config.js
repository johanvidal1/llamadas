/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          900: '#1e3a8a',
        },
      },
      keyframes: {
        'queue-soft-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        'queue-nudge-shake': {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%': { transform: 'translateX(-2px)' },
          '40%': { transform: 'translateX(2px)' },
          '60%': { transform: 'translateX(-1.5px)' },
          '80%': { transform: 'translateX(1px)' },
        },
      },
      animation: {
        'queue-soft-pulse': 'queue-soft-pulse 1.6s ease-in-out infinite',
        'queue-nudge-shake': 'queue-nudge-shake 0.45s ease-out 1',
      },
    },
  },
  plugins: [],
}
