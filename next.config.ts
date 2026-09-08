import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Driver portraits come from OpenF1, which points at F1's own CDN.
    remotePatterns: [{ protocol: "https", hostname: "media.formula1.com" }],
  },
  /* config options here */
};

export default nextConfig;
