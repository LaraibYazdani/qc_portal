/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Deep ink for the shell and text; a single blue accent; canvas for page backgrounds
        ink: {
          50: '#F5F6FA', 100: '#E9ECF3', 200: '#D3D8E4', 300: '#AEB6CA', 400: '#7F8AA6',
          500: '#5B6683', 600: '#434D68', 700: '#323A52', 800: '#222940', 900: '#151A2C', 950: '#0C1020',
        },
        brand: {
          50: '#EEF3FF', 100: '#DCE6FF', 200: '#BCCDFF', 300: '#8FAAFF', 400: '#5F7DFA',
          500: '#3F5AF0', 600: '#2F45D6', 700: '#2737AD', 800: '#23308A', 900: '#212C6E',
        },
        canvas: '#F5F6F8',
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', '"Segoe UI"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['ui-monospace', '"Cascadia Mono"', 'Consolas', '"SF Mono"', 'Menlo', 'monospace'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06)',
        lift: '0 12px 32px -8px rgba(16,24,40,0.14), 0 4px 8px -4px rgba(16,24,40,0.06)',
        ring: '0 0 0 4px rgba(63,90,240,0.12)',
      },
      borderRadius: { xl: '0.875rem', '2xl': '1.125rem' },
      keyframes: {
        'fade-in': { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'none' } },
      },
      animation: { 'fade-in': 'fade-in 180ms ease-out both' },
    },
  },
  plugins: [],
};
