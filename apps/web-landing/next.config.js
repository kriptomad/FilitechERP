/** @type {import('next').NextConfig} */
const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? '';

const nextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
  async rewrites() {
    // Em produção no Vercel, as rewrites do vercel.json já cuidam do /api/*
    // Em dev local, proxy para a API local
    if (process.env.NODE_ENV === 'production') {
      return [];
    }
    return [
      {
        source: "/api/:path*",
        destination: `${API_URL || 'http://localhost:3001'}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
