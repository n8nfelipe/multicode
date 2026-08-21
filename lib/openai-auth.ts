import { spawn } from "node:child_process";
import type { OpenAIAuthStatus } from "./types";

type CommandResult = {
  exitCode: number;
  output: string;
  error?: string;
};

const ansiEscape = /\u001b\[[0-?]*[ -/]*[@-~]/g;

function openCodeCommand() {
  return process.env.OPENCODE_BIN || "opencode";
}

function runOpenCode(args: string[], timeoutMs: number): Promise<CommandResult> {
  return new Promise((resolve) => {
    const command = openCodeCommand();
    const child = spawn(/* turbopackIgnore: true */ command, args, {
      shell: false,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let error = "";
    let settled = false;

    const finish = (result: CommandResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      finish({ exitCode: -1, output, error: "Tempo limite excedido ao executar o OpenCode." });
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { error += chunk.toString(); });
    child.on("error", (cause: NodeJS.ErrnoException) => {
      const message = cause.code === "ENOENT" ? `Comando não encontrado: ${command}` : cause.message;
      finish({ exitCode: -1, output, error: message });
    });
    child.on("close", (exitCode) => finish({ exitCode: exitCode ?? -1, output, error: error || undefined }));
  });
}

function hasOpenAIOAuthEntry(output: string) {
  return output
    .replace(ansiEscape, "")
    .split("\n")
    .some((line) => /\bopenai\b/i.test(line) && /\boauth\b/i.test(line));
}

export async function getOpenAIAuthStatus(): Promise<OpenAIAuthStatus> {
  const result = await runOpenCode(["auth", "list"], 15_000);
  if (result.exitCode !== 0) {
    return {
      provider: "openai",
      authenticated: false,
      available: false,
      message: result.error || "Não foi possível consultar as credenciais do OpenCode.",
    };
  }

  return { provider: "openai", authenticated: hasOpenAIOAuthEntry(result.output), available: true };
}

export async function loginWithOpenAI() {
  // OpenCode can report an OAuth entry as present even after the provider has
  // invalidated its access/refresh token. Remove that stale entry so the next
  // login starts a fresh browser authorization flow.
  await runOpenCode(["auth", "logout", "openai"], 15_000);
  const result = await runOpenCode(
    ["auth", "login", "--provider", "openai", "--method", "ChatGPT Pro/Plus (browser)"],
    Number(process.env.OPENCODE_AUTH_TIMEOUT_MS || 300_000),
  );

  if (result.exitCode !== 0) {
    throw new Error(result.error || "Não foi possível concluir o login com a conta OpenAI.");
  }

  const status = await getOpenAIAuthStatus();
  if (!status.authenticated) {
    throw new Error("O OpenCode encerrou o login sem confirmar uma conta OpenAI.");
  }
  return status;
}
