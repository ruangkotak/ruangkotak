import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Station } from "@/components/station/station";
import { COOKIE } from "@/lib/station";
import { getSnapshot, scopeOf, viewFor } from "@/lib/station-live";
import "./station.css";

// Private operations board. Not in the sitemap, never indexed, and a 404 to anyone without the owner or a client key.
export const metadata = { title: "Station | RUANGKOTAK", robots: { index: false, follow: false } };

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function StationPage({ searchParams }: { searchParams: Search }) {
  const q = await searchParams;
  const key = one(q.key);
  const account = one(q.account);
  // A key in the URL is swapped for a session cookie and dropped from the address bar.
  const to = one(q.to);
  if (key) redirect(`/api/station/enter?${new URLSearchParams({ key, ...(account ? { account } : {}), ...(to ? { to } : {}) })}`);
  const scope = await scopeOf({ cookie: (await cookies()).get(COOKIE)?.value });
  const view = await viewFor(scope, { view: one(q.view), account });
  if (!view) notFound();
  const snapshot = await getSnapshot(view);
  return <Station initial={snapshot} canSwitch={scope?.kind === "owner"} />;
}
