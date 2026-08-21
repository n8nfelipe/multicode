import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Agent, BoardData, Execution, Task } from "../lib/types";

const { state, result } = vi.hoisted(() => ({
  state: { board: undefined as BoardData | undefined },
  result: { exitCode: 0, output: "TASK_RESULT: SUCCESS", error: undefined as string | undefined, timedOut: false },
}));

vi.mock("../lib/executors", () => ({
  executeWithAgent: vi.fn(async (_agent: Agent, _prompt: string, onOutput?: (channel: "stdout" | "stderr", chunk: string) => void) => {
    onOutput?.("stdout", "live output");
    onOutput?.("stderr", "live error");
    return { ...result };
  }),
}));
vi.mock("../lib/store", () => ({
  readBoard: vi.fn(() => structuredClone(state.board)),
  addExecution: vi.fn((taskId: string, agentId?: string, prompt?: string) => {
    const execution: Execution = { id: `execution-${state.board!.tasks[0].executions.length + 1}`, taskId, agentId, prompt, status: "queued", queuedAt: "now" };
    state.board!.tasks.find((task) => task.id === taskId)!.executions.unshift(execution);
    state.board!.tasks.find((task) => task.id === taskId)!.status = "working";
    state.board!.tasks.find((task) => task.id === taskId)!.executionStatus = "queued";
    return execution;
  }),
  updateExecution: vi.fn((taskId: string, executionId: string, patch: Partial<Execution> & { status: Execution["status"] }) => {
    const task = state.board!.tasks.find((candidate) => candidate.id === taskId)!;
    Object.assign(task.executions.find((execution) => execution.id === executionId)!, patch);
    task.executionStatus = patch.status;
    return task;
  }),
  updateAgent: vi.fn((agentId: string, patch: Partial<Agent>) => Object.assign(state.board!.agents.find((agent) => agent.id === agentId)!, patch)),
  writeBoard: vi.fn((board: BoardData) => { state.board = board; }),
}));

import { executeWithAgent } from "../lib/executors";
import { enqueueTask } from "../lib/queue";

const agent: Agent = { id: "agent-1", name: "Atlas", provider: "opencode", model: "gpt-5", createdAt: "now", status: "idle" };
const baseTask: Task = {
  id: "task-1",
  title: "Run work",
  priority: "normal",
  status: "initial",
  executionStatus: "idle",
  assignedAgentId: agent.id,
  assignments: [{ agentId: agent.id, prompt: "Do the work" }],
  createdAt: "now",
  updatedAt: "now",
  executions: [],
};

beforeEach(() => {
  state.board = { agents: [structuredClone(agent)], tasks: [structuredClone(baseTask)] };
  Object.assign(result, { exitCode: 0, output: "TASK_RESULT: SUCCESS", error: undefined, timedOut: false });
  vi.mocked(executeWithAgent).mockClear();
});

async function waitForQueue() {
  await vi.waitFor(() => expect(vi.mocked(executeWithAgent)).toHaveBeenCalled(), { timeout: 1_000 });
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("enqueueTask", () => {
  it("rejects tasks without an agent", () => {
    state.board!.tasks[0].assignedAgentId = undefined;
    state.board!.tasks[0].assignments = undefined;
    expect(() => enqueueTask("task-1")).toThrow();
  });

  it("runs an assignment, streams output and finishes successful work", async () => {
    enqueueTask("task-1");
    enqueueTask("task-1");
    await waitForQueue();

    expect(vi.mocked(executeWithAgent)).toHaveBeenCalledTimes(2);
    expect(state.board!.tasks[0]).toMatchObject({ status: "finished", executionStatus: "succeeded" });
    expect(state.board!.agents[0].status).toBe("idle");
  });

  it("handles failed, unconfirmed and stuck executions", async () => {
    result.exitCode = 2;
    result.output = "failed";
    enqueueTask("task-1");
    await waitForQueue();
    expect(state.board!.tasks[0]).toMatchObject({ status: "failed", executionStatus: "failed" });

    state.board = { agents: [structuredClone(agent)], tasks: [structuredClone(baseTask)] };
    result.exitCode = 0;
    result.output = "no confirmation";
    enqueueTask("task-1");
    await waitForQueue();
    expect(state.board!.tasks[0].executionStatus).toBe("failed");

    state.board = { agents: [structuredClone(agent)], tasks: [structuredClone(baseTask)] };
    result.output = "stuck";
    result.timedOut = true;
    enqueueTask("task-1");
    await waitForQueue();
    expect(state.board!.tasks[0]).toMatchObject({ status: "failed", executionStatus: "stuck" });
  });

  it("supports direct legacy assignments and ignores missing queued entities", async () => {
    state.board!.tasks[0].assignments = undefined;
    enqueueTask("task-1", agent.id, "legacy prompt");
    await waitForQueue();

    state.board = { agents: [structuredClone(agent)], tasks: [] };
    expect(() => enqueueTask("missing", agent.id)).toThrow();
  });
});
