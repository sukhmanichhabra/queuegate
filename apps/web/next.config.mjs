/** @type {import('next').NextConfig} */
const nextConfig = {
  // standalone mode produces a self-contained .next/standalone/ output that
  // bundles the minimal server + node_modules needed at runtime, without
  // requiring the full monorepo node_modules in the Docker runtime image.
  // This is the standard Docker-first approach for Next.js 14+.
  output: 'standalone',
};

export default nextConfig;
