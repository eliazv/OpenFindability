import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "@duckdb/node-api", "@duckdb/node-bindings"],
};

export default nextConfig;
