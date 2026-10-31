import type {NextConfig} from 'next';
import {resolve} from 'node:path';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  serverExternalPackages: ['@react-pdf/renderer', '@react-pdf/pdfkit', 'pdfkit'],
  outputFileTracingIncludes: {
    '/api/cron/exports': [
      './node_modules/pdfkit/js/**/*',
      './node_modules/@react-pdf/pdfkit/lib/**/*',
      './public/fonts/inter-pdf-*.woff2'
    ]
  },
  experimental: {serverActions: {bodySizeLimit: '6mb'}},
  images: {formats: ['image/avif', 'image/webp']},
  async headers() {
    return [
      {source: '/_next/static/:path*', headers: [{key: 'Cache-Control', value: 'public, max-age=31536000, immutable'}]},
      {source: '/fonts/:path*', headers: [{key: 'Cache-Control', value: 'public, max-age=31536000, immutable'}]}
    ];
  },
  webpack(config) {
    config.resolve ??= {};
    config.resolve.alias ??= {};
    config.resolve.alias['next-intl/config'] = resolve(process.cwd(), 'i18n/request.ts');
    return config;
  }
};

export default nextConfig;
