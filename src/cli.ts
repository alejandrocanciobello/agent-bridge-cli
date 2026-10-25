#!/usr/bin/env node
import { parseArgs } from "node:util";
import path from "node:path";
import fs from "node:fs";
import { CONFIG_PATH, ensureDefaultConfig, loadConfig } from "./config.js";
import { availableProviders, detectAll, detectProvider } from "./detect.js";
import { PROVIDERS, resolveProviderIds, PROVIDER_IDS } from "./providers.js";
import {
  formatCompareMarkdown,
  makeRunDir,
  runProvider,
  writeRunArtifacts,
} from "./run.js";
import type { ProviderId, RunResult } from "./types.js";

const VERSION = "1.0.0";

function printHelp(): void {
  console.log(`agentbridge v${VERSION} — unified bridge for Claude Code, Hermes, Codex

Usage:
  agentbridge status
  agentbridge run <provider|all> <prompt> [options]
  agentbridge compare <prompt> [options]
  agentbridge config path
  agentbridge init-config
  agentbridge help
  agentbridge version

Providers:
  claude   Claude Code (Anthropic) — alias: cloud, claude-code
  hermes   Hermes Agent (Nous Research)
  codex    OpenAI Codex — alias: openai
  all      Every provider installed on PATH

Options:
  -C, --cwd <dir>       Working directory (default: process cwd)
  -t, --timeout <ms>    Per-provider timeout (default: config or 600000)
  --sequential          Run "all" / compare one after another
  --extra <flags...>    Extra flags appended to the provider command
                        (everything after -- is also forwarded)

Examples:
  agentbridge status
  agentbridge run claude "Summarize this repo in 5 bullets"
  agentbridge run hermes "List the main entrypoints"
  agentbridge run codex "What tests should I add?"
  agentbridge run all "Explain the project structure"
  agentbridge compare "Propose a next shipping task"
  agentbridge run claude -C ~/code/my-app "Fix the failing tests"

Config: ${CONFIG_PATH}
`);
}

function printStatus(): number {
  ensureDefaultConfig();
  const rows = detectAll();
  console.log("agentbridge status\n");
  for (const r of rows) {
    const mark = r.installed ? "✓" : "✗";
    console.log(`${mark} ${r.id.padEnd(8)} ${r.label}`);
    console.log(`    binary:  ${r.binary}${r.pathHint ? ` → ${r.pathHint}` : " (not on PATH)"}`);
    if (r.installed) {
      console.log(`    version: ${r.version}`);
      if (r.authNote) console.log(`    note:    ${r.authNote}`);
    } else {
      console.log(`    install:\n${indent(r.installHint, 6)}`);
    }
    console.log("");
  }
  const n = rows.filter((r) => r.installed).length;
  console.log(`${n}/${rows.length} providers installed.`);
  console.log(`Config: ${CONFIG_PATH}`);
  return 0;
}

function indent(s: string, n: number): string {
  const pad = " ".repeat(n);
  return s
    .split("\n")
    .map((l) => pad + l)
    .join("\n");
}

async function cmdRun(
  providerArg: string,
  prompt: string,
  opts: { cwd: string; timeoutMs?: number; sequential: boolean; extra: string[] },
  compare: boolean,
): Promise<number> {
  const resolved = resolveProviderIds(providerArg);
  let ids: ProviderId[] =
    resolved === "all" ? [...PROVIDER_IDS] : resolved;

  if (resolved === "all" || compare) {
    const avail = new Set(availableProviders());
    const missing = ids.filter((id) => !avail.has(id));
    ids = ids.filter((id) => avail.has(id));
    if (missing.length) {
      console.error(
        `Skipping missing providers: ${missing.join(", ")} (see: agentbridge status)`,
      );
    }
    if (ids.length === 0) {
      console.error("No providers installed. Install at least one, then retry.");
      for (const id of PROVIDER_IDS) {
        console.error(`\n${id}:\n  ${PROVIDERS[id].installHint}`);
      }
      return 1;
    }
  }

  const runDir = makeRunDir(opts.cwd);
  console.error(`Run dir: ${runDir}`);

  const results: RunResult[] = [];

  if (opts.sequential || ids.length === 1) {
    for (const id of ids) {
      console.error(`\n── ${id} ──`);
      const r = await runProvider(id, prompt, {
        cwd: opts.cwd,
        timeoutMs: opts.timeoutMs,
        extraFlags: opts.extra,
      });
      results.push(r);
      printResult(r);
    }
  } else {
    console.error(`Running in parallel: ${ids.join(", ")}`);
    const settled = await Promise.all(
      ids.map((id) =>
        runProvider(id, prompt, {
          cwd: opts.cwd,
          timeoutMs: opts.timeoutMs,
          extraFlags: opts.extra,
        }),
      ),
    );
    results.push(...settled);
    for (const r of results) {
      console.error(`\n── ${r.provider} ──`);
      printResult(r);
    }
  }

  writeRunArtifacts(runDir, results);

  if (compare) {
    const md = formatCompareMarkdown(prompt, results);
    const mdPath = path.join(runDir, "compare.md");
    fs.writeFileSync(mdPath, md, "utf8");
    console.log("\n" + md);
    console.error(`\nWrote ${mdPath}`);
  } else if (ids.length === 1 && results[0]) {
    // Single-provider: stream stdout to stdout for piping
    if (results[0].stdout) process.stdout.write(results[0].stdout);
    if (!results[0].stdout.endsWith("\n") && results[0].stdout.length) {
      process.stdout.write("\n");
    }
  }

  console.error(`\nArtifacts: ${runDir}`);
  return results.every((r) => r.ok) ? 0 : 1;
}

function printResult(r: RunResult): void {
  const status = r.ok ? "ok" : r.timedOut ? "TIMEOUT" : "FAIL";
  console.error(`[${r.provider}] ${status} exit=${r.exitCode ?? "—"} ${r.durationMs}ms`);
  console.error(`[${r.provider}] $ ${r.command.map(shellQuote).join(" ")}`);
  if (r.error && !r.ok) console.error(`[${r.provider}] ${r.error}`);
  if (r.stderr.trim()) {
    const preview = r.stderr.trim().slice(0, 800);
    console.error(`[${r.provider}] stderr:\n${preview}`);
  }
}

function shellQuote(s: string): string {
  if (/^[a-zA-Z0-9_./:@%+=,-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "help" || argv[0] === "--help" || argv[0] === "-h") {
    printHelp();
    process.exit(0);
  }
  if (argv[0] === "version" || argv[0] === "--version" || argv[0] === "-V") {
    console.log(VERSION);
    process.exit(0);
  }

  const cmd = argv[0];

  if (cmd === "status") {
    process.exit(printStatus());
  }

  if (cmd === "config" && argv[1] === "path") {
    ensureDefaultConfig();
    console.log(CONFIG_PATH);
    process.exit(0);
  }

  if (cmd === "init-config") {
    ensureDefaultConfig();
    console.log(`Wrote ${CONFIG_PATH}`);
    process.exit(0);
  }

  if (cmd === "run" || cmd === "compare") {
    const rest = argv.slice(1);
    // Split on -- for forwarded flags
    const dd = rest.indexOf("--");
    const before = dd >= 0 ? rest.slice(0, dd) : rest;
    const after = dd >= 0 ? rest.slice(dd + 1) : [];

    let providerArg = "all";
    let promptParts: string[] = [];

    if (cmd === "compare") {
      promptParts = before.filter((a: string) => !a.startsWith("-"));
      // allow flags mixed in
    } else {
      // run <provider> <prompt...>
      if (before.length === 0) {
        console.error("Usage: agentbridge run <provider|all> <prompt>");
        process.exit(2);
      }
      providerArg = before[0]!;
      promptParts = [];
    }

    // Parse flags from before (and keep positional prompt)
    const flagArgs: string[] = [];
    const positionals: string[] = [];
    for (let i = cmd === "run" ? 1 : 0; i < before.length; i++) {
      const a = before[i]!;
      if (a === "-C" || a === "--cwd" || a === "-t" || a === "--timeout" || a === "--extra") {
        flagArgs.push(a);
        if (before[i + 1]) {
          flagArgs.push(before[++i]!);
        }
      } else if (a === "--sequential") {
        flagArgs.push(a);
      } else if (a.startsWith("-")) {
        flagArgs.push(a);
      } else {
        positionals.push(a);
      }
    }
    promptParts = positionals;

    let parsed: ReturnType<typeof parseArgs>;
    try {
      parsed = parseArgs({
        args: flagArgs,
        options: {
          cwd: { type: "string", short: "C" },
          timeout: { type: "string", short: "t" },
          sequential: { type: "boolean", default: false },
          extra: { type: "string", multiple: true },
        },
        allowPositionals: false,
        strict: false,
      });
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      process.exit(2);
    }

    const prompt = promptParts.join(" ").trim();
    if (!prompt) {
      console.error(
        cmd === "compare"
          ? 'Usage: agentbridge compare "prompt"'
          : 'Usage: agentbridge run <provider|all> "prompt"',
      );
      process.exit(2);
    }

    const cwd = path.resolve(
      (parsed.values.cwd as string | undefined) ?? process.cwd(),
    );
    if (!fs.existsSync(cwd)) {
      console.error(`cwd does not exist: ${cwd}`);
      process.exit(2);
    }

    const timeoutRaw = parsed.values.timeout as string | undefined;
    const timeoutMs = timeoutRaw ? Number(timeoutRaw) : undefined;
    if (timeoutRaw && !Number.isFinite(timeoutMs)) {
      console.error(`Invalid --timeout: ${timeoutRaw}`);
      process.exit(2);
    }

    const extra = [
      ...((parsed.values.extra as string[] | undefined) ?? []),
      ...after,
    ];

    // For compare, always use all available
    const provider = cmd === "compare" ? "all" : providerArg;

    // Soft check for single provider missing → clear error
    if (provider !== "all") {
      try {
        const ids = resolveProviderIds(provider);
        if (ids !== "all") {
          const d = detectProvider(ids[0]!);
          if (!d.installed) {
            console.error(
              `${PROVIDERS[ids[0]!].label} CLI ("${d.binary}") not found on PATH.\nInstall:\n  ${PROVIDERS[ids[0]!].installHint}`,
            );
            process.exit(1);
          }
        }
      } catch (err) {
        console.error(err instanceof Error ? err.message : err);
        process.exit(2);
      }
    }

    const code = await cmdRun(
      provider,
      prompt,
      {
        cwd,
        timeoutMs,
        sequential: Boolean(parsed.values.sequential),
        extra,
      },
      cmd === "compare",
    );
    process.exit(code);
  }

  console.error(`Unknown command: ${cmd}`);
  printHelp();
  process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
