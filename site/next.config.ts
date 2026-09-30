import type { NextConfig } from "next";

const config: NextConfig = {
  // The parent ruangkotak folder has its own lockfile; pin the root to this app.
  outputFileTracingRoot: import.meta.dirname,
  turbopack: { root: import.meta.dirname },
  // lib/pdf.ts reads its embedded fonts from disk; ship them with both routes that render a PDF.
  outputFileTracingIncludes: {
    "/r/\\[id\\]/pdf": ["./lib/fonts/*.ttf"],
    "/api/preview": ["./lib/fonts/*.ttf"],
  },
};

export default config;
