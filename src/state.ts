import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import type { SessionState } from "./types.js";

function statePath(dataDir: string, sessionId: string): string {
  const key = createHash("sha256").update(sessionId).digest("hex").slice(0, 32);
  return path.join(dataDir, `${key}.json`);
}

const empty = (sessionId: string): SessionState => ({
  sessionId,
  uploadedTurnIds: [],
  turnNumbers: {},
});

export async function loadState(dataDir: string, sessionId: string): Promise<SessionState> {
  try {
    const value = JSON.parse(
      await fs.readFile(statePath(dataDir, sessionId), "utf8"),
    ) as Partial<SessionState>;
    return {
      sessionId,
      uploadedTurnIds: Array.isArray(value.uploadedTurnIds)
        ? value.uploadedTurnIds.filter((x): x is string => typeof x === "string")
        : [],
      turnNumbers:
        value.turnNumbers && typeof value.turnNumbers === "object" ? value.turnNumbers : {},
    };
  } catch {
    return empty(sessionId);
  }
}

export async function saveState(dataDir: string, state: SessionState): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
  const file = statePath(dataDir, state.sessionId);
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temp, file);
}

export function ensureTurnNumber(state: SessionState, turnId: string): number {
  const existing = state.turnNumbers[turnId];
  if (existing) return existing;
  const next = Math.max(0, ...Object.values(state.turnNumbers)) + 1;
  state.turnNumbers[turnId] = next;
  return next;
}
