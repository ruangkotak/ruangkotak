// Site Reliability, every 5 minutes: can ruangkotak.com be reached from here, and how fast?
// It is also the laptop's pulse: Station's Laptop tile goes quiet after 10 minutes without a beat from "laptop".
import type { JobContext, JobResult } from "../client.mts";

const SLOW_MS = 5000;

export default async function run({ env }: JobContext): Promise<JobResult> {
  const url = new URL("/", env.STATION_URL);
  const started = Date.now();
  try {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15_000), headers: { "user-agent": "ruangkotak-station-laptop/1" } });
    const ms = Date.now() - started;
    if (res.status !== 200) return { ok: false, message: `${url.host} answered ${res.status}` };
    if (ms > SLOW_MS) return { ok: false, message: `${url.host} slow: ${ms} ms` };
    return { ok: true, message: `${url.host} 200 in ${ms} ms` };
  } catch (err) {
    return { ok: false, message: `${url.host} unreachable: ${(err as Error).message}` };
  }
}
