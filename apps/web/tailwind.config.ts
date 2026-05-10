import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#0f0f12',
          '1': '#16161c',
          '2': '#1e1e26',
          '3': '#26262f',
        },
      },
    },
  },
  plugins: [],
};

export default config;
