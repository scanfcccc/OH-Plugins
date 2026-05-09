import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { parseCommandLine } from "./command-runner.js";

export class PreviewManager {
  constructor({ command = "npx --yes hyperframes", env = {}, disableTelemetry = true, log = console } = {}) {
    this.command = command;
    this.env = env;
    this.disableTelemetry = disableTelemetry;
    this.log = log;
    this.sessions = new Map();
  }

  list() {
    return Array.from(this.sessions.values()).map(toPublicSession);
  }

  get(projectId) {
    const session = this.sessions.get(projectId);
    return session ? toPublicSession(session) : null;
  }

  async start(project) {
    const existing = this.sessions.get(project.id);
    if (existing && !existing.exited) {
      existing.lastAccessAt = Date.now();
      return toPublicSession(existing);
    }

    const port = await findFreePort();
    const [file, ...baseArgs] = parseCommandLine(this.command);
    const args = [...baseArgs, "preview", project.root, "--port", String(port)];
    const child = spawn(file, args, {
      cwd: project.root,
      env: {
        ...process.env,
        ...this.env,
        ...(this.disableTelemetry ? { HYPERFRAMES_NO_TELEMETRY: "1" } : {}),
      },
      shell: false,
      windowsHide: true,
    });

    const session = {
      projectId: project.id,
      projectRoot: project.root,
      port,
      url: `http://127.0.0.1:${port}/#project/${encodeURIComponent(path.basename(project.root))}`,
      pid: child.pid || null,
      startedAt: Date.now(),
      lastAccessAt: Date.now(),
      status: "starting",
      error: null,
      exited: false,
      child,
    };

    child.stdout?.on("data", (chunk) => {
      const text = chunk.toString();
      if (/local|localhost|127\.0\.0\.1|http/i.test(text)) {
        session.status = "running";
      }
    });
    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString().trim();
      if (text) this.log.warn?.(`[hyperframes preview] ${text}`);
    });
    child.on("error", (error) => {
      session.status = "failed";
      session.error = error.message;
      session.exited = true;
    });
    child.on("exit", (code) => {
      session.status = code === 0 ? "stopped" : "failed";
      session.error = code === 0 ? null : `Preview exited with code ${code}`;
      session.exited = true;
    });

    this.sessions.set(project.id, session);
    try {
      await waitForPort(port, () => session.exited);
      if (!session.exited) {
        session.status = "running";
      }
    } catch (error) {
      if (!session.exited) {
        session.status = "failed";
        session.error = error.message;
        child.kill();
      }
    }
    return toPublicSession(session);
  }

  stop(projectId) {
    const session = this.sessions.get(projectId);
    if (!session) return false;
    session.child?.kill?.();
    this.sessions.delete(projectId);
    return true;
  }

  stopAll() {
    for (const projectId of this.sessions.keys()) {
      this.stop(projectId);
    }
  }
}

function toPublicSession(session) {
  return {
    projectId: session.projectId,
    projectRoot: session.projectRoot,
    port: session.port,
    url: session.url,
    pid: session.pid,
    startedAt: session.startedAt,
    lastAccessAt: session.lastAccessAt,
    status: session.status,
    error: session.error,
  };
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") {
          resolve(address.port);
        } else {
          reject(new Error("Unable to allocate preview port"));
        }
      });
    });
  });
}

function waitForPort(port, shouldStop, timeoutMs = 20000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      if (shouldStop()) {
        reject(new Error("Preview exited before the Studio server was ready"));
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error("Timed out waiting for the HyperFrames Studio server"));
        return;
      }

      const socket = net.createConnection({ host: "127.0.0.1", port });
      socket.setTimeout(1000);
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.once("timeout", () => {
        socket.destroy();
        setTimeout(attempt, 120);
      });
      socket.once("error", () => {
        socket.destroy();
        setTimeout(attempt, 120);
      });
    };

    attempt();
  });
}
