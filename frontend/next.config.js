const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // External packages (moved from experimental in Next.js 16)
  serverExternalPackages: [
    'thread-stream',
    'pino',
    'pino-pretty',
    '@walletconnect/logger',
  ],
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cupllnxfdbxfigzrmqjy.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'ipfs.io',
        pathname: '/ipfs/**',
      },
      {
        protocol: 'https',
        hostname: 'nft-cdn.alchemy.com',
        pathname: '/story/**',
      },
      {
        protocol: 'https',
        hostname: 'gateway.pinata.cloud', // If using Pinata gateway
        pathname: '/ipfs/**',
      },
    ],
  },
  // Ensure output file tracing starts from the monorepo root (Sovry)
  outputFileTracingRoot: path.join(__dirname, ".."),
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        url: false,
        zlib: false,
        http: false,
        https: false,
        assert: false,
        os: false,
        path: false,
      };
    }
    
    // Exclude problematic Node-only modules by aliasing to false
    const modulesToExclude = [
      'thread-stream',
      'why-is-node-running',
      'tape',
      'fs-extra',
      'mkdirp',
      'pino',
      '@walletconnect/logger',
      '@react-native-async-storage/async-storage'
    ];
    
    modulesToExclude.forEach(module => {
      config.resolve.alias[module] = false;
    });
    
    // Ignore test files from thread-stream
    config.module = config.module || {};
    config.module.rules = config.module.rules || [];
    config.module.rules.push({
      test: /node_modules\/thread-stream\/(test|README|LICENSE)/,
      use: 'null-loader'
    });
    
    return config;
  },
  transpilePackages: ['@dynamic-labs'],
};

module.exports = nextConfig;
