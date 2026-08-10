import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Enables server actions
    serverActions: {
      allowedOrigins: ["localhost:3000"],
    },
  },
  // Allow images from external sources
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.nhost.run" },
    ],
  },
};

export default nextConfig;
