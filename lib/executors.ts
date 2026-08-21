import { spawn } from "node:child_process";
import type { Agent } from "./types";

export type ExecutionResult = { exitCode: number; output: string; error?: string; timedOut?: boolean };
export type OutputListener = (channel: "stdout" | "stderr", chunk: string) => void;

const DEFAULT_EXECUTION_TIMEOUT_MS = 15 * 60 * 1000;
const KILL_GRACE_PERIOD_MS = 5_000;

export function normalizeOpenAIModel(model: string) {
  const normalized = model.trim();
  if (!normalized) throw new Error("O modelo do agente OpenCode é obrigatório.");
  if (normalized.includes("/") && !normalized.startsWith("openai/")) {
    throw new Error("Agentes OpenCode devem usar um modelo OpenAI no formato openai/modelo.");
  }
  return normalized.startsWith("openai/") ? normalized : `openai/${normalized}`;
}

function commandFor(agent: Agent, prompt: string) {
  if (agent.provider === "opencode") {
    return {
      command: process.env.OPENCODE_BIN || "opencode",
      args: ["run", "--auto", "--model", normalizeOpenAIModel(agent.model), prompt],
    };
  }
  return {
    command: process.env.HERMES_BIN || "hermes",
    args: ["chat", "--query", prompt, "--provider", process.env.HERMES_PROVIDER || "openai-codex", "--model", agent.model, "--verbose"],
  };
}

export async function executeWithAgent(agent: Agent, prompt: string, onOutput?: OutputListener): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    const { command, args } = commandFor(agent, prompt);
    const child = spawn(command, args, {
      shell: false,
      env: process.env,
      cwd: process.cwd(),
      // OpenCode may start a local server and helper processes. Keeping them
      // in a process group lets the timeout clean up the whole invocation.
      detached: process.platform !== "win32",
    });
    let output = "";
    let error = "";
    let settled = false;
    let timedOut = false;
    const timeoutMs = Number(process.env.AGENT_EXECUTION_TIMEOUT_MS || DEFAULT_EXECUTION_TIMEOUT_MS);
    const timeout = setTimeout(() => {
      timedOut = true;
      terminateChild();
      setTimeout(() => finish({
        exitCode: -1,
        output,
        timedOut: true,
        error: `${error ? `${error}\n\n` : ""}Tempo limite excedido ao executar o agente (${Math.round(timeoutMs / 60_000)} min).`,
      }), KILL_GRACE_PERIOD_MS).unref();
    }, timeoutMs);

    const finish = (result: ExecutionResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };
    const terminateChild = () => {
      if (child.pid && process.platform !== "win32") {
        try { process.kill(-child.pid, "SIGTERM"); } catch { /* process already exited */ }
        return;
      }
      child.kill("SIGTERM");
    };
    child.stdout.on("data", (chunk: Buffer) => { const text = chunk.toString(); output += text; onOutput?.("stdout", text); });
    child.stderr.on("data", (chunk: Buffer) => { const text = chunk.toString(); error += text; onOutput?.("stderr", text); });
    child.on("error", (cause: NodeJS.ErrnoException) => {
      const message = cause.code === "ENOENT" ? `Comando não encontrado: ${command}` : cause.message;
      finish({ exitCode: -1, output, error: `${message}. Configure o CLI no PATH ou em .env.` });
    });
    child.on("close", (exitCode) => {
      if (timedOut) {
        finish({
          exitCode: -1,
          output,
          timedOut: true,
          error: `${error ? `${error}\n\n` : ""}Tempo limite excedido ao executar o agente (${Math.round(timeoutMs / 60_000)} min).`,
        });
        return;
      }
      const permissionDenied = /permission requested:.*auto-rejecting|user rejected permission/i.test(error);
      finish({ exitCode: permissionDenied ? 1 : exitCode ?? -1, output, error: error || undefined });
    });
    child.stdin.end();
  });
}
