import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Agent, BoardData, Task } from "../lib/types";

const { state } = vi.hoisted(() => ({ state: { board: undefined as BoardData | undefined } }));

vi.mock("../lib/executors", () => ({ executeWithAgent: vi.fn() }));
vi.mock("../lib/store", () => ({
  readBoard: vi.fn(() => structuredClone(state.board)),
  addTaskMessage: vi.fn((taskId: string, message: { role: "user" | "agent"; content: string }) => {
    const task = state.board?.tasks.find((candidate) => candidate.id === taskId);
    if (!task) throw new Error("missing task");
    task.conversation ??= [];
    task.conversation.push({ id: `message-${task.conversation.length}`, ...message, createdAt: "now" });
  }),
  updateAgent: vi.fn((agentId: string, patch: Partial<Agent>) => {
    const agent = state.board?.agents.find((candidate) => candidate.id === agentId);
    if (!agent) throw new Error("missing agent");
    Object.assign(agent, patch);
  }),
}));

import { executeWithAgent } from "../lib/executors";
import { askAgentAboutTask } from "../lib/interaction";

const agent: Agent = { id: "agent-1", name: "Atlas", provider: "opencode", model: "gpt-5", createdAt: "now", status: "idle" };

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Investigate failure",
    priority: "high",
    status: "failed",
    executionStatus: "failed",
    assignedAgentId: agent.id,
    createdAt: "now",
    updatedAt: "now",
    executions: [{ id: "execution-1", taskId: "task-1", agentId: agent.id, status: "failed", queuedAt: "now", error: "boom", output: "partial" }],
    conversation: [],
    ...overrides,
  };
}

beforeEach(() => {
  state.board = { agents: [structuredClone(agent)], tasks: [task()] };
  vi.mocked(executeWithAgent).mockReset();
});

describe("askAgentAboutTask", () => {
  it("validates assignment, failure state, agent and question", async () => {
    state.board!.tasks[0].assignedAgentId = undefined;
    await expect(askAgentAboutTask("task-1", "why?")).rejects.toThrow();

    state.board!.tasks[0] = task({ status: "working" });
    await expect(askAgentAboutTask("task-1", "why?")).rejects.toThrow();

    state.board!.tasks[0] = task({ assignedAgentId: "missing" });
    await expect(askAgentAboutTask("task-1", "why?")).rejects.toThrow();

    state.board!.tasks[0] = task();
    await expect(askAgentAboutTask("task-1", "   ")).rejects.toThrow();
  });

  it("stores a successful response and returns the updated task", async () => {
    vi.mocked(executeWithAgent).mockResolvedValue({ exitCode: 0, output: "  diagnosis  " });
    const result = await askAgentAboutTask("task-1", "  Why did it fail?  ");

    expect(result.conversation?.map((message) => message.content)).toEqual(["Why did it fail?", "diagnosis"]);
    expect(state.board!.agents[0].status).toBe("idle");
    expect(vi.mocked(executeWithAgent).mock.calls[0][1]).toContain("Pergunta atual do usuário:\nWhy did it fail?");
  });

  it("uses an error fallback and marks failed executions as errored", async () => {
    vi.mocked(executeWithAgent).mockResolvedValue({ exitCode: 1, output: "", error: "agent error" });
    await askAgentAboutTask("task-1", "What happened?");

    expect(state.board!.tasks[0].conversation?.at(-1)?.content).toBe("agent error");
    expect(state.board!.agents[0].status).toBe("error");
  });

  it("handles thrown Error and unknown causes", async () => {
    vi.mocked(executeWithAgent).mockRejectedValueOnce(new Error("network down"));
    await askAgentAboutTask("task-1", "Retry?");
    expect(state.board!.tasks[0].conversation?.at(-1)?.content).toBe("network down");

    vi.mocked(executeWithAgent).mockRejectedValueOnce("unknown");
    await askAgentAboutTask("task-1", "Again?");
    expect(state.board!.tasks[0].conversation?.at(-1)?.content).toBe("Não foi possível obter uma resposta do agente.");
  });

  it("selects an explicitly requested agent and includes context", async () => {
    const secondAgent = { ...agent, id: "agent-2", name: "Hermes", provider: "hermes" as const };
    state.board!.agents.push(secondAgent);
    state.board!.tasks[0].assignments = [{ agentId: agent.id, prompt: "first" }, { agentId: secondAgent.id, prompt: "second" }];
    state.board!.tasks[0].commonContext = "shared context";
    vi.mocked(executeWithAgent).mockResolvedValue({ exitCode: 0, output: "answer" });

    await askAgentAboutTask("task-1", "Question", secondAgent.id);

    expect(vi.mocked(executeWithAgent).mock.calls[0][0].id).toBe(secondAgent.id);
    expect(vi.mocked(executeWithAgent).mock.calls[0][1]).toContain("shared context");
    expect(vi.mocked(executeWithAgent).mock.calls[0][1]).toContain("Erro: boom");
  });
});
