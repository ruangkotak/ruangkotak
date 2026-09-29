import type { NextConfig } from "next";

const config: NextConfig = {
  // The parent ruangkotak folder has its own lockfile; pin the root to this app.
  outputFileTracingRoot: import.meta.dirname,
  turbopack: { root: import.meta.dirname },
};

export default config;
