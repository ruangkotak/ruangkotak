import type { NextConfig } from "next";

const config: NextConfig = {
  // The parent ruangkotak folder has its own lockfile; pin the root to this app.
  outputFileTracingRoot: import.meta.dirname,
  turbopack: { root: import.meta.dirname },
  // lib/pdf.ts reads its embedded fonts from disk; ship them with both routes that render a PDF.
  outputFileTracingIncludes: {
    "/r/\\[id\\]/pdf": ["./lib/fonts/*.ttf", "./public/sample/*.jpg"],
    "/api/preview": ["./lib/fonts/*.ttf", "./public/sample/*.jpg"],
  },
  // No page is meant to be framed. No CSP yet: Next and the theme provider inject inline scripts, so it needs nonces first.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default config;
