import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        hnh: {
          red: '#c0222b',
          'red-dark': '#9a1a21',
          'red-50': '#fdecee',
          'red-100': '#fad6da',
          navy: '#142B6F',
          'navy-2': '#1f3d8a',
          'navy-50': '#eef1fa',
          cream: '#faf7f2',
          'cream-2': '#f4efe7',
          ink: '#0f1428',
          'ink-2': '#4a5170',
          'ink-3': '#8a8fa6',
          'ink-4': '#bfc2d1',
          line: '#ece8e0',
          'line-2': '#e3ddd1',
          gold: '#d4a017',
          'gold-soft': '#f7e7b7',
          success: '#1f8a5b',
          'success-50': '#e6f4ec',
          warn: '#c97a16',
          'warn-50': '#fdf2dc',
        },
      },
      fontFamily: {
        ui: ['"Be Vietnam Pro"', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', '"Be Vietnam Pro"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'card': '22px',
        'btn': '14px',
        'pill': '999px',
      },
    },
  },
  plugins: [],
} satisfies Config
