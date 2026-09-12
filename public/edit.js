/* edit.js — review overlay for the local page. Never runs in production:
   it needs ?edit=1 AND a localhost origin, and it is the only script on the
   page that touches nothing unless both are true.

   What it is for: sweeping the whole page in one sitting, recording every
   fix as an ordered op, then handing the list over in one paste. It does not
   write to source — it collects intent. The DOM changes it makes are a live
   preview only, and a reload drops them while keeping the list.

   Ops it records:
     TEXT    edited copy, with the before and after
     MOVE    moved up or down among its siblings
     REMOVE  should not be on the page
     NOTE    free text pinned to one element
*/
(() => {
  "use strict";

  const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if (!LOCAL || !/(^|[?&])edit=1(&|$)/.test(location.search)) return;

  const KEY = "rk-edit-ops";
  /** @type {{type:string,sel:string,label:string,excerpt:string,from?:string,to?:string,dir?:string,note?:string}[]} */
  let ops = [];
  try { ops = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { ops = []; }

  let sel = null;      // currently selected element
  let editing = null;  // element currently in contenteditable

  // ---------------------------------------------------------------- chrome
  const css = `
  :root{ --e-bg:#1e1e1e; --e-hi:#2e2e2e; --e-lo:#101010; --e-sh:#2b2b2b; --e-sl:#121212;
    --e-tx:#f2f2f2; --e-t2:#a6a6a6; --e-t3:#767676; --e-w:#fff;
    --e-up:-3px -3px 7px var(--e-hi), 3px 3px 7px var(--e-lo);
    --e-in:inset -2px -2px 5px var(--e-sh), inset 2px 2px 5px var(--e-sl); }
  .e-bar{position:fixed; z-index:100000; left:50%; translate:-50% 0; bottom:18px;
    display:flex; gap:10px; align-items:center; padding:10px 12px;
    background:var(--e-bg); border-radius:999px; box-shadow:var(--e-up);
    font:400 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;
    letter-spacing:.16em; text-transform:uppercase; color:var(--e-t3)}
  .e-bar b{color:var(--e-w); font-weight:400}
  .e-btn{background:var(--e-bg); border:0; border-radius:999px; box-shadow:var(--e-up);
    color:var(--e-t2); font:inherit; letter-spacing:.14em; text-transform:uppercase;
    padding:8px 13px; cursor:pointer}
  .e-btn:hover{color:var(--e-w)}
  .e-btn:active,.e-btn[aria-pressed="true"]{box-shadow:var(--e-in); color:var(--e-w)}

  .e-hover{outline:1px dashed var(--e-t3) !important; outline-offset:2px !important}
  .e-sel{outline:2px solid var(--e-w) !important; outline-offset:3px !important}
  .e-gone{outline:1px dashed var(--e-t3) !important; outline-offset:2px !important;
    opacity:.22 !important}

  .e-tag{position:absolute; z-index:100001; pointer-events:none;
    background:var(--e-bg); color:var(--e-w); box-shadow:var(--e-up);
    border-radius:7px; padding:4px 8px;
    font:400 9.5px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace; letter-spacing:.1em;
    max-width:340px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}

  .e-tools{position:absolute; z-index:100002; display:flex; gap:6px; padding:6px;
    background:var(--e-bg); border-radius:11px; box-shadow:var(--e-up)}
  .e-tools button{width:30px; height:26px; padding:0; border:0; border-radius:7px;
    background:transparent; color:var(--e-t2); cursor:pointer;
    font:400 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
  .e-tools button:hover{color:var(--e-w); box-shadow:var(--e-up)}
  .e-tools button.wide{width:auto; padding:0 9px; letter-spacing:.1em; font-size:9px;
    text-transform:uppercase}

  .e-panel{position:fixed; z-index:100000; right:18px; bottom:74px; width:min(420px,calc(100vw - 36px));
    max-height:min(60vh,560px); overflow:auto; padding:16px 18px;
    background:var(--e-bg); border-radius:14px; box-shadow:var(--e-up);
    font:400 11.5px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace; color:var(--e-t2)}
  .e-panel h4{margin:0 0 12px; color:var(--e-t3); font:inherit; font-weight:400;
    letter-spacing:.18em; text-transform:uppercase}
  .e-op{display:grid; grid-template-columns:18px 1fr 20px; gap:9px; padding:9px 0;
    border-bottom:1px solid #2c2c2c; align-items:start}
  .e-op:last-child{border-bottom:0}
  .e-op .n{color:var(--e-t3)}
  .e-op .k{color:var(--e-w)}
  .e-op .x{background:none; border:0; color:var(--e-t3); cursor:pointer; font:inherit}
  .e-op .x:hover{color:var(--e-w)}
  .e-op .d{color:var(--e-t3); word-break:break-word; white-space:normal}
  .e-empty{color:var(--e-t3)}
  [contenteditable="true"]{outline:2px solid var(--e-w) !important; outline-offset:3px !important}
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  const bar = document.createElement("div");
  bar.className = "e-bar";
  bar.innerHTML = `<span>▤ edit mode</span><span><b class="e-count">0</b> edits</span>
    <button class="e-btn" data-a="list" aria-pressed="false">List</button>
    <button class="e-btn" data-a="copy">Copy for Claude</button>
    <button class="e-btn" data-a="clear">Clear</button>`;

  const tag = document.createElement("div");
  tag.className = "e-tag";
  tag.hidden = true;

  const tools = document.createElement("div");
  tools.className = "e-tools";
  tools.hidden = true;
  tools.innerHTML = `
    <button data-a="up"     title="Move up among its siblings">↑</button>
    <button data-a="down"   title="Move down among its siblings">↓</button>
    <button data-a="parent" title="Select the parent instead" class="wide">Parent</button>
    <button data-a="text"   title="Edit the text in place" class="wide">Text</button>
    <button data-a="note"   title="Pin a note to this element" class="wide">Note</button>
    <button data-a="remove" title="Mark for removal" class="wide">Remove</button>`;

  const panel = document.createElement("div");
  panel.className = "e-panel";
  panel.hidden = true;

  document.body.append(bar, tag, tools, panel);

  // ---------------------------------------------------------------- helpers
  const mine = (el) => !el || el.closest(".e-bar,.e-tools,.e-panel,.e-tag") !== null;

  // classes that describe animation state, not identity
  const NOISE = /^(e-|reveal$|in$|stagger$|lift)/;
  const classes = (el) => [...el.classList].filter(c => !NOISE.test(c));

  const excerpt = (el) => {
    const t = (el.textContent || "").replace(/\s+/g, " ").trim();
    return t.length > 90 ? t.slice(0, 90) + "…" : t;
  };

  // a video or an empty wrapper has no text, so fall back to naming it
  const describe = (el) => excerpt(el) || `<${el.tagName.toLowerCase()}${
    classes(el)[0] ? "." + classes(el)[0] : ""}>`;

  // A readable address for the element, and a real selector. The excerpt is
  // the backstop: if the nth-child path drifts, the text still locates it.
  const label = (el) => {
    const id = el.id ? "#" + el.id : "";
    const own = classes(el);
    const cls = own.length ? "." + own.join(".") : "";
    // name the section this sits in, by id when it has one and by class
    // otherwise, so "section.hero" beats a bare "body"
    const sec = el.closest("section,header,footer,main");
    let where = "body";
    if (sec && sec !== el) {
      where = sec.id ? "#" + sec.id
        : sec.tagName.toLowerCase() + (classes(sec)[0] ? "." + classes(sec)[0] : "");
    }
    return `${where} ▸ ${el.tagName.toLowerCase()}${id}${cls}`;
  };

  const selector = (el) => {
    const parts = [];
    let n = el;
    while (n && n !== document.body) {
      if (n.id) { parts.unshift("#" + n.id); break; }
      const p = n.parentElement;
      if (!p) break;
      const same = [...p.children].filter(c => c.tagName === n.tagName);
      const i = same.indexOf(n) + 1;
      const cls = classes(n)[0];
      parts.unshift(n.tagName.toLowerCase() + (cls ? "." + cls : "") +
        (same.length > 1 ? `:nth-of-type(${i})` : ""));
      n = p;
    }
    return parts.join(" > ");
  };

  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(ops)); } catch {}
    bar.querySelector(".e-count").textContent = String(ops.length);
    if (!panel.hidden) renderPanel();
  };

  const record = (op) => { ops.push(op); save(); };

  const base = (el) => ({ sel: selector(el), label: label(el), excerpt: describe(el) });

  // ---------------------------------------------------------------- selection
  const place = () => {
    if (!sel) { tools.hidden = true; return; }
    const r = sel.getBoundingClientRect();
    tools.hidden = false;
    const th = tools.offsetHeight || 38;
    // sit above the element, or below it when there is no room up top
    const top = r.top + scrollY - th - 8;
    tools.style.top = (top < scrollY + 6 ? r.bottom + scrollY + 8 : top) + "px";
    tools.style.left = Math.max(8, Math.min(r.left + scrollX, innerWidth - tools.offsetWidth - 8)) + "px";
  };

  const select = (el) => {
    if (sel) sel.classList.remove("e-sel");
    sel = el;
    if (!sel) { tools.hidden = true; return; }
    sel.classList.add("e-sel");
    place();
  };

  addEventListener("mousemove", (e) => {
    if (editing) return;
    const el = e.target;
    document.querySelectorAll(".e-hover").forEach(n => n.classList.remove("e-hover"));
    if (mine(el) || el === document.body || el === document.documentElement) { tag.hidden = true; return; }
    el.classList.add("e-hover");
    tag.hidden = false;
    tag.textContent = label(el);
    const r = el.getBoundingClientRect();
    tag.style.top = Math.max(scrollY + 2, r.top + scrollY - 24) + "px";
    tag.style.left = (r.left + scrollX) + "px";
  }, true);

  addEventListener("click", (e) => {
    if (mine(e.target)) return;
    if (editing) return;
    e.preventDefault();
    e.stopPropagation();
    select(e.target === document.body ? null : e.target);
  }, true);

  addEventListener("scroll", place, { passive: true });
  addEventListener("resize", place);

  addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (editing) return stopEditing();
      select(null);
      tag.hidden = true;
    }
  });

  // ---------------------------------------------------------------- text edit
  let textBefore = "";
  const startEditing = () => {
    if (!sel) return;
    editing = sel;
    textBefore = editing.textContent.replace(/\s+/g, " ").trim();
    editing.setAttribute("contenteditable", "true");
    editing.focus();
    const r = document.createRange();
    r.selectNodeContents(editing);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    tag.hidden = true;
  };
  const stopEditing = () => {
    if (!editing) return;
    const el = editing;
    editing = null;
    el.removeAttribute("contenteditable");
    const after = el.textContent.replace(/\s+/g, " ").trim();
    if (after !== textBefore) {
      record({ type: "TEXT", ...base(el), from: textBefore, to: after });
    }
    getSelection().removeAllRanges();
    place();
  };
  addEventListener("focusout", (e) => { if (editing && e.target === editing) stopEditing(); }, true);

  // ---------------------------------------------------------------- tools
  tools.addEventListener("click", (e) => {
    const a = e.target.closest("button")?.dataset.a;
    if (!a || !sel) return;
    e.stopPropagation();

    if (a === "parent") {
      const p = sel.parentElement;
      if (p && p !== document.body) select(p);
      return;
    }
    if (a === "text") return startEditing();
    if (a === "up" || a === "down") {
      const p = sel.parentElement;
      if (!p) return;
      const sibs = [...p.children].filter(n => !mine(n));
      const i = sibs.indexOf(sel);
      const j = a === "up" ? i - 1 : i + 1;
      if (j < 0 || j >= sibs.length) return;
      const rec = { type: "MOVE", ...base(sel), dir: a, past: describe(sibs[j]).slice(0, 60) };
      if (a === "up") p.insertBefore(sel, sibs[j]);
      else p.insertBefore(sibs[j], sel);
      record(rec);
      place();
      return;
    }
    if (a === "remove") {
      record({ type: "REMOVE", ...base(sel) });
      sel.classList.add("e-gone");
      select(null);
      return;
    }
    if (a === "note") {
      const note = prompt("What is wrong with this one?");
      if (note && note.trim()) record({ type: "NOTE", ...base(sel), note: note.trim() });
      return;
    }
  });

  // ---------------------------------------------------------------- panel
  function renderPanel() {
    if (!ops.length) {
      panel.innerHTML = `<h4>Edit list</h4><p class="e-empty">Nothing yet. Click a block, then use the tools above it.</p>`;
      return;
    }
    panel.innerHTML = `<h4>Edit list — ${ops.length}</h4>` + ops.map((o, i) => {
      let d = o.label;
      if (o.type === "TEXT") d += `<br>was “${o.from}”<br>now “${o.to}”`;
      else if (o.type === "MOVE") d += `<br>moved ${o.dir} past “${o.past}”`;
      else if (o.type === "NOTE") d += `<br>“${o.note}”`;
      else if (o.type === "REMOVE") d += `<br>“${o.excerpt}”`;
      return `<div class="e-op"><span class="n">${i + 1}</span>
        <span class="d"><span class="k">${o.type}</span> ${d}</span>
        <button class="x" data-i="${i}" title="Drop this one">✕</button></div>`;
    }).join("");
  }
  panel.addEventListener("click", (e) => {
    const i = e.target.closest(".x")?.dataset.i;
    if (i == null) return;
    ops.splice(Number(i), 1);
    save();
  });

  // ---------------------------------------------------------------- export
  const report = () => {
    const lines = [
      `RUANGKOTAK page edits — ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
      `${ops.length} edit${ops.length === 1 ? "" : "s"}, in the order they were made.`,
      ``,
    ];
    ops.forEach((o, i) => {
      lines.push(`${i + 1}. ${o.type}  ${o.label}`);
      lines.push(`   selector: ${o.sel}`);
      if (o.type === "TEXT") {
        lines.push(`   was: "${o.from}"`);
        lines.push(`   now: "${o.to}"`);
      } else if (o.type === "MOVE") {
        lines.push(`   text: "${o.excerpt}"`);
        lines.push(`   moved ${o.dir}, past "${o.past}"`);
      } else if (o.type === "NOTE") {
        lines.push(`   text: "${o.excerpt}"`);
        lines.push(`   note: ${o.note}`);
      } else if (o.type === "REMOVE") {
        lines.push(`   text: "${o.excerpt}"`);
      }
      lines.push("");
    });
    return lines.join("\n");
  };

  bar.addEventListener("click", async (e) => {
    const a = e.target.closest("button")?.dataset.a;
    if (!a) return;
    if (a === "list") {
      panel.hidden = !panel.hidden;
      e.target.setAttribute("aria-pressed", String(!panel.hidden));
      if (!panel.hidden) renderPanel();
      return;
    }
    if (a === "clear") {
      if (!ops.length || !confirm(`Drop all ${ops.length} recorded edits?`)) return;
      ops = [];
      save();
      document.querySelectorAll(".e-gone").forEach(n => n.classList.remove("e-gone"));
      return;
    }
    if (a === "copy") {
      if (!ops.length) return;
      const txt = report();
      try {
        await navigator.clipboard.writeText(txt);
        const b = e.target;
        b.textContent = "Copied";
        setTimeout(() => { b.textContent = "Copy for Claude"; }, 1400);
      } catch {
        // clipboard refused (no focus, no permission): fall back to a textarea
        const ta = document.createElement("textarea");
        ta.value = txt;
        ta.style.cssText = "position:fixed;inset:auto 18px 130px 18px;height:40vh;z-index:100003";
        document.body.appendChild(ta);
        ta.select();
      }
    }
  });

  save();
  console.log("[edit] on. click a block, then use the tools. ?edit=1 only, localhost only.");
})();
