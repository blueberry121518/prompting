import typography from '@tailwindcss/typography'

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        grotesk: ['"Space Grotesk"', 'ui-sans-serif', 'system-ui'],
      },
      colors: {
        obsidian: '#030303',
        graphite: '#111415',
        cyan: '#6FE8FF',
        slate: '#8C95A3',
      },
      boxShadow: {
        glow: '0 0 120px rgba(111, 232, 255, 0.25)',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { opacity: 0.35 },
          '50%': { opacity: 1 },
        },
        loadingBar: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        pulseGlow: 'pulseGlow 6s ease-in-out infinite',
        loading: 'loadingBar 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [typography],
}

