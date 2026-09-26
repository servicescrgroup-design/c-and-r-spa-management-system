import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Photo uploads (homepage, products, staff) go through server actions.
      // Vercel caps request bodies at 4.5 MB, and images are resized in the
      // browser first, so 4 MB leaves room for multipart overhead.
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
