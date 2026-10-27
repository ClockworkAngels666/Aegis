import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  agentRules: false,
  devIndicators: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Basic hardening for the deployed pages (the app is never meant to be framed)
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
  // Locally (next dev or next start) the FastAPI app runs on uvicorn (port 8000). On Vercel,
  // vercel.json routes /api/* to the Python function instead.
  async rewrites() {
    return process.env.VERCEL ? [] : [{ source: "/api/:path*", destination: "http://127.0.0.1:8000/api/:path*" }];
  },
};

export default nextConfig;
