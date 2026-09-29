// Showcase-only redaction: only the username is masked. The real handle is never rendered, so it can't be read from the page source.
export function RedactedHandle() {
  return (
    <span role="img" aria-label="Handle hidden" className="inline-block select-none blur-[5px]">
      @creatorhandle
    </span>
  );
}

export function Cover({ src, good, className = "" }: { src?: string; good: boolean; className?: string }) {
  const tint = good ? "bg-good-soft" : "bg-bad-soft";
  if (!src) return <div className={`aspect-[9/16] shrink-0 ${tint} ${className}`} />;
  return (
    <div className={`aspect-[9/16] shrink-0 overflow-hidden ${tint} ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="h-full w-full object-cover" />
    </div>
  );
}
