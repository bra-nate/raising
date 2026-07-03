import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Semantic, theme-swapping tokens (via CSS vars).
        canvas: 'var(--canvas)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        wash: 'var(--wash)',
        hairline: 'var(--hairline)',
        border: 'var(--border)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        slateink: 'var(--slate)',
        muted: 'var(--muted)',
        faint: 'var(--faint)',
        accent: 'var(--accent)',
        action: 'var(--action)',
        'action-ink': 'var(--action-ink)',
        // Fixed data-signal colors (opacity-modifier capable).
        good: '#16ca2e',
        attention: '#ffa64d',
        concern: '#f26052',
        info: '#0099ff',
        signal: '#145aff',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"Roboto Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        caption: ['10px', { lineHeight: '1.2', letterSpacing: '0.13px' }],
        body: ['14px', { lineHeight: '1.43', letterSpacing: '0.06px' }],
        'heading-sm': ['18px', { lineHeight: '1.4', letterSpacing: '-0.16px' }],
        heading: ['22px', { lineHeight: '1.25', letterSpacing: '-0.22px' }],
        'heading-lg': ['40px', { lineHeight: '1.08', letterSpacing: '-0.76px' }],
        display: ['56px', { lineHeight: '1.05', letterSpacing: '-1.51px' }],
      },
      borderRadius: {
        badge: '4px',
        card: '8px',
        input: '12px',
        btn: '12px',
        modal: '32px',
        cardlg: '40px',
        pill: '100px',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        elevated: 'var(--shadow-elevated)',
        feature: 'var(--shadow-feature)',
        focus: '0 0 0 3px var(--focus-ring)',
        glow: 'rgba(20, 90, 255, 0.1) 0px 0px 100px -28px',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'scale-in': {
          from: { opacity: '0', transform: 'translateY(6px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'rise': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'scale-in': 'scale-in 0.22s cubic-bezier(0.22, 1, 0.36, 1)',
        'rise': 'rise 0.3s cubic-bezier(0.22, 1, 0.36, 1) both',
      },
    },
  },
  plugins: [],
} satisfies Config;
