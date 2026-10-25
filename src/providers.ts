import type { ProviderDef, ProviderId } from "./types.js";

/**
 * Defaults researched 2026-10:
 * - Claude Code: `claude -p "..."` (print / headless)
 * - Hermes: `hermes -z "..."` (oneshot; preferred over `hermes chat -q` for scripts)
 * - Codex: `codex exec "..."` (non-interactive)
 *
 * "Cloud Code" from the user is treated as Claude Code (Anthropic).
 */
export const PROVIDERS: Record<ProviderId, ProviderDef> = {
  claude: {
    id: "claude",
    binary: "claude",
    label: "Claude Code",
    versionArgs: ["--version"],
    buildRunArgs: (prompt, extra) => ["-p", prompt, ...extra],
    installHint:
      "npm i -g @anthropic-ai/claude-code\n  Then run: claude  (and complete login)",
  },
  hermes: {
    id: "hermes",
    binary: "hermes",
    label: "Hermes Agent",
    versionArgs: ["--version"],
    // Fallback probe if --version unsupported
    authArgs: ["doctor"],
    buildRunArgs: (prompt, extra) => ["-z", prompt, ...extra],
    installHint:
      "curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash\n  Then: source ~/.bashrc && hermes setup",
  },
  codex: {
    id: "codex",
    binary: "codex",
    label: "OpenAI Codex",
    versionArgs: ["--version"],
    buildRunArgs: (prompt, extra) => ["exec", prompt, ...extra],
    installHint:
      "npm i -g @openai/codex\n  # or: curl -fsSL https://chatgpt.com/codex/install.sh | bash\n  Then: codex  (and complete login)",
  },
};

export const PROVIDER_IDS: ProviderId[] = ["claude", "hermes", "codex"];

export function isProviderId(s: string): s is ProviderId {
  return (PROVIDER_IDS as string[]).includes(s);
}

export function resolveProviderIds(arg: string): ProviderId[] | "all" {
  const key = arg.toLowerCase();
  if (key === "all") return "all";
  if (key === "claude" || key === "cloud" || key === "claude-code") return ["claude"];
  if (key === "hermes") return ["hermes"];
  if (key === "codex" || key === "openai") return ["codex"];
  throw new Error(
    `Unknown provider "${arg}". Use: claude | hermes | codex | all\n` +
      `  (aliases: cloud / claude-code → claude; openai → codex)`,
  );
}
