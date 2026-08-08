/**
 * Reads `pitchframe/.env` into `process.env`.
 *
 * The voice-over never once ran. Not because the Maya client was wrong — it
 * was fine — but because `MAYA_API_KEY` lived in a chat message rather than in
 * the environment, `gen-voice.mjs` treated a missing key as a normal skip, and
 * every run after that quietly produced a silent video with beats timed by a
 * reading-speed guess. Four separate symptoms (no audio, no voice, no sync,
 * wrong beat lengths) all traced back to one unset variable that nothing ever
 * complained about.
 *
 * So: a file the key can live in permanently, and — in `require()` — a refusal
 * to continue without it. A secret that must be re-exported into every shell
 * is a secret that is absent most of the time.
 *
 * `.env` is gitignored. Nothing here ever writes or logs a key's value.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PITCHFRAME_DIR = path.resolve(__dirname, "..", "..");

/**
 * Deliberately minimal: `KEY=value`, one per line, `#` comments, optional
 * surrounding quotes. No interpolation, no `export` prefix, no multi-line
 * values — a config format with a parser is a config format with bugs, and
 * this one holds two keys at most.
 */
export const loadEnv = (dir = PITCHFRAME_DIR) => {
  const file = path.join(dir, ".env");
  if (!fs.existsSync(file)) return {};

  const loaded = {};
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq < 1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // A real environment variable outranks the file, so a one-off override on
    // the command line still works without editing anything.
    if (process.env[key] === undefined) process.env[key] = value;
    loaded[key] = true;
  }
  return loaded;
};

/**
 * Fetch a required secret, or explain precisely how to supply it and stop.
 *
 * The explanation matters more than the check. "MAYA_API_KEY is not set" sent
 * the last four runs down the silent path without anyone reading it.
 */
export const require_ = (name, { hint = "" } = {}) => {
  loadEnv();
  const value = process.env[name];
  if (value && value.trim()) return value.trim();

  process.stderr.write(
    `\n${name} is not set, so this step cannot run.\n\n` +
      `Put it in pitchframe/.env (gitignored, read automatically from now on):\n\n` +
      `    ${name}=your-key-here\n\n` +
      (hint ? `${hint}\n\n` : ""),
  );
  process.exit(1);
};
