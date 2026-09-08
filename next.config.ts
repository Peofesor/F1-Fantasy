import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Driver portraits come from OpenF1, which points at F1's own CDN.
    remotePatterns: [{ protocol: "https", hostname: "media.formula1.com" }],
  },
  // Testing on a phone means loading the dev server by LAN address, which Next
  // treats as cross-origin and refuses to serve /_next dev assets to. The page
  // then renders server-side but never hydrates, so every button is inert —
  // which looks exactly like a broken UI rather than a config problem.
  allowedDevOrigins: ["192.168.0.*", "*.local"],
};

export default nextConfig;
