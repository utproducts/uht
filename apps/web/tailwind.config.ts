import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // UHT Brand Colors
        // Cyan #00ccff, Navy #003e79, White #fdfdfd
        brand: {
          50: '#e6faff',
          100: '#b3f0ff',
          200: '#80e6ff',
          300: '#4ddbff',
          400: '#1ad1ff',
          500: '#00ccff',  // Primary cyan
          600: '#00b8e6',
          700: '#0099bf',
          800: '#007a99',
          900: '#005c73',
        },
        navy: {
          50: '#e6edf5',
          100: '#c0d1e6',
          200: '#99b5d6',
          300: '#7399c6',
          400: '#4d7db6',
          500: '#2661a6',
          600: '#00508f',
          700: '#003e79',  // Primary navy
          800: '#002f5c',
          900: '#001f3f',
        },
      },
      fontFamily: {
        sans: [
          'SF Pro Display', '-apple-system', 'BlinkMacSystemFont',
          'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif',
        ],
        mono: ['SF Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        'soft': '0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 10px 20px -2px rgba(0, 0, 0, 0.04)',
        'card': '0 0 0 1px rgba(0,0,0,0.03), 0 2px 4px rgba(0,0,0,0.05), 0 12px 24px rgba(0,0,0,0.05)',
        'elevated': '0 0 0 1px rgba(0,0,0,0.02), 0 4px 8px rgba(0,0,0,0.08), 0 20px 40px rgba(0,0,0,0.08)',
      },
      borderRadius: {
        'xl': '1rem',
        '2xl': '1.25rem',
        '3xl': '1.5rem',
      },
    },
  },
  plugins: [],
};

export default config;
