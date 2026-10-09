/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },

  experimental: {
    // Monorepo: o trace de arquivos precisa enxergar a raiz do repo. Sem isso a
    // Prisma Client gerada em node_modules/.pnpm fica fora do bundle da function
    // e a API quebra com "Cannot find module '@prisma/client'".
    outputFileTracingRoot: new URL('../../', import.meta.url).pathname,

    // argon2 é binário nativo — o Next não deve tentar bundlar o .node.
    serverComponentsExternalPackages: ['argon2', '@prisma/client'],
  },

  // A API agora são Route Handlers do proprio Next (src/app/api/**), servidos
  // na mesma origem. Nao existe mais proxy para um Express externo: aquela regra
  // era a causa do "volto pra landpage" e dos 404 em /api/*.
  async rewrites() {
    return [];
  },

  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
