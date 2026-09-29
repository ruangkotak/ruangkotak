import { cookies, headers } from "next/headers";
import { analyze, toTeaser } from "@/lib/analyze";
import { notifyOwner } from "@/lib/notify";
import { MOCK, fetchAccount, normaliseHandle, reportIdFor } from "@/lib/source";
import { store } from "@/lib/store";
import type { Platform } from "@/lib/types";

// The same body goes back for a blocked device and for a real failure, so the reason never leaks.
const unavailable = () => Response.json({ ok: false }, { status: 200 });

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const platform: Platform = body?.platform === "instagram" ? "instagram" : "tiktok";
  const handle = normaliseHandle(String(body?.handle ?? ""));
  if (!handle) return Response.json({ ok: false, invalid: true }, { status: 400 });

  // Device identity: an httpOnly cookie plus the id the browser keeps in localStorage.
  // IP is recorded for the owner alert but not used to block, because Malaysian mobile networks share IPs (CGNAT).
  const jar = await cookies();
  const cookieId = jar.get("rk_dev")?.value ?? crypto.randomUUID();
  const clientId = typeof body?.deviceId === "string" ? body.deviceId.slice(0, 64) : "";
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  const country = h.get("x-vercel-ip-country") ?? "unknown";

  const keys = [`c:${cookieId}`, clientId && `d:${clientId}`].filter(Boolean) as string[];
  for (const k of keys) {
    const prev = await store.deviceHandle(k);
    if (prev && prev !== `${platform}:${handle}`) {
      await notifyOwner("Preview blocked: second account on one device", [
        `First: ${prev}`,
        `Tried: ${platform}:${handle}`,
        `Device: ${k}`,
        `IP: ${ip} (${country})`,
        `Time: ${new Date().toISOString()}`,
      ]);
      return unavailable();
    }
  }

  try {
    const id = await reportIdFor(platform, handle);
    const report = (await store.getReport(id)) ?? analyze(id, await fetchAccount(platform, handle), MOCK);
    await store.saveReport(report);
    for (const k of keys) await store.setDeviceHandle(k, `${platform}:${handle}`);

    jar.set("rk_dev", cookieId, { httpOnly: true, sameSite: "lax", secure: true, maxAge: 60 * 60 * 24 * 365, path: "/" });
    return Response.json({ ok: true, teaser: toTeaser(report) });
  } catch (err) {
    console.error("[preview]", err);
    return unavailable();
  }
}
