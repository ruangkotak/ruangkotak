// One line per saved diagnosis, for the owner's private outcomes dashboard.
// Public account data and the diagnosis only: no name, email, WhatsApp, report id or link.
import { store } from "./store";

export async function reportList() {
  const reports = (await store.allReports()).filter((r) => !r.mock);
  const rows = await Promise.all(
    reports.map(async (r) => {
      const best = [...(r.pillars ?? [])].sort((a, b) => b.multiple - a.multiple)[0];
      return {
        date: r.date,
        platform: r.platform,
        handle: r.handle.startsWith("@") ? r.handle : `@${r.handle}`,
        followers: r.followers,
        videos: r.videos?.length ?? 0,
        usual_views: r.median,
        best_type: best?.name ?? "",
        best_type_videos: best?.count ?? 0,
        best_multiple: best ? Math.round(best.multiple * 100) / 100 : null,
        verdict: r.verdict,
        fix_first: r.fixFirst,
        unlocked: await store.isUnlocked(r.id),
      };
    }),
  );
  return rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
