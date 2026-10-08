// tailwind.config.js — ESM obrigatório (o pacote tem "type": "module")
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef2ff",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
        },
      },
      fontFamily: {
        sans: ['"Inter"', '"Roboto"', '"Helvetica"', '"Arial"', "sans-serif"],
      },
    },
  },
  plugins: [],
};
