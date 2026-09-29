// Key-value store behind the preview limit, leads and applications.
// Mock mode: in-memory (resets on restart). Swap for Upstash Redis when UPSTASH_REDIS_REST_URL is set.
import type { Lead, Report } from "./types";

type Mem = {
  devices: Map<string, { handle: string; at: string }>; // device key -> first handle previewed
  reports: Map<string, Report>;
  leads: (Lead & { reportId: string; at: string })[];
  applications: Record<string, string>[];
};

const g = globalThis as unknown as { __rk?: Mem };
const mem: Mem = (g.__rk ??= { devices: new Map(), reports: new Map(), leads: [], applications: [] });

export const store = {
  deviceHandle: async (key: string) => mem.devices.get(key)?.handle ?? null,
  setDeviceHandle: async (key: string, handle: string) =>
    void mem.devices.set(key, { handle, at: new Date().toISOString() }),
  saveReport: async (r: Report) => void mem.reports.set(r.id, r),
  getReport: async (id: string) => mem.reports.get(id) ?? null,
  isUnlocked: async (reportId: string) => mem.leads.some((l) => l.reportId === reportId),
  addLead: async (reportId: string, lead: Lead) =>
    void mem.leads.push({ ...lead, reportId, at: new Date().toISOString() }),
  addApplication: async (a: Record<string, string>) =>
    void mem.applications.push({ ...a, at: new Date().toISOString() }),
};
