const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
        pathname: '/story-aeneid/**',
      },
      {
        protocol: 'https',
        hostname: 'gateway.pinata.cloud', // If using Pinata gateway
        pathname: '/ipfs/**',
      },
    ],
  },
  // Empty turbopack config to silence Next.js 16 warning (we use webpack)
  turbopack: {},
  // Ensure output file tracing starts from the monorepo root (Sovry)
  outputFileTracingRoot: path.join(__dirname, ".."),
  // Ignore parent directory lockfiles to prevent warnings
  // This is a monorepo with backend/ and frontend/ structure
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
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
    
    // Handle Dynamic dependencies properly - exclude problematic modules
    const nodeModulesToExclude = [
      'thread-stream',
      'why-is-node-running',
      'tape',
      'fs-extra',
      'mkdirp'
    ];
    
    // Exclude these modules by aliasing them to false (empty module)
    nodeModulesToExclude.forEach(module => {
      config.resolve.alias = {
        ...config.resolve.alias,
        [module]: false
      };
    });
    
    // Provide a mock for pino and related browser-only deps instead of excluding them
    const browserSafeAliases = {
      'pino': path.resolve(__dirname, 'src/lib/pino-mock.js'),
      '@walletconnect/logger': path.resolve(__dirname, 'src/lib/walletconnect-logger-mock.js'),
      '@react-native-async-storage/async-storage': path.resolve(__dirname, 'src/lib/async-storage-mock.js'),
    };

    config.resolve.alias = {
      ...config.resolve.alias,
      ...browserSafeAliases,
    };
    
    // Ignore test files and other non-code files from thread-stream
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
