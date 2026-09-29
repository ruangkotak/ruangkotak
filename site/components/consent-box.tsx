// One consent checkbox with its sentence in English and Bahasa Melayu (PDPA s7(3) wants both languages).
// Never pre-ticked: consent has to be an action the person takes.
export function ConsentBox({
  id,
  text,
  checked,
  onChange,
  invalid,
}: {
  id: string;
  text: { en: string; ms: string };
  checked: boolean;
  onChange: (v: boolean) => void;
  invalid?: boolean;
}) {
  const link = (s: string, label: string) => {
    const [before, after] = s.split(label);
    if (after === undefined) return s;
    return (
      <>
        {before}
        <a href="/privacy" target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-ink">
          {label}
        </a>
        {after}
      </>
    );
  };
  return (
    <label htmlFor={id} className="flex cursor-pointer gap-3 text-sm leading-snug">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-invalid={invalid}
        className="mt-0.5 size-[18px] shrink-0 cursor-pointer accent-good"
      />
      <span>
        <span className="block">{link(text.en, "Privacy Notice")}</span>
        <span lang="ms" className="mt-1 block text-xs text-muted">
          {link(text.ms, "Notis Privasi")}
        </span>
      </span>
    </label>
  );
}
