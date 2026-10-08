/** @type {import('next').NextConfig} */
const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? '';

const nextConfig = {
  reactStrictMode: true,
  // R3F/three: desabilita otimização agressiva de imagens para assets 3D
  images: { unoptimized: true },
  async rewrites() {
    // Proxy same-origin /api/* → API Express. Evita CORS entre origens e
    // mantém o front sempre relativo (dev e produção com o mesmo código).
    return [
      {
        source: "/api/:path*",
        destination: `${API_URL}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
