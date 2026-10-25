import { spawnSync } from "node:child_process";
import { loadConfig } from "./config.js";
import { PROVIDERS, PROVIDER_IDS } from "./providers.js";
import type { ProviderId } from "./types.js";

export interface DetectResult {
  id: ProviderId;
  label: string;
  binary: string;
  installed: boolean;
  version?: string;
  authNote?: string;
  pathHint?: string;
  installHint: string;
}

function which(binary: string): string | undefined {
  const cmd = process.platform === "win32" ? "where" : "which";
  const r = spawnSync(cmd, [binary], { encoding: "utf8" });
  if (r.status === 0) {
    return r.stdout.trim().split("\n")[0]?.trim() || undefined;
  }
  return undefined;
}

function probeVersion(binary: string, args: string[]): string | undefined {
  const r = spawnSync(binary, args, {
    encoding: "utf8",
    timeout: 15_000,
    env: process.env,
  });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  if (r.error && (r.error as NodeJS.ErrnoException).code === "ENOENT") {
    return undefined;
  }
  if (out) {
    // First non-empty line, truncated
    const line = out.split("\n").map((l) => l.trim()).find(Boolean) ?? out;
    return line.slice(0, 120);
  }
  if (r.status === 0) return "(ok, no version string)";
  return undefined;
}

export function detectProvider(id: ProviderId): DetectResult {
  const def = PROVIDERS[id];
  const cfg = loadConfig();
  const binary = cfg.providers?.[id]?.binary ?? def.binary;
  const pathHint = which(binary);
  const installed = Boolean(pathHint);

  const result: DetectResult = {
    id,
    label: def.label,
    binary,
    installed,
    pathHint,
    installHint: def.installHint,
  };

  if (!installed) return result;

  const version =
    probeVersion(binary, def.versionArgs) ??
    (def.authArgs ? probeVersion(binary, def.authArgs) : undefined);
  result.version = version ?? "(installed; version probe failed)";

  // Soft auth readiness notes — we do not invent success
  if (id === "claude") {
    result.authNote =
      "Auth not probed deeply. Run `claude` interactively once if print mode fails.";
  } else if (id === "hermes") {
    result.authNote =
      "Auth not probed deeply. Run `hermes doctor` / `hermes setup` if oneshot fails.";
  } else if (id === "codex") {
    result.authNote =
      "Auth not probed deeply. Run `codex` interactively once if exec fails.";
  }

  return result;
}

export function detectAll(): DetectResult[] {
  return PROVIDER_IDS.map(detectProvider);
}

export function availableProviders(): ProviderId[] {
  return detectAll().filter((d) => d.installed).map((d) => d.id);
}
