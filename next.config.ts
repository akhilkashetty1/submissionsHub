import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Node-only libraries: keep them out of the bundle and load them at runtime.
  serverExternalPackages: ["pg", "exceljs"],
};

export default nextConfig;
