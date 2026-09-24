import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'bg-base':        '#1E2130',
        'bg-surface':     '#272B3B',
        'bg-raised':      '#313649',
        'text-primary':   '#F0EDE6',
        'text-secondary': '#9BA3BF',
        'accent':         '#5B8EF0',
        'accent-dim':     '#2A4A8A',
        'success':        '#4ADE80',
        'warning':        '#FBBF24',
        'danger':         '#F87171',
      },
      fontFamily: {
        sans: ['var(--font-dm-sans)', 'DM Sans', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'JetBrains Mono', 'monospace'],
      },
      keyframes: {
        'fade-up': {
          '0%':   { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 400ms ease-out both',
      },
    },
  },
  plugins: [],
};

export default config;
