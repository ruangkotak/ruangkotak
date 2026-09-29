import { BUSINESS } from "@/lib/legal";
import { Logo } from "./logo";

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-[1240px] gap-8 px-4 py-12 md:grid-cols-[1fr_auto] md:px-8">
        <div>
          <Logo className="h-[17px] w-auto" />
          <p className="mt-4 max-w-[40ch] text-sm text-muted">Account diagnosis for TikTok and Instagram creators in Malaysia.</p>
          <p className="mt-3 text-sm text-muted">
            {BUSINESS.name}
            {BUSINESS.registration && ` (${BUSINESS.registration})`} ·{" "}
            <a href={`mailto:${BUSINESS.email}`} className="hover:text-ink">
              {BUSINESS.email}
            </a>
          </p>
        </div>
        <ul className="flex flex-wrap gap-x-8 gap-y-2 text-sm text-muted md:self-end">
          <li><a href="/#how" className="hover:text-ink">How it works</a></li>
          <li><a href="/#monthly" className="hover:text-ink">Monthly</a></li>
          <li><a href="/privacy" className="hover:text-ink">Privacy / Privasi</a></li>
          <li>© 2026 {BUSINESS.name}</li>
        </ul>
      </div>
    </footer>
  );
}
