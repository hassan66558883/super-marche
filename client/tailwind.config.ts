import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const v = (name: string) => `hsl(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem' },
    extend: {
      fontFamily: {
        sans: ['Inter', 'Noto Sans Arabic', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        border: v('border'),
        input: v('input'),
        ring: v('ring'),
        background: v('background'),
        foreground: v('foreground'),
        primary: { DEFAULT: v('primary'), foreground: v('primary-foreground') },
        secondary: { DEFAULT: v('secondary'), foreground: v('secondary-foreground') },
        success: { DEFAULT: v('success'), foreground: v('success-foreground') },
        warning: { DEFAULT: v('warning'), foreground: v('warning-foreground') },
        destructive: { DEFAULT: v('destructive'), foreground: v('destructive-foreground') },
        muted: { DEFAULT: v('muted'), foreground: v('muted-foreground') },
        accent: { DEFAULT: v('accent'), foreground: v('accent-foreground') },
        popover: { DEFAULT: v('popover'), foreground: v('popover-foreground') },
        card: { DEFAULT: v('card'), foreground: v('card-foreground') },
        sidebar: { DEFAULT: v('sidebar'), foreground: v('sidebar-foreground'), muted: v('sidebar-muted'), active: v('sidebar-active') },
      },
      borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)', xl: 'calc(var(--radius) + 4px)' },
      boxShadow: { soft: '0 1px 2px rgb(15 23 42 / 0.04), 0 4px 12px rgb(15 23 42 / 0.06)' },
      keyframes: {
        'pop-in': { '0%': { transform: 'scale(0.96)', opacity: '0' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        flash: { '0%': { backgroundColor: 'hsl(var(--secondary) / 0.25)' }, '100%': { backgroundColor: 'transparent' } },
      },
      animation: { 'pop-in': 'pop-in 120ms ease-out', flash: 'flash 600ms ease-out' },
    },
  },
  plugins: [animate],
} satisfies Config;
