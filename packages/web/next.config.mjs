/** @type {import('next').NextConfig} */
const nextConfig = {
  // In Next 14 this lives under `experimental`; in Next 15 it's top-level
  // `serverExternalPackages`. Keep mysql2 out of the client bundle.
  experimental: {
    serverComponentsExternalPackages: ["mysql2"],
  },
  webpack: (config) => {
    // The wagmi connector / walletconnect subtree lazy-requires a handful of
    // packages that only exist in Node / React-Native runtimes. In a browser
    // build they are absent (a runtime try/catch handles that), but webpack
    // still statically resolves them and prints "Module not found". Aliasing
    // them to false makes webpack emit an empty module instead of warning.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@react-native-async-storage/async-storage": false, // @metamask/sdk
      "pino-pretty": false,                                // @walletconnect/logger -> pino
      lokijs: false,                                       // walletconnect storage fallback
      encoding: false,                                     // node-fetch optional dep
    };

    // viem 2.50.x -> ox's tempo/VirtualMaster uses a dynamic require(expression)
    // that webpack can't statically analyze, producing a "Critical dependency"
    // warning. It's harmless; suppress it narrowly.
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      { module: /node_modules[\\/]ox[\\/]/ },
      { message: /Critical dependency: the request of a dependency is an expression/ },
    ];

    return config;
  },
};

export default nextConfig;
