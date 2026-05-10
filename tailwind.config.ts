import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        dark: {
          50: '#f0f0f5',
          100: '#d1d1e0',
          200: '#a3a3c7',
          300: '#7575ad',
          400: '#474794',
          500: '#1a1a7a',
          600: '#151562',
          700: '#101049',
          800: '#0a0a31',
          900: '#050518',
          950: '#02020d',
        },
      },
    },
  },
  plugins: [],
};

export default config;
