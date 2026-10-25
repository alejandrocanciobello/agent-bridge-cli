import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as toml from "toml";
import type { BridgeConfig, ProviderId } from "./types.js";
import { PROVIDERS } from "./providers.js";

export const CONFIG_DIR = path.join(os.homedir(), ".agentbridge");
export const CONFIG_PATH = path.join(CONFIG_DIR, "config.toml");

const DEFAULT_CONFIG_TOML = `# agentbridge config
# default_provider = "claude"   # claude | hermes | codex | all
timeout_ms = 600000

# [providers.claude]
# binary = "claude"
# extra_flags = ["--output-format", "text"]
# # Or fully override argv after the binary (use {prompt}):
# # run_args = ["-p", "{prompt}"]

# [providers.hermes]
# # Default oneshot is: hermes -z "{prompt}"
# # Alternative: run_args = ["chat", "-q", "{prompt}"]
# extra_flags = []

# [providers.codex]
# # Default: codex exec "{prompt}"
# extra_flags = ["--skip-git-repo-check"]
# timeout_ms = 600000
`;

export function ensureDefaultConfig(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, DEFAULT_CONFIG_TOML, "utf8");
  }
}

export function loadConfig(): BridgeConfig {
  ensureDefaultConfig();
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const parsed = toml.parse(raw) as Record<string, unknown>;
    const cfg: BridgeConfig = {};

    if (typeof parsed.default_provider === "string") {
      cfg.defaultProvider = parsed.default_provider as BridgeConfig["defaultProvider"];
    }
    if (typeof parsed.timeout_ms === "number") {
      cfg.timeoutMs = parsed.timeout_ms;
    }

    const providersRaw = parsed.providers;
    if (providersRaw && typeof providersRaw === "object") {
      cfg.providers = {};
      for (const id of Object.keys(PROVIDERS) as ProviderId[]) {
        const p = (providersRaw as Record<string, unknown>)[id];
        if (!p || typeof p !== "object") continue;
        const po = p as Record<string, unknown>;
        cfg.providers[id] = {
          binary: typeof po.binary === "string" ? po.binary : undefined,
          extraFlags: Array.isArray(po.extra_flags)
            ? po.extra_flags.map(String)
            : undefined,
          runArgs: Array.isArray(po.run_args) ? po.run_args.map(String) : undefined,
          timeoutMs: typeof po.timeout_ms === "number" ? po.timeout_ms : undefined,
        };
      }
    }
    return cfg;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Warning: could not parse ${CONFIG_PATH}: ${msg}`);
    return {};
  }
}

export function expandRunArgs(template: string[], prompt: string): string[] {
  return template.map((t) => t.replaceAll("{prompt}", prompt));
}
