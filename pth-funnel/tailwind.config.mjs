/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,vue,svelte}'],
  theme: {
    extend: {
      colors: {
        // Legacy sales page colors (extracted from live GHL page)
        'pth-blue': '#188bf6',
        'pth-blue-dark': '#155eef',
        'pth-orange': '#f6ad55',
        'pth-orange-dark': '#dd8b2c',
        'pth-green': '#37ca37',
        'pth-red': '#e93d3d',
        'pth-gray': '#707070',
        'pth-purple': '#6b1f8e',

        // PTH Design System — dark surfaces (kept for the checkout page)
        'pth-ink': '#07090E',
        'pth-soft-ink': '#0C1018',
        'pth-soft-ink-2': '#141A26',
        'pth-paper': '#F4F2EE',
        'pth-body-on-dark': '#D7E1F4',
        'pth-muted-on-dark': '#A8B5CC',
        'pth-rule-on-dark': '#2A3142',

        // PTH Design System — light surfaces (DEFAULT for all new pages)
        'pth-light-bg': '#F7F8FC',
        'pth-paper-card': '#FFFFFF',
        'pth-text-on-light': '#101521',
        'pth-muted-on-light': '#4A5468',
        'pth-rule-on-light': '#E2E6F0',

        // Brand accents
        'pth-cyan': '#00D6FF',
        'pth-brand-blue': '#2563EB',
        'pth-violet': '#7B3DFF',
        'pth-cta-gold': '#FFC107',
        'pth-cta-orange': '#FF6B1A',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Oswald', 'Bebas Neue', 'Anton', 'Impact', 'Arial Narrow', 'sans-serif'],
        body: ['"Atkinson Hyperlegible"', 'Inter', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
