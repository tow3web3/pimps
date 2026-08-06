import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // native addon — must stay external to the server bundle
  serverExternalPackages: ["better-sqlite3"],
  // dev and prod must NEVER share a build dir: a running `next dev` rewrites
  // .next underneath `next start` and the served chunks 404/500 at random
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
};

export default nextConfig;
