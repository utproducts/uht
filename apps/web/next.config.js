/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.r2.cloudflarestorage.com',
      },
      {
        protocol: 'https',
        hostname: 'ultimatetournaments.com',
      },
    ],
  },
  // Static export for Cloudflare Pages
  output: 'export',
  trailingSlash: true,
};

module.exports = nextConfig;
