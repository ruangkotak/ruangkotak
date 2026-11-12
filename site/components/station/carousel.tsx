"use client";

import { ArrowLeft, Check, Copy, DownloadSimple, Images, Plus, Trash } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { assignPhotos, BACKGROUNDS, captionFrom, drawSlide, H, MAX_SLIDES, PALETTES, slidesFrom, W, zip, type Background, type Deck, type Slide } from "@/lib/carousel";

const START = "Your hook goes here\nFirst point\nSecond point\nThird point\nFollow for more";

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[6px] border border-line px-3 text-[12px] hover:border-ink"
      onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1800); } catch {} }}>
      {done ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />} {done ? "Copied" : label}
    </button>
  );
}

function save(data: Uint8Array | Blob, name: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data as BlobPart], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** Owner only: script and product photos in, carousel PNGs, caption and hashtags out. Nothing is uploaded anywhere. */
export function Carousel() {
  const [script, setScript] = useState(START);
  const [deck, setDeck] = useState<Deck>(() => ({ bg: "grid", pal: "cream", handle: "", slides: slidesFrom(START, "") }));
  const [sel, setSel] = useState(0);
  const [caption, setCaption] = useState(() => captionFrom(slidesFrom(START, "")));
  const [tags, setTags] = useState("");
  const [photos, setPhotos] = useState<HTMLImageElement[]>([]);
  const [status, setStatus] = useState("");
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    strip.current?.querySelectorAll("canvas").forEach((c, i) => drawSlide(c, deck, i, photos));
  }, [deck, photos]);

  const slide = deck.slides[Math.min(sel, deck.slides.length - 1)];
  const patch = (change: Partial<Slide>) => setDeck((d) => ({ ...d, slides: d.slides.map((s, i) => (i === sel ? { ...s, ...change } : s)) }));
  const name = (i: number) => `carousel-slide-${i + 1}.png`;
  const png = (i: number) => new Promise<Blob>((ok, no) => {
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    drawSlide(c, deck, i, photos);
    c.toBlob((b) => (b ? ok(b) : no(new Error("could not draw the slide"))), "image/png");
  });

  const rebuild = () => {
    const slides = assignPhotos(slidesFrom(script, deck.handle), photos.length);
    setDeck((d) => ({ ...d, slides }));
    setCaption(captionFrom(slides));
    setSel(0);
  };
  const addPhotos = async (files: FileList | null) => {
    const loaded: HTMLImageElement[] = [];
    for (const f of [...(files ?? [])].slice(0, 12 - photos.length)) {
      const img = new Image();
      img.src = URL.createObjectURL(f);
      try { await img.decode(); loaded.push(img); } catch {}
    }
    const all = [...photos, ...loaded];
    setPhotos(all);
    setDeck((d) => ({ ...d, slides: assignPhotos(d.slides, all.length) }));
  };
  const downloadAll = async () => {
    setStatus("Drawing…");
    try {
      const files = [];
      for (let i = 0; i < deck.slides.length; i++) files.push({ name: name(i), data: new Uint8Array(await (await png(i)).arrayBuffer()) });
      save(zip(files), "carousel.zip", "application/zip");
      setStatus(`${files.length} PNGs in one zip, ${W} × ${H}.`);
    } catch (err) {
      setStatus((err as Error).message);
    }
  };

  const pillClass = (on: boolean) => `inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 text-[12px] ${on ? "border-mark text-mark" : "border-line text-muted hover:text-ink"}`;
  const button = "inline-flex min-h-[40px] items-center gap-1.5 rounded-[6px] border border-line px-3 text-[12px] hover:border-ink disabled:opacity-40";

  return (
    <div className="rk-station min-h-[100dvh] bg-bg text-ink">
      <main className="mx-auto flex max-w-[1080px] flex-col gap-3 px-4 pt-4 pb-16 md:px-6">
        <header className="st-card flex flex-wrap items-center justify-between gap-2 px-3.5 py-3">
          <h1 className="text-[13px] uppercase" style={{ fontWeight: 500, letterSpacing: "0.06em" }}>Carousel studio</h1>
          <a href="/station" className="inline-flex min-h-[40px] items-center gap-1.5 text-[12px] text-muted hover:text-ink"><ArrowLeft size={14} aria-hidden /> Back to Station</a>
        </header>

        <section className="st-card px-3.5 py-3">
          <label className="flex flex-col gap-1 text-[12px]">
            Script, one line per slide. The first line is the cover, the last is the end page, {MAX_SLIDES} slides at most.
            <textarea className="field mono !min-h-[120px] text-[12px]" value={script} onChange={(e) => setScript(e.target.value)} spellCheck={false} />
          </label>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button type="button" className="inline-flex min-h-[40px] items-center gap-2 rounded-[6px] bg-[var(--mark)] px-4 text-[13px] text-[var(--on-solid)]" onClick={rebuild}>Build slides from the script</button>
            <label className={`${button} cursor-pointer`}>
              <Images size={14} aria-hidden /> Add product photos
              <input type="file" accept="image/*" multiple hidden onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
            </label>
            <span className="text-[11.5px] text-muted">{photos.length ? `${photos.length} photo${photos.length === 1 ? "" : "s"} loaded. They stay on this device; add them again after a reload.` : "Photos stay on this device. Nothing is uploaded."}</span>
          </div>
        </section>

        <section className="st-card px-3.5 py-3">
          <div className="label mb-2.5">Slides · {deck.slides.length} of {MAX_SLIDES}</div>
          <div ref={strip} className="flex gap-2.5 overflow-x-auto pb-1.5">
            {deck.slides.map((s, i) => (
              <button key={i} type="button" onClick={() => setSel(i)} aria-label={`Slide ${i + 1}: ${s.head}`} aria-pressed={i === sel} className={`shrink-0 rounded-[8px] border-2 ${i === sel ? "border-mark" : "border-line"}`}>
                <canvas width={W} height={H} className="block h-[210px] w-[168px] rounded-[6px]" />
              </button>
            ))}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button type="button" className={button} disabled={deck.slides.length >= MAX_SLIDES}
              onClick={() => { setDeck((d) => ({ ...d, slides: assignPhotos([...d.slides.slice(0, -1), { kind: "body", head: "New point", body: "", img: null }, d.slides[d.slides.length - 1]], photos.length) })); setSel(deck.slides.length - 1); }}>
              <Plus size={14} aria-hidden /> Add slide
            </button>
            <button type="button" className={`${button} text-bad`} disabled={slide.kind !== "body"}
              onClick={() => { setDeck((d) => ({ ...d, slides: d.slides.filter((_, i) => i !== sel) })); setSel(Math.max(0, sel - 1)); }}>
              <Trash size={14} aria-hidden /> Remove this slide
            </button>
            <button type="button" className={button} disabled={!photos.length} onClick={() => patch({ img: slide.img === null ? 0 : slide.img + 1 >= photos.length ? null : slide.img + 1 })}>
              <Images size={14} aria-hidden /> Change photo on this slide
            </button>
          </div>
          <div className="mt-3 grid gap-2.5">
            <label className="flex flex-col gap-1 text-[12px]">
              {slide.kind === "cover" ? "Cover" : slide.kind === "end" ? "End page" : `Slide ${sel + 1}`}: headline
              <input className="field !min-h-[42px]" value={slide.head} onChange={(e) => patch({ head: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-[12px]">
              <span>Smaller text <span className="text-muted">(optional)</span></span>
              <textarea className="field !min-h-[56px]" value={slide.body} onChange={(e) => patch({ body: e.target.value })} />
            </label>
          </div>
        </section>

        <div className="grid gap-3 lg:grid-cols-2">
          <section className="st-card px-3.5 py-3">
            <div className="label mb-2">Background</div>
            <div className="flex flex-wrap gap-1.5">
              {BACKGROUNDS.map(([id, label]) => <button key={id} type="button" aria-pressed={deck.bg === id} className={pillClass(deck.bg === id)} onClick={() => setDeck((d) => ({ ...d, bg: id as Background }))}>{label}</button>)}
            </div>
            <div className="label mt-3.5 mb-2">Colour</div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(PALETTES).map(([id, p]) => (
                <button key={id} type="button" aria-pressed={deck.pal === id} className={pillClass(deck.pal === id)} onClick={() => setDeck((d) => ({ ...d, pal: id }))}>
                  <span className="h-3 w-3 rounded-full border-2" style={{ background: p.bg, borderColor: p.acc }} aria-hidden />{p.name}
                </button>
              ))}
            </div>
            <label className="mt-3.5 flex flex-col gap-1 text-[12px]">
              Handle on every slide
              <input className="field !min-h-[42px]" value={deck.handle} onChange={(e) => setDeck((d) => ({ ...d, handle: e.target.value }))} placeholder="@handle" autoCapitalize="none" spellCheck={false} />
            </label>
          </section>

          <section className="st-card px-3.5 py-3">
            <label className="flex flex-col gap-1 text-[12px]">
              Caption
              <textarea className="field !min-h-[130px]" value={caption} onChange={(e) => setCaption(e.target.value)} />
            </label>
            <label className="mt-2.5 flex flex-col gap-1 text-[12px]">
              Hashtags
              <textarea className="field !min-h-[56px]" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="#yours #here" />
            </label>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <CopyButton text={caption} label="Copy caption" />
              <CopyButton text={tags} label="Copy hashtags" />
              <CopyButton text={[caption, tags].filter(Boolean).join("\n\n")} label="Copy both" />
            </div>
            <p className="mt-2 text-[11px] text-muted">The caption starts as your slide headlines. Rewrite it in your own voice. Hashtags are yours to choose: Station does not guess them.</p>
          </section>
        </div>

        <section className="st-card flex flex-wrap items-center gap-2 px-3.5 py-3">
          <button type="button" className="inline-flex min-h-[42px] items-center gap-2 rounded-[6px] bg-[var(--mark)] px-4 text-[13px] text-[var(--on-solid)]" onClick={downloadAll}><DownloadSimple size={16} aria-hidden /> Download all PNGs (zip)</button>
          <button type="button" className={button} onClick={async () => save(await png(sel), name(sel), "image/png")}><DownloadSimple size={14} aria-hidden /> Download this slide</button>
          <span className="text-[11.5px] text-muted" aria-live="polite">{status}</span>
        </section>
      </main>
    </div>
  );
}
