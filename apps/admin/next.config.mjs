/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    instrumentationHook: true,
    serverComponentsExternalPackages: [
      "@electric-sql/pglite",
      "postgres",
      "drizzle-orm",
    ],
  },
  transpilePackages: ["@retainiq/db"],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals ?? [];
      const externals = Array.isArray(config.externals)
        ? config.externals
        : [config.externals];
      externals.push("@electric-sql/pglite", "postgres");
      config.externals = externals;
    }
    return config;
  },
};

export default nextConfig;
