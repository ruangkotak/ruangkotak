import { BUSINESS } from "@/lib/legal";
import { LogoMotion } from "./logo-motion";

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-4 px-4 py-12 text-sm text-muted md:flex-row md:items-baseline md:justify-between md:gap-8 md:px-8">
        <p>
          Account diagnosis for TikTok and Instagram creators in Malaysia.
          <span className="ml-3">
            {BUSINESS.name}
            {BUSINESS.registration && ` (${BUSINESS.registration})`}
          </span>
        </p>
        <ul className="flex flex-wrap gap-x-8 gap-y-2">
          <li><a href="/#how" className="hover:text-ink">How it works</a></li>
          <li><a href="/#monthly" className="hover:text-ink">Monthly</a></li>
          <li><a href="/privacy" className="hover:text-ink">Privacy</a></li>
          <li><a href={`mailto:${BUSINESS.email}`} className="hover:text-ink">{BUSINESS.email}</a></li>
          <li>© 2026 {BUSINESS.name}</li>
        </ul>
      </div>
      <div className="mx-auto max-w-[1240px] px-4 pt-6 pb-10 md:px-8 md:pt-10 md:pb-16">
        <LogoMotion className="text-ink" />
      </div>
    </footer>
  );
}
