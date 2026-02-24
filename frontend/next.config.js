const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Force webpack (disable Turbopack for production builds)
  experimental: {
    turbo: false,
    optimizePackageImports: ['lucide-react'],
    serverComponentsExternalPackages: [
      'thread-stream',
      'pino',
      'pino-pretty',
      '@walletconnect/logger',
    ],
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
  // Empty turbopack config to silence Next.js 16 warning (we use webpack)
  turbopack: {
    resolveAlias: {
      pino: path.resolve(__dirname, 'src/lib/pino-mock.js'),
      'pino/pino.js': path.resolve(__dirname, 'src/lib/pino-mock.js'),
      'pino/browser': path.resolve(__dirname, 'src/lib/pino-mock.js'),
      'pino/browser.js': path.resolve(__dirname, 'src/lib/pino-mock.js'),
      '@walletconnect/logger': path.resolve(__dirname, 'src/lib/walletconnect-logger-mock.js'),
      '@walletconnect/logger/dist/index.es.js': path.resolve(__dirname, 'src/lib/walletconnect-logger-mock.js'),
      '@walletconnect/logger/dist/index.cjs': path.resolve(__dirname, 'src/lib/walletconnect-logger-mock.js'),
      '@react-native-async-storage/async-storage': path.resolve(__dirname, 'src/lib/async-storage-mock.js'),
      'thread-stream': path.resolve(__dirname, 'src/lib/empty-module.js'),
      'thread-stream/index.js': path.resolve(__dirname, 'src/lib/empty-module.js'),
      'thread-stream/test/indexes.js': path.resolve(__dirname, 'src/lib/empty-module.js'),
      'thread-stream/test/helper.js': path.resolve(__dirname, 'src/lib/empty-module.js'),
      'why-is-node-running': path.resolve(__dirname, 'src/lib/empty-module.js'),
      'why-is-node-running/index.js': path.resolve(__dirname, 'src/lib/empty-module.js'),
      tape: path.resolve(__dirname, 'src/lib/empty-module.js'),
      'tape/index.js': path.resolve(__dirname, 'src/lib/empty-module.js'),
      'fs-extra': path.resolve(__dirname, 'src/lib/empty-module.js'),
      mkdirp: path.resolve(__dirname, 'src/lib/empty-module.js'),
    },
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
