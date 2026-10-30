// PostToolUse: type-check the site after a .ts/.tsx edit under site/.
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;

let input;
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0);
}

const file = input?.tool_input?.file_path ?? "";
if (!/\/site\/(?!node_modules\/|\.next\/).*\.tsx?$/.test(file)) process.exit(0);

const site = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "site");
try {
  execFileSync("npx", ["tsc", "--noEmit"], { cwd: site, stdio: "pipe", timeout: 90_000 });
} catch (err) {
  const out = `${err.stdout ?? ""}${err.stderr ?? ""}`.trim().split("\n").slice(0, 30).join("\n");
  console.error(`tsc --noEmit failed in site/:\n${out}`);
  process.exit(2);
}
