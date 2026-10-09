// postcss.config.mjs — habilita o processamento do Tailwind no Next.js.
// Sem esta config o Next usa só o preset padrão e os @tailwind ficam crus.
//
// Extensão .mjs (e não .js) porque o pacote declara "type": "module" — um
// `module.exports` aqui quebraria o carregamento.
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};