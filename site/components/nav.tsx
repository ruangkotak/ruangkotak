"use client";

import { useScroll, useMotionValueEvent } from "motion/react";
import { useState } from "react";
import { Logo } from "./logo";
import { focusPreview } from "./focus-preview";

const LINKS = [
  ["How it works", "#how"],
  ["Sample", "#sample"],
  ["Full report", "#full"],
  ["Monthly", "#monthly"],
] as const;

export function Nav() {
  const { scrollY } = useScroll();
  const [solid, setSolid] = useState(false);
  useMotionValueEvent(scrollY, "change", (v) => setSolid(v > 24));

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 border-b transition-colors duration-300 ${
        solid ? "border-line bg-bg/90 backdrop-blur-sm" : "border-transparent"
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-[1240px] items-center justify-between gap-6 px-4 md:px-8">
        <a href="/" aria-label="RUANGKOTAK home" className="shrink-0">
          <Logo intro className="h-[17px] w-auto" />
        </a>
        <ul className="hidden items-center gap-8 text-sm text-muted lg:flex">
          {LINKS.map(([label, href]) => (
            <li key={href}>
              <a href={href} className="transition-colors hover:text-ink">
                {label}
              </a>
            </li>
          ))}
        </ul>
        <a href="/#top" onClick={focusPreview} className="btn-primary !min-h-10 text-sm">
          Check my account
        </a>
      </nav>
    </header>
  );
}
