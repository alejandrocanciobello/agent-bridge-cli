import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { expandRunArgs, loadConfig } from "./config.js";
import { detectProvider } from "./detect.js";
import { PROVIDERS } from "./providers.js";
import type { ProviderId, RunResult } from "./types.js";

export interface RunOptions {
  cwd: string;
  timeoutMs?: number;
  /** Extra argv appended after provider defaults */
  extraFlags?: string[];
}

function buildCommand(
  id: ProviderId,
  prompt: string,
  extraFlags: string[],
): { binary: string; args: string[] } {
  const def = PROVIDERS[id];
  const cfg = loadConfig();
  const pcfg = cfg.providers?.[id];
  const binary = pcfg?.binary ?? def.binary;
  const extras = [...(pcfg?.extraFlags ?? []), ...extraFlags];

  if (pcfg?.runArgs && pcfg.runArgs.length > 0) {
    return { binary, args: [...expandRunArgs(pcfg.runArgs, prompt), ...extras] };
  }
  return { binary, args: def.buildRunArgs(prompt, extras) };
}

export function runProvider(
  id: ProviderId,
  prompt: string,
  opts: RunOptions,
): Promise<RunResult> {
  const detected = detectProvider(id);
  const cfg = loadConfig();
  const timeoutMs =
    opts.timeoutMs ??
    cfg.providers?.[id]?.timeoutMs ??
    cfg.timeoutMs ??
    600_000;

  if (!detected.installed) {
    return Promise.resolve({
      provider: id,
      ok: false,
      exitCode: null,
      timedOut: false,
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: `${PROVIDERS[id].label} CLI ("${detected.binary}") not found on PATH.\nInstall:\n  ${PROVIDERS[id].installHint}`,
      command: [detected.binary],
    });
  }

  const { binary, args } = buildCommand(id, prompt, opts.extraFlags ?? []);
  const started = Date.now();

  return new Promise((resolve) => {
    const child = spawn(binary, args, {
      cwd: opts.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      const killTimer = setTimeout(() => {
        if (!settled) child.kill("SIGKILL");
      }, 5_000);
      killTimer.unref();
    }, timeoutMs);

    child.stdout?.on("data", (buf: Buffer) => {
      stdout += buf.toString("utf8");
    });
    child.stderr?.on("data", (buf: Buffer) => {
      stderr += buf.toString("utf8");
    });

    child.on("error", (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        provider: id,
        ok: false,
        exitCode: null,
        timedOut,
        durationMs: Date.now() - started,
        stdout,
        stderr,
        error: err.message,
        command: [binary, ...args],
      });
    });

    child.on("close", (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const exitCode = code ?? (timedOut ? 124 : 1);
      resolve({
        provider: id,
        ok: !timedOut && exitCode === 0,
        exitCode,
        timedOut,
        durationMs: Date.now() - started,
        stdout,
        stderr,
        error: timedOut
          ? `Timed out after ${timeoutMs}ms`
          : exitCode === 0
            ? undefined
            : `Exit code ${exitCode}`,
        command: [binary, ...args],
      });
    });
  });
}

export function makeRunDir(baseCwd: string): string {
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .replace(/Z$/, "Z");
  const dir = path.join(baseCwd, ".agentbridge", "runs", stamp);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeRunArtifacts(runDir: string, results: RunResult[]): void {
  for (const r of results) {
    const base = path.join(runDir, r.provider);
    fs.writeFileSync(`${base}.stdout.txt`, r.stdout, "utf8");
    fs.writeFileSync(`${base}.stderr.txt`, r.stderr, "utf8");
    fs.writeFileSync(
      `${base}.meta.json`,
      JSON.stringify(
        {
          provider: r.provider,
          ok: r.ok,
          exitCode: r.exitCode,
          timedOut: r.timedOut,
          durationMs: r.durationMs,
          error: r.error,
          command: r.command,
        },
        null,
        2,
      ),
      "utf8",
    );
  }
  fs.writeFileSync(
    path.join(runDir, "summary.json"),
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        results: results.map((r) => ({
          provider: r.provider,
          ok: r.ok,
          exitCode: r.exitCode,
          timedOut: r.timedOut,
          durationMs: r.durationMs,
          error: r.error,
        })),
      },
      null,
      2,
    ),
    "utf8",
  );
}

export function formatCompareMarkdown(prompt: string, results: RunResult[]): string {
  const lines: string[] = [
    `# agentbridge compare`,
    ``,
    `**Prompt:** ${prompt}`,
    ``,
    `| Provider | Status | Exit | Duration | Notes |`,
    `| --- | --- | --- | --- | --- |`,
  ];
  for (const r of results) {
    const status = r.ok ? "✅ ok" : r.timedOut ? "⏱️ timeout" : "❌ fail";
    const note = (r.error ?? "").replace(/\|/g, "\\|").split("\n")[0] ?? "";
    lines.push(
      `| ${r.provider} | ${status} | ${r.exitCode ?? "—"} | ${r.durationMs}ms | ${note} |`,
    );
  }
  lines.push(``);
  for (const r of results) {
    lines.push(`## ${r.provider}`);
    lines.push(``);
    if (r.stdout.trim()) {
      lines.push("```");
      lines.push(r.stdout.trim().slice(0, 4000));
      lines.push("```");
    } else {
      lines.push("_No stdout_");
    }
    lines.push(``);
  }
  return lines.join("\n");
}
