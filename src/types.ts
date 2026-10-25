export type ProviderId = "claude" | "hermes" | "codex";

export interface ProviderDef {
  id: ProviderId;
  /** Binary name on PATH */
  binary: string;
  /** Human label */
  label: string;
  /** How to check version */
  versionArgs: string[];
  /** Optional auth-ish probe (may fail without keys) */
  authArgs?: string[];
  /** Build argv for a one-shot prompt (binary itself is prepended by runner) */
  buildRunArgs: (prompt: string, extraFlags: string[]) => string[];
  installHint: string;
}

export interface ProviderConfig {
  extraFlags?: string[];
  /** Override the binary name/path */
  binary?: string;
  /** Override run args template: use {prompt} placeholder; space-separated tokens */
  runArgs?: string[];
  timeoutMs?: number;
}

export interface BridgeConfig {
  defaultProvider?: ProviderId | "all";
  timeoutMs?: number;
  providers?: Partial<Record<ProviderId, ProviderConfig>>;
}

export interface RunResult {
  provider: ProviderId;
  ok: boolean;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
  error?: string;
  command: string[];
}
