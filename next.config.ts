import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The dashboard renders entirely from server components hitting the GitHub
  // REST API; no special runtime config is required to deploy on Vercel.
};

export default nextConfig;
