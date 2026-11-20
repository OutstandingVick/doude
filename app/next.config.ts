import type { NextConfig } from "next";

// Server-side only: where Next proxies /api/* (the engine). The browser never
// sees this URL; every app fetch goes to /api on the app's own origin, so the
// session cookie is first-party.
const ENGINE_URL = (process.env.ENGINE_URL ?? "http://localhost:8000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  devIndicators: false,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${ENGINE_URL}/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
