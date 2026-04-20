import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Ensure server-only modules are not bundled into client code */
  serverExternalPackages: ["mysql2"],
};

export default nextConfig;
