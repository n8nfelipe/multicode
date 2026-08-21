import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Agent } from "../lib/types";
import { executeWithAgent, normalizeOpenAIModel } from "../lib/executors";

const hermesAgent: Agent = { id: "hermes", name: "Hermes", provider: "hermes", model: "model-x", createdAt: "now", status: "idle" };
const openCodeAgent: Agent = { id: "atlas", name: "Atlas", provider: "opencode", model: "gpt-5.6-luna", createdAt: "now", status: "idle" };
let directory: string;
let command: string;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "multicode-agent-"));
  command = path.join(directory, "agent.sh");
  fs.writeFileSync(command, "#!/bin/sh\nprintf 'out:%s\\n' \"$FAKE_OUTPUT\"\nprintf 'err:%s\\n' \"$FAKE_ERROR\" >&2\nif [ -n \"$FAKE_SLEEP\" ]; then sleep \"$FAKE_SLEEP\"; fi\nexit \"${FAKE_EXIT:-0}\"\n");
  fs.chmodSync(command, 0o755);
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(directory, { recursive: true, force: true });
});

describe("normalizeOpenAIModel", () => {
  it("normalizes short and fully qualified model names", () => {
    expect(normalizeOpenAIModel(" gpt-5 ")).toBe("openai/gpt-5");
    expect(normalizeOpenAIModel("openai/gpt-5")).toBe("openai/gpt-5");
  });

  it("rejects empty and non-OpenAI qualified models", () => {
    expect(() => normalizeOpenAIModel(" ")).toThrow();
    expect(() => normalizeOpenAIModel("google/model")).toThrow();
  });
});

describe("executeWithAgent", () => {
  it("streams output and resolves successful Hermes executions", async () => {
    vi.stubEnv("HERMES_BIN", command);
    vi.stubEnv("FAKE_OUTPUT", "hello");
    vi.stubEnv("FAKE_ERROR", "warning");
    const chunks: string[] = [];

    const result = await executeWithAgent(hermesAgent, "prompt", (channel, chunk) => chunks.push(`${channel}:${chunk}`));

    expect(result).toMatchObject({ exitCode: 0, output: "out:hello\n", error: "err:warning\n" });
    expect(chunks.some((chunk) => chunk.startsWith("stdout:"))).toBe(true);
    expect(chunks.some((chunk) => chunk.startsWith("stderr:"))).toBe(true);
  });

  it("uses the OpenCode command and normalizes its model", async () => {
    vi.stubEnv("OPENCODE_BIN", command);
    vi.stubEnv("FAKE_OUTPUT", "open-code");

    const result = await executeWithAgent(openCodeAgent, "prompt");

    expect(result.output).toContain("open-code");
  });

  it("converts permission rejection into a failing exit code", async () => {
    vi.stubEnv("HERMES_BIN", command);
    vi.stubEnv("FAKE_ERROR", "permission requested: auto-rejecting");

    const result = await executeWithAgent(hermesAgent, "prompt");

    expect(result.exitCode).toBe(1);
  });

  it("reports missing commands", async () => {
    vi.stubEnv("HERMES_BIN", path.join(directory, "missing"));

    const result = await executeWithAgent(hermesAgent, "prompt");

    expect(result.exitCode).toBe(-1);
    expect(result.error).toContain("Comando");
  });

  it("reports a timeout and preserves streamed output", async () => {
    vi.stubEnv("HERMES_BIN", command);
    vi.stubEnv("FAKE_OUTPUT", "before-timeout");
    vi.stubEnv("FAKE_SLEEP", "1");
    vi.stubEnv("AGENT_EXECUTION_TIMEOUT_MS", "10");

    const result = await executeWithAgent(hermesAgent, "prompt");

    expect(result).toMatchObject({ exitCode: -1, timedOut: true });
    expect(result.output).toContain("before-timeout");
    expect(result.error).toContain("Tempo limite excedido");
  }, 10_000);

  it("rejects invalid OpenCode models", async () => {
    vi.stubEnv("OPENCODE_BIN", command);
    await expect(executeWithAgent({ ...openCodeAgent, model: "other/model" }, "prompt")).rejects.toThrow();
  });
});
