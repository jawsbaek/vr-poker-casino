/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        felt: {
          light: '#0e4d2e',
          DEFAULT: '#0a3d24',
          dark: '#072a19',
        },
        mahogany: {
          light: '#3d1d14',
          DEFAULT: '#2a140e',
          dark: '#1c0d09',
        },
        brass: {
          light: '#f3e5ab',
          DEFAULT: '#d4af37',
          dark: '#b8860b',
        },
        casino: {
          black: '#0b0f19',
          cardDark: '#121826',
          gold: '#e6c875',
          goldBorder: '#846d29',
        }
      },
      fontFamily: {
        sans: ['Hanken Grotesk', 'system-ui', 'sans-serif'],
        display: ['Bodoni Moda', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}
