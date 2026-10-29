/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lets a one-off build run without touching the .next folder a running dev server uses
  distDir: process.env.NEXT_DIST_DIR || '.next',
  experimental: {
    // The sample FAR is read from disk at runtime; ship it with the route on Vercel
    outputFileTracingIncludes: {
      '/api/sample-far': ['./docs/FAR (14.01.26).xlsx'],
      '/api/export/count-sheet': ['./docs/FA_Count_Verification_Sheet.xlsx'],
      '/api/export/movements': ['./docs/Fixed Asset Movement Register_Remarks_HBL.xlsx'],
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

export default nextConfig;

