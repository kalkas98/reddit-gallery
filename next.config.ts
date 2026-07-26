import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow development assets and hot reload when the app is opened through
  // this machine's LAN address.
  allowedDevOrigins: ["192.168.1.85"],
};

export default nextConfig;
