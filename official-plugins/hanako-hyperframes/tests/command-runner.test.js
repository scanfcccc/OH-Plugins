import assert from "node:assert/strict";
import test from "node:test";
import { CommandRunner, createSpawnInvocation, parseCommandLine } from "../lib/command-runner.js";

test("parses command strings without using a shell", () => {
  assert.deepEqual(parseCommandLine("npx --yes hyperframes"), ["npx", "--yes", "hyperframes"]);
  assert.deepEqual(parseCommandLine("node \"/tmp/with space/cli.js\""), ["node", "/tmp/with space/cli.js"]);
});

test("runs hyperframes commands with telemetry disabled by default", async () => {
  const calls = [];
  const runner = new CommandRunner({
    command: "npx --yes hyperframes",
    spawn: async (file, args, options) => {
      calls.push({ file, args, options });
      return { code: 0, stdout: "ok", stderr: "" };
    },
  });

  const result = await runner.run(["lint", "--json"], { cwd: "/tmp/project" });

  assert.equal(result.ok, true);
  assert.equal(result.stdout, "ok");
  assert.equal(calls[0].file, "npx");
  assert.deepEqual(calls[0].args, ["--yes", "hyperframes", "lint", "--json"]);
  assert.equal(calls[0].options.cwd, "/tmp/project");
  assert.equal(calls[0].options.env.HYPERFRAMES_NO_TELEMETRY, "1");
});

test("returns structured command failures", async () => {
  const runner = new CommandRunner({
    command: "hyperframes",
    spawn: async () => ({ code: 2, stdout: "", stderr: "lint failed" }),
  });

  const result = await runner.run(["lint"], { cwd: "/tmp/project" });

  assert.equal(result.ok, false);
  assert.equal(result.code, 2);
  assert.equal(result.error, "lint failed");
});

test("diagnostics checks required runtime dependencies", async () => {
  const calls = [];
  const outputs = new Map([
    ["node --version", { code: 0, stdout: "v22.4.0\n", stderr: "" }],
    ["npx --version", { code: 0, stdout: "10.8.2\n", stderr: "" }],
    ["ffmpeg -version", { code: 0, stdout: "ffmpeg version 7.0\n", stderr: "" }],
    ["ffprobe -version", { code: 0, stdout: "ffprobe version 7.0\n", stderr: "" }],
    ["npx --yes hyperframes --version", { code: 0, stdout: "0.3.0\n", stderr: "" }],
  ]);
  const runner = new CommandRunner({
    command: "npx --yes hyperframes",
    spawn: async (file, args, options) => {
      calls.push({ file, args, options });
      return outputs.get([file, ...args].join(" ")) ?? { code: 127, stdout: "", stderr: "missing" };
    },
  });

  const result = await runner.diagnostics({ cwd: "/tmp/project" });

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.checks.map((check) => check.id),
    ["node", "npx", "ffmpeg", "ffprobe", "hyperframes"],
  );
  assert.equal(result.checks.every((check) => check.ok), true);
  assert.equal(calls[0].options.cwd, "/tmp/project");
});

test("diagnostics rejects Node versions below the HyperFrames floor", async () => {
  const outputs = new Map([
    ["node --version", { code: 0, stdout: "v20.11.1\n", stderr: "" }],
    ["npx --version", { code: 0, stdout: "10.8.2\n", stderr: "" }],
    ["ffmpeg -version", { code: 0, stdout: "ffmpeg version 7.0\n", stderr: "" }],
    ["ffprobe -version", { code: 0, stdout: "ffprobe version 7.0\n", stderr: "" }],
    ["npx --yes hyperframes --version", { code: 0, stdout: "0.3.0\n", stderr: "" }],
  ]);
  const runner = new CommandRunner({
    command: "npx --yes hyperframes",
    spawn: async (file, args) => outputs.get([file, ...args].join(" ")) ?? { code: 127, stdout: "", stderr: "missing" },
  });

  const result = await runner.diagnostics({ cwd: "/tmp/project" });
  const node = result.checks.find((check) => check.id === "node");

  assert.equal(result.ok, false);
  assert.equal(node.ok, false);
  assert.match(node.detail, /requires Node\.js 22\+/i);
});

test("diagnostics does not require npx when a custom command does not use it", async () => {
  const calls = [];
  const outputs = new Map([
    ["node --version", { code: 0, stdout: "v22.4.0\n", stderr: "" }],
    ["ffmpeg -version", { code: 0, stdout: "ffmpeg version 7.0\n", stderr: "" }],
    ["ffprobe -version", { code: 0, stdout: "ffprobe version 7.0\n", stderr: "" }],
    ["/opt/hyperframes/bin/hyperframes --version", { code: 0, stdout: "0.3.0\n", stderr: "" }],
  ]);
  const runner = new CommandRunner({
    command: "/opt/hyperframes/bin/hyperframes",
    spawn: async (file, args) => {
      calls.push([file, ...args].join(" "));
      return outputs.get([file, ...args].join(" ")) ?? { code: 127, stdout: "", stderr: "missing" };
    },
  });

  const result = await runner.diagnostics({ cwd: "/tmp/project" });

  assert.equal(result.ok, true);
  assert.equal(calls.includes("npx --version"), false);
  assert.deepEqual(
    result.checks.map((check) => check.id),
    ["node", "ffmpeg", "ffprobe", "hyperframes"],
  );
});

test("diagnostics includes installation guidance for missing system dependencies", async () => {
  const outputs = new Map([
    ["node --version", { code: 0, stdout: "v22.4.0\n", stderr: "" }],
    ["npx --version", { code: 0, stdout: "10.8.2\n", stderr: "" }],
    ["ffmpeg -version", { code: 127, stdout: "", stderr: "spawn ffmpeg ENOENT" }],
    ["ffprobe -version", { code: 0, stdout: "ffprobe version 7.0\n", stderr: "" }],
    ["npx --yes hyperframes --version", { code: 0, stdout: "0.3.0\n", stderr: "" }],
  ]);
  const runner = new CommandRunner({
    command: "npx --yes hyperframes",
    spawn: async (file, args) => outputs.get([file, ...args].join(" ")) ?? { code: 127, stdout: "", stderr: "missing" },
  });

  const result = await runner.diagnostics({ cwd: "/tmp/project" });
  const ffmpeg = result.checks.find((check) => check.id === "ffmpeg");

  assert.equal(result.ok, false);
  assert.match(ffmpeg.detail, /Install FFmpeg/);
  assert.match(ffmpeg.detail, /spawn ffmpeg ENOENT/);
});

test("normalizes Windows command shims through cmd without enabling shell mode", () => {
  const invocation = createSpawnInvocation(
    "npx",
    ["--yes", "hyperframes", "preview"],
    { cwd: "C:\\project" },
    "win32",
  );

  assert.equal(invocation.file.toLowerCase(), "cmd.exe");
  assert.deepEqual(invocation.args.slice(0, 3), ["/d", "/s", "/c"]);
  assert.match(invocation.args[3], /"npx" "--yes" "hyperframes" "preview"/);
  assert.equal(invocation.options.cwd, "C:\\project");
  assert.equal(invocation.options.shell, false);
  assert.equal(invocation.options.windowsHide, true);
});
