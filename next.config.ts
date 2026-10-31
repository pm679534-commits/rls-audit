import type {NextConfig} from 'next';
import {resolve} from 'node:path';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {serverActions: {bodySizeLimit: '6mb'}},
  images: {formats: ['image/avif', 'image/webp']},
  webpack(config) {
    config.resolve ??= {};
    config.resolve.alias ??= {};
    config.resolve.alias['next-intl/config'] = resolve(process.cwd(), 'i18n/request.ts');
    return config;
  }
};

export default nextConfig;
