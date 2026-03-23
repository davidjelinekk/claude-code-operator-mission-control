/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'hsl(var(--color-canvas))',
        surface: {
          DEFAULT: 'hsl(var(--color-surface))',
          hover: 'hsl(var(--color-surface-hover))',
        },
        sidebar: 'hsl(var(--color-sidebar))',
        border: {
          DEFAULT: 'hsl(var(--color-border))',
          subtle: 'hsl(var(--color-border-subtle))',
          strong: 'hsl(var(--color-border-strong))',
        },
        'text-primary': 'hsl(var(--color-text-primary))',
        'text-secondary': 'hsl(var(--color-text-secondary))',
        'text-tertiary': 'hsl(var(--color-text-tertiary))',
        accent: {
          DEFAULT: 'hsl(var(--color-accent))',
          hover: 'hsl(var(--color-accent-hover))',
          subtle: 'hsl(var(--color-accent-subtle))',
        },
        success: {
          DEFAULT: 'hsl(var(--color-success))',
          subtle: 'hsl(var(--color-success-subtle))',
        },
        warning: {
          DEFAULT: 'hsl(var(--color-warning))',
          subtle: 'hsl(var(--color-warning-subtle))',
        },
        error: {
          DEFAULT: 'hsl(var(--color-error))',
          subtle: 'hsl(var(--color-error-subtle))',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}
