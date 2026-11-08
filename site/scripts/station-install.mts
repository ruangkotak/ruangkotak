// Wires this laptop into Station, once. Run from site/:
//
//   node --experimental-strip-types scripts/station-install.mts --key <STATION_KEY> [--vault ~/Notes] [--url https://ruangkotak.com]
//        [--apify-token <token>] [--ig-keywords "AUDIT,KOTAK"]      (Instagram jobs; re-run any time to change settings)
//        [--tasks ~/path/TASKS.md]                                (reminder-check; default: TASKS.md at the repo root or in the vault)
//   node --experimental-strip-types scripts/station-install.mts --uninstall
//   add --dry-run to see what would change without changing it
//
// What it does:
//   1. Saves the key (and vault folder) to ~/.config/ruangkotak/station.env, readable only by you.
//   2. macOS: a LaunchAgent that runs scripts/station-tick.mts every minute, also after wake.
//      Linux: one crontab line doing the same.
//   3. Runs one tick straight away so Station's Laptop tile turns green.
// The key never goes into the LaunchAgent, the crontab or the repo.
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { dirname, join, resolve } from "node:path";
import { CONFIG_DIR, DEFAULT_URL, ENV_FILE, parseEnvFile, SITE_DIR, STATE_DIR } from "./station/client.mts";

const LABEL = "com.ruangkotak.station";
const PLIST = join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
const LOG = process.platform === "darwin" ? join(homedir(), "Library", "Logs", "ruangkotak-station.log") : join(STATE_DIR, "tick.log");
const MARK = "# ruangkotak-station";
const TICK = join(SITE_DIR, "scripts", "station-tick.mts");
const NODE = process.execPath;

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const dry = args.includes("--dry-run");
const step = (what: string) => console.log(`${dry ? "[dry run] " : ""}${what}`);
const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

if (Number(process.versions.node.split(".")[0]) < 22) {
  console.error(`Node ${process.versions.node} is too old: Station's scripts need Node 22.6 or newer.`);
  process.exit(2);
}

// ---------- uninstall ----------

if (args.includes("--uninstall")) {
  if (process.platform === "darwin") {
    step(`launchctl bootout gui/${userInfo().uid}/${LABEL}`);
    if (!dry) spawnSync("launchctl", ["bootout", `gui/${userInfo().uid}/${LABEL}`], { stdio: "ignore" });
    step(`remove ${PLIST}`);
    if (!dry) rmSync(PLIST, { force: true });
  } else {
    const current = spawnSync("crontab", ["-l"], { encoding: "utf8" }).stdout ?? "";
    step("remove the ruangkotak-station line from your crontab");
    if (!dry) execFileSync("crontab", ["-"], { input: current.split("\n").filter((l) => !l.includes(MARK)).join("\n").replace(/\n*$/, "\n") });
  }
  console.log(`Settings kept in ${ENV_FILE} (delete it yourself if you want the key gone).`);
  process.exit(0);
}

// ---------- settings ----------

const existing = existsSync(ENV_FILE) ? parseEnvFile(readFileSync(ENV_FILE, "utf8")) : {};
const key = flag("key") ?? process.env.STATION_KEY ?? existing.STATION_KEY;
if (!key) {
  console.error("Pass the owner key: --key <STATION_KEY> (it is in your password manager, or in the Station access file).");
  process.exit(2);
}
const vault = flag("vault") ? resolve(flag("vault")!.replace(/^~(?=$|\/)/, homedir())) : existing.STATION_VAULT_DIR;
if (vault && !existsSync(vault)) {
  console.error(`Vault folder not found: ${vault}`);
  process.exit(2);
}
const settings: Record<string, string | undefined> = {
  ...existing,
  STATION_KEY: key,
  STATION_URL: flag("url") ?? existing.STATION_URL ?? DEFAULT_URL,
  STATION_SOURCE: existing.STATION_SOURCE ?? "laptop",
  STATION_VAULT_DIR: vault,
  // Instagram jobs: the laptop's own Apify token, and the comment words that earn a DM.
  APIFY_TOKEN: flag("apify-token") ?? existing.APIFY_TOKEN,
  STATION_IG_KEYWORDS: flag("ig-keywords") ?? existing.STATION_IG_KEYWORDS,
  // reminder-check: the task list, when it is not TASKS.md at the repo root or in the vault.
  STATION_TASKS_FILE: flag("tasks") ? resolve(flag("tasks")!.replace(/^~(?=$|\/)/, homedir())) : existing.STATION_TASKS_FILE,
};

// Check the key against Station before saving anything. The read endpoint takes the same owner key and writes nothing.
const probe = await fetch(new URL("/api/station/state", settings.STATION_URL), { headers: { "x-station-key": key }, signal: AbortSignal.timeout(15_000) }).catch(
  (err: Error) => err,
);
if (probe instanceof Error) {
  console.error(`Cannot reach ${settings.STATION_URL}: ${probe.message}`);
  process.exit(2);
}
if (probe.status === 404) {
  console.error(`${settings.STATION_URL} does not accept that key (404). Check STATION_KEY in Vercel and try again.`);
  process.exit(2);
}
console.log(`Key accepted by ${settings.STATION_URL}.`);

step(`write ${ENV_FILE} (mode 600)`);
if (!dry) {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  const body = Object.entries(settings).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join("\n");
  writeFileSync(ENV_FILE, `# Station laptop settings, written by station-install.mts. Keep private.\n${body}\n`, { mode: 0o600 });
  chmodSync(ENV_FILE, 0o600);
}
if (!dry) mkdirSync(STATE_DIR, { recursive: true });

// ---------- scheduler ----------

// launchd and cron start with a bare PATH; git (Xcode tools or Homebrew) and node must be findable.
const PATH = [dirname(NODE), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"].join(":");

if (process.platform === "darwin") {
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(NODE)}</string>
    <string>--experimental-strip-types</string>
    <string>--no-warnings</string>
    <string>${xml(TICK)}</string>
  </array>
  <key>WorkingDirectory</key><string>${xml(SITE_DIR)}</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml(PATH)}</string></dict>
  <key>StartInterval</key><integer>60</integer>
  <key>RunAtLoad</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>${xml(LOG)}</string>
  <key>StandardErrorPath</key><string>${xml(LOG)}</string>
</dict>
</plist>
`;
  step(`write ${PLIST}`);
  step(`launchctl bootstrap gui/${userInfo().uid} (runs every minute, logs to ${LOG})`);
  if (!dry) {
    mkdirSync(dirname(PLIST), { recursive: true });
    writeFileSync(PLIST, plist);
    spawnSync("launchctl", ["bootout", `gui/${userInfo().uid}/${LABEL}`], { stdio: "ignore" }); // replace an older install
    const r = spawnSync("launchctl", ["bootstrap", `gui/${userInfo().uid}`, PLIST], { encoding: "utf8" });
    if (r.status !== 0) {
      console.error(`launchctl bootstrap failed: ${(r.stderr || r.stdout).trim()}`);
      process.exit(1);
    }
  }
} else if (process.platform === "linux") {
  const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
  const line = `* * * * * cd ${q(SITE_DIR)} && PATH=${q(PATH)} ${q(NODE)} --experimental-strip-types --no-warnings ${q(TICK)} >> ${q(LOG)} 2>&1 ${MARK}`;
  const current = spawnSync("crontab", ["-l"], { encoding: "utf8" }).stdout ?? "";
  step(`add to crontab: ${line}`);
  if (!dry) execFileSync("crontab", ["-"], { input: [...current.split("\n").filter((l) => l && !l.includes(MARK)), line].join("\n") + "\n" });
} else {
  console.error(`No scheduler support for ${process.platform}. Run station-tick.mts every minute with Task Scheduler instead.`);
  process.exit(1);
}

// ---------- first tick ----------

step("run one tick now");
if (!dry) {
  const r = spawnSync(NODE, ["--experimental-strip-types", "--no-warnings", TICK, "--list"], { cwd: SITE_DIR, stdio: "inherit" });
  if (r.status === 0) spawnSync(NODE, ["--experimental-strip-types", "--no-warnings", TICK], { cwd: SITE_DIR, stdio: "inherit" });
}
console.log(`\nDone. Station's Laptop tile should read OK within a minute. Log: ${LOG}`);
