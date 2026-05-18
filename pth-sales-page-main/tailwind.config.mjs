/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,vue,svelte}'],
  theme: {
    extend: {
      colors: {
        // Extracted from live page CSS
        'pth-blue': '#188bf6',
        'pth-blue-dark': '#155eef',
        'pth-orange': '#f6ad55',
        'pth-orange-dark': '#dd8b2c',
        'pth-green': '#37ca37',
        'pth-red': '#e93d3d',
        'pth-gray': '#707070',
        'pth-purple': '#6b1f8e',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
