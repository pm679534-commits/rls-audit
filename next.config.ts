import type {NextConfig} from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {serverActions: {bodySizeLimit: '6mb'}},
  images: {formats: ['image/avif', 'image/webp']}
};

export default createNextIntlPlugin('./i18n/request.ts')(nextConfig);
