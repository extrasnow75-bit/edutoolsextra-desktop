/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,ts,jsx,tsx}', './index.html'],
  theme: {
    extend: {
      colors: {
        // Boise State blue, as in Canvas Extractor Tools and Canvas Rubric Creator.
        brand: { DEFAULT: '#0033a0', dark: '#002577', tint: '#e6ecf8' },
      },
    },
  },
  plugins: [],
}
