/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Tokens do Cap. 8.4.1 — a mesma escala da landing, para o ERP não
        // parecer um produto diferente ao trocar de página.
        surface: {
          0: '#05060A',
          1: '#08090D',
          2: '#0A0B10',
        },
      },
      boxShadow: {
        glow: '0 0 40px rgba(99, 102, 241, 0.35)',
      },
    },
  },
  plugins: [],
};