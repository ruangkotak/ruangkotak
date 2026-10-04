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
  // No page is meant to be framed.
  async headers() {
    // Everything is first-party: next/font self-hosts Inter, report covers are data: URIs, the browser only calls /api.
    // 'unsafe-inline' scripts are needed by Next's own inline bootstrap and the theme provider; a nonce would force every page
    // to render per request, so it is left out. This still blocks other origins, framing, plugins, and form posts elsewhere.
    const dev = process.env.NODE_ENV === "development";
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      ...(dev ? [] : ["upgrade-insecure-requests"]),
    ].join("; ");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
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
