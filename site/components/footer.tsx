import { BUSINESS } from "@/lib/legal";
import { LogoMotion } from "./logo-motion";

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-[1240px] gap-8 px-4 py-12 md:grid-cols-[1fr_auto] md:px-8">
        <div>
          <p className="max-w-[40ch] text-sm text-muted">Account diagnosis for TikTok and Instagram creators in Malaysia.</p>
          <p className="mt-3 text-sm text-muted">
            {BUSINESS.name}
            {BUSINESS.registration && ` (${BUSINESS.registration})`}
          </p>
        </div>
        <ul className="flex flex-wrap gap-x-8 gap-y-2 text-sm text-muted md:self-end">
          <li><a href="/#how" className="hover:text-ink">How it works</a></li>
          <li><a href="/#monthly" className="hover:text-ink">Monthly</a></li>
          <li><a href="/privacy" className="hover:text-ink">Privacy</a></li>
          <li>© 2026 {BUSINESS.name}</li>
        </ul>
      </div>
      <div className="mx-auto max-w-[1240px] px-4 pt-6 pb-10 md:px-8 md:pt-10 md:pb-16">
        <LogoMotion className="text-ink" />
      </div>
    </footer>
  );
}
