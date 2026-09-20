import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { z } from "zod";

export const ConfigSchema = z.object({
  enabled: z.boolean(),
  public_key: z.string().optional(),
  secret_key: z.string().optional(),
  base_url: z.string(),
  environment: z.string().optional(),
  user_id: z.string().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  trace_seed: z.string().optional(),
  max_chars: z.number().int().positive(),
  debug: z.boolean(),
  fail_on_error: z.boolean(),
});

export type Config = z.infer<typeof ConfigSchema>;
const PartialConfigSchema = ConfigSchema.partial();
const DEFAULTS: Pick<Config, "enabled" | "base_url" | "max_chars" | "debug" | "fail_on_error"> = {
  enabled: false,
  base_url: "https://cloud.langfuse.com",
  max_chars: 20_000,
  debug: false,
  fail_on_error: false,
};

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  if (["1", "true", "yes", "on"].includes(value.trim().toLowerCase())) return true;
  if (["0", "false", "no", "off"].includes(value.trim().toLowerCase())) return false;
  return undefined;
}

function parseTags(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string" || !value.trim()) return undefined;
  const text = value.trim();
  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // Fall through to comma-separated parsing.
    }
  }
  return text
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function parseMetadata(value: unknown): Record<string, string> | undefined {
  let parsed: unknown = value;
  if (typeof value === "string") {
    if (!value.trim()) return undefined;
    try {
      parsed = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
  return Object.fromEntries(
    Object.entries(parsed as Record<string, unknown>).map(([key, item]) => [
      key,
      typeof item === "string" ? item : JSON.stringify(item),
    ]),
  );
}

function parseInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stripUndefined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

async function readConfigFile(file: string): Promise<Partial<Config> | undefined> {
  try {
    const raw = JSON.parse(await fs.readFile(file, "utf8")) as Record<string, unknown>;
    return PartialConfigSchema.parse(
      stripUndefined({
        ...raw,
        enabled: raw.enabled == null ? undefined : parseBoolean(raw.enabled),
        tags: raw.tags == null ? undefined : parseTags(raw.tags),
        metadata: raw.metadata == null ? undefined : parseMetadata(raw.metadata),
        max_chars: raw.max_chars == null ? undefined : parseInteger(raw.max_chars),
        debug: raw.debug == null ? undefined : parseBoolean(raw.debug),
        fail_on_error: raw.fail_on_error == null ? undefined : parseBoolean(raw.fail_on_error),
      }),
    );
  } catch {
    return undefined;
  }
}

function getVar(suffix: string, env: Record<string, string | undefined>): string | undefined {
  return env[`LANGFUSE_MINIMAX_${suffix}`] ?? env[`LANGFUSE_${suffix}`];
}

function readEnvConfig(env: Record<string, string | undefined>): Partial<Config> {
  return PartialConfigSchema.parse(
    stripUndefined({
      enabled: parseBoolean(env.TRACE_TO_LANGFUSE),
      public_key: getVar("PUBLIC_KEY", env),
      secret_key: getVar("SECRET_KEY", env),
      base_url: getVar("BASE_URL", env),
      environment: env.LANGFUSE_MINIMAX_ENVIRONMENT ?? env.LANGFUSE_TRACING_ENVIRONMENT,
      user_id: env.LANGFUSE_MINIMAX_USER_ID,
      tags: parseTags(env.LANGFUSE_MINIMAX_TAGS),
      metadata: parseMetadata(env.LANGFUSE_MINIMAX_METADATA),
      trace_seed: env.LANGFUSE_MINIMAX_TRACE_SEED,
      max_chars: parseInteger(env.LANGFUSE_MINIMAX_MAX_CHARS),
      debug: parseBoolean(env.LANGFUSE_MINIMAX_DEBUG),
      fail_on_error: parseBoolean(env.LANGFUSE_MINIMAX_FAIL_ON_ERROR),
    }),
  );
}

export async function getConfig(options?: {
  home?: string;
  cwd?: string;
  env?: Record<string, string | undefined>;
}): Promise<Config> {
  const home = options?.home ?? process.env.HOME ?? os.homedir();
  const cwd = options?.cwd ?? process.cwd();
  const env = options?.env ?? process.env;
  const [globalConfig, localConfig] = await Promise.all([
    readConfigFile(path.join(home, ".minimax-code", "langfuse.json")),
    readConfigFile(path.join(cwd, ".minimax", "langfuse.json")),
  ]);
  return ConfigSchema.parse({
    ...DEFAULTS,
    ...globalConfig,
    ...localConfig,
    ...readEnvConfig(env),
  });
}
