import { existsSync, readFileSync } from "node:fs";

/**
 * Minimal .env reader.
 *
 * Node has `process.loadEnvFile`, but it overwrites what the process already has, which would
 * let a stale `.env` silently beat an explicitly exported variable. These helpers fill only the
 * gaps: the real environment always wins.
 */

export type EnvTarget = Record<string, string | undefined>;

const LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1);
    }
  }
  const comment = trimmed.indexOf(" #");
  return comment === -1 ? trimmed : trimmed.slice(0, comment).trim();
}

export function parseDotEnv(content: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const match = LINE.exec(line);
    if (!match) continue;
    const key = match[1];
    const raw = match[2];
    if (!key || raw === undefined) continue;
    values[key] = unquote(raw);
  }
  return values;
}

/** Applies parsed values, skipping any key the target already defines. Returns the applied keys. */
export function applyDotEnv(values: Record<string, string>, target: EnvTarget): string[] {
  const applied: string[] = [];
  for (const [key, value] of Object.entries(values)) {
    if (target[key] !== undefined) continue;
    target[key] = value;
    applied.push(key);
  }
  return applied;
}

export function loadDotEnv(path: string, target: EnvTarget = process.env): string[] {
  if (!existsSync(path)) return [];
  return applyDotEnv(parseDotEnv(readFileSync(path, "utf8")), target);
}
