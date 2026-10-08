// postcss.config.js — habilita o processamento do Tailwind no Next.js.
// Sem esta config o Next usa só o preset padrão e os @tailwind ficam crus.
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
