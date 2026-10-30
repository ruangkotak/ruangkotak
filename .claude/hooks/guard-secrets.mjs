// PreToolUse: block edits to env files, lockfiles and build output.
let raw = "";
for await (const chunk of process.stdin) raw += chunk;

let input;
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0);
}

const file = input?.tool_input?.file_path ?? "";
const rules = [
  [/(^|\/)\.env(\.[^/]*)?$/, "env files hold real tokens; edit them yourself (.env.example is allowed)"],
  [/(^|\/)package-lock\.json$/, "lockfiles change through npm, not by hand"],
  [/(^|\/)site\/\.next\//, "build output is generated"],
];

for (const [pattern, reason] of rules) {
  if (pattern.test(file) && !file.endsWith(".env.example")) {
    console.error(`Blocked edit to ${file}: ${reason}.`);
    process.exit(2);
  }
}
