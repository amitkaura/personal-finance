import type { NextConfig } from "next";

const apiUrl = process.env.BACKEND_URL || "http://localhost:8000";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
  rewrites: async () => [
    {
      source: "/api/:path*",
      destination: `${apiUrl}/api/:path*`,
    },
    {
      source: "/health/:path*",
      destination: `${apiUrl}/health/:path*`,
    },
  ],
};

export default nextConfig;
