import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@modelcontextprotocol/sdk'],
  },
};

export default nextConfig;
