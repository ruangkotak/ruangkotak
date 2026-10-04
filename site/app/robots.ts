import type { MetadataRoute } from "next";

// Report pages are private links (and already noindex); keep crawlers off them and off the API.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/r/"] },
    sitemap: "https://ruangkotak.com/sitemap.xml",
  };
}
