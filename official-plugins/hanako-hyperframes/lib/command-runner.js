import { spawn } from "node:child_process";

const NODE_MAJOR_FLOOR = 22;
const WINDOWS_CMD = "cmd.exe";
const PACKAGE_RUNNERS = new Set(["npx", "npm", "pnpm", "yarn"]);

export class CommandRunner {
  constructor({
    command = "npx --yes hyperframes",
    env = {},
    disableTelemetry = true,
    spawn: spawnImpl = spawnPromise,
  } = {}) {
    this.command = command;
    this.env = env;
    this.disableTelemetry = disableTelemetry;
    this.spawn = spawnImpl;
  }

  async run(args = [], { cwd } = {}) {
    const [file, ...baseArgs] = parseCommandLine(this.command);
    if (!file) throw new Error("HyperFrames command is empty");
    const finalArgs = [...baseArgs, ...args.map(String)];
    const env = {
      ...process.env,
      ...this.env,
      ...(this.disableTelemetry ? { HYPERFRAMES_NO_TELEMETRY: "1" } : {}),
    };

    const result = await this.spawn(file, finalArgs, { cwd, env });
    const ok = result.code === 0;
    const stderr = result.stderr || "";
    const stdout = result.stdout || "";
    return {
      ok,
      code: result.code,
      stdout,
      stderr,
      error: ok ? null : (stderr.trim() || stdout.trim() || `Command failed with exit code ${result.code}`),
      command: [file, ...finalArgs],
    };
  }

  async diagnostics({ cwd } = {}) {
    const checks = [
      await this.checkNode({ cwd }),
    ];
    const commandRunner = await this.checkConfiguredCommandRunner({ cwd });
    if (commandRunner) checks.push(commandRunner);
    checks.push(
      await this.checkExecutable({
        id: "ffmpeg",
        label: "FFmpeg",
        file: "ffmpeg",
        args: ["-version"],
        cwd,
        missingDetail: "FFmpeg is required for media probing and video rendering. Install FFmpeg and make sure ffmpeg is on PATH.",
      }),
      await this.checkExecutable({
        id: "ffprobe",
        label: "FFprobe",
        file: "ffprobe",
        args: ["-version"],
        cwd,
        missingDetail: "FFprobe is required for media metadata inspection. Install FFmpeg/FFprobe and make sure ffprobe is on PATH.",
      }),
      await this.checkHyperFrames({ cwd }),
    );
    return {
      ok: checks.every((check) => check.ok),
      checks,
    };
  }

  async checkNode({ cwd } = {}) {
    const result = await this.runExecutable("node", ["--version"], { cwd });
    if (!result.ok) {
      return {
        id: "node",
        label: "Node.js 22+",
        ok: false,
        detail: "Node.js 22+ is required by HyperFrames. Install Node.js 22 or newer and make sure node is on PATH.",
      };
    }

    const version = summarizeOutput(result.stdout);
    const major = parseNodeMajor(version);
    const ok = major >= NODE_MAJOR_FLOOR;
    return {
      id: "node",
      label: "Node.js 22+",
      ok,
      detail: ok ? version : `Found ${version || "an unknown Node.js version"}; requires Node.js 22+.`,
    };
  }

  async checkHyperFrames({ cwd } = {}) {
    const version = await this.run(["--version"], { cwd });
    return {
      id: "hyperframes",
      label: "HyperFrames CLI",
      ok: version.ok,
      detail: version.ok
        ? summarizeOutput(version.stdout)
        : `HyperFrames CLI is unavailable. Install or configure HyperFrames CLI before running HyperFrames commands. ${version.error || ""}`.trim(),
    };
  }

  async checkConfiguredCommandRunner({ cwd } = {}) {
    const [file] = parseCommandLine(this.command);
    const runner = packageRunnerName(file);
    if (!runner) return null;
    return this.checkExecutable({
      id: runner,
      label: runner,
      file: runner,
      args: ["--version"],
      cwd,
      missingDetail: `${runner} is required by the configured HyperFrames command. Install or configure ${runner}, or set the plugin to a direct HyperFrames CLI command.`,
    });
  }

  async checkExecutable({ id, label, file, args, cwd, missingDetail }) {
    const result = await this.runExecutable(file, args, { cwd });
    return {
      id,
      label,
      ok: result.ok,
      detail: result.ok ? summarizeOutput(result.stdout || result.stderr) : formatFailureDetail(result.error, missingDetail),
    };
  }

  async runExecutable(file, args, { cwd } = {}) {
    const env = {
      ...process.env,
      ...this.env,
      ...(this.disableTelemetry ? { HYPERFRAMES_NO_TELEMETRY: "1" } : {}),
    };
    const result = await this.spawn(file, args.map(String), { cwd, env });
    const ok = result.code === 0;
    const stderr = result.stderr || "";
    const stdout = result.stdout || "";
    return {
      ok,
      code: result.code,
      stdout,
      stderr,
      error: ok ? null : (stderr.trim() || stdout.trim() || `Command failed with exit code ${result.code}`),
      command: [file, ...args],
    };
  }
}

export function parseCommandLine(input) {
  const parts = [];
  let current = "";
  let quote = null;
  let escaping = false;

  for (const char of String(input || "").trim()) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        parts.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (escaping) current += "\\";
  if (quote) throw new Error("Unclosed quote in command");
  if (current) parts.push(current);
  return parts;
}

export function createSpawnInvocation(file, args = [], options = {}, platform = process.platform) {
  const spawnOptions = {
    ...options,
    shell: false,
    windowsHide: true,
  };
  if (platform !== "win32" || !requiresWindowsCommandProcessor(file)) {
    return { file, args, options: spawnOptions };
  }

  return {
    file: process.env.ComSpec || WINDOWS_CMD,
    args: ["/d", "/s", "/c", quoteWindowsCommand([file, ...args])],
    options: spawnOptions,
  };
}

function spawnPromise(file, args, options) {
  return new Promise((resolve) => {
    const invocation = createSpawnInvocation(file, args, options);
    const child = spawn(invocation.file, invocation.args, invocation.options);
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolve({ code: 127, stdout, stderr: error.message });
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}

function parseNodeMajor(version) {
  const match = /^v?(\d+)/.exec(String(version || "").trim());
  return match ? Number(match[1]) : 0;
}

function packageRunnerName(file) {
  const name = commandBaseName(file);
  return PACKAGE_RUNNERS.has(name) ? name : null;
}

function commandBaseName(file) {
  const base = String(file || "").split(/[\\/]/).pop() || "";
  return base.replace(/\.(cmd|bat|exe)$/i, "").toLowerCase();
}

function formatFailureDetail(error, missingDetail) {
  if (!missingDetail) return error || "Command failed";
  return error ? `${missingDetail} (${error})` : missingDetail;
}

function summarizeOutput(output) {
  const line = String(output || "")
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find(Boolean);
  return line || "";
}

function requiresWindowsCommandProcessor(file) {
  const base = String(file || "").split(/[\\/]/).pop() || "";
  const hasExtension = /\.[a-z0-9]+$/i.test(base);
  if (!hasExtension) return true;
  return /\.(cmd|bat)$/i.test(base);
}

function quoteWindowsCommand(parts) {
  return parts.map(quoteWindowsArg).join(" ");
}

function quoteWindowsArg(value) {
  const text = String(value);
  if (!text) return "\"\"";
  const escaped = text
    .replace(/(\\*)"/g, "$1$1\\\"")
    .replace(/(\\+)$/g, "$1$1")
    .replace(/%/g, "%%");
  return `"${escaped}"`;
}
