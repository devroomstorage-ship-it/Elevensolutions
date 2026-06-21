/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        navy:   { DEFAULT: '#0F1E2E', light: '#162840', deep: '#1A3D5C' },
        orange: { DEFAULT: '#E8620A', light: '#F7813B', muted: '#FDE8D8' },
        steel:  '#3A5068',
        muted:  '#8FA3B8',
      },
      fontFamily: {
        sans: ['Inter', 'Arial', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
