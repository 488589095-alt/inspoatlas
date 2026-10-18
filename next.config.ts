import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vinext checks multipart requests before API route validation. Leave room for
  // the advertised 100 MB media limit plus multipart framing; routes enforce
  // the smaller per-format limits and ownership checks.
  experimental: { serverActions: { bodySizeLimit: "110mb" } },
};

export default nextConfig;
