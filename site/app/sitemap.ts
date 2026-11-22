import type { MetadataRoute } from "next";

// Only the public pages. Report links (/r/...) are private and left out on purpose.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: "https://ruangkotak.com", changeFrequency: "monthly", priority: 1 },
    { url: "https://ruangkotak.com/about", changeFrequency: "yearly", priority: 0.5 },
    { url: "https://ruangkotak.com/onboarding", changeFrequency: "monthly", priority: 0.6 },
    { url: "https://ruangkotak.com/contact", changeFrequency: "yearly", priority: 0.5 },
    { url: "https://ruangkotak.com/privacy", changeFrequency: "yearly", priority: 0.3 },
  ];
}
