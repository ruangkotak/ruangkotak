import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-[1240px] flex-col justify-center px-4 md:px-8">
      <a href="/" aria-label="RUANGKOTAK home" className="mb-16">
        <Logo className="h-[17px] w-auto" />
      </a>
      <p className="eyebrow">404</p>
      <h1 className="mt-5 max-w-[14ch] text-5xl md:text-7xl">This box is empty.</h1>
      <p className="mt-6 max-w-[44ch] text-muted">The page you followed is gone or never existed. Report links only open after the report is unlocked.</p>
      <div className="mt-10 flex gap-2">
        <a href="/" className="btn-primary">Back to home</a>
        <a href="/#top" className="btn-ghost">Check my account</a>
      </div>
    </main>
  );
}
