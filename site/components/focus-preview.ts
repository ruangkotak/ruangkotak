// Scrolls to the hero and focuses the handle field. Used by every "Check my account" button.
export function focusPreview(e?: MouseEvent | React.MouseEvent) {
  const input = document.getElementById("handle") as HTMLInputElement | null;
  if (!input) return;
  e?.preventDefault();
  document.getElementById("top")?.scrollIntoView({ behavior: "smooth" });
  setTimeout(() => input.focus({ preventScroll: true }), 450);
}
