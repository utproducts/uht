/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
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
  // For Cloudflare Pages deployment
  output: 'standalone',
};

module.exports = nextConfig;
