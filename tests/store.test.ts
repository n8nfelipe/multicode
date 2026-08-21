import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BoardData } from "../lib/types";

const { files, fsMock } = vi.hoisted(() => {
  const files = new Map<string, string>();
  const fsMock = {
    existsSync: (filePath: string) => files.has(filePath),
    mkdirSync: vi.fn(),
    writeFileSync: (filePath: string, data: string) => files.set(filePath, data),
    readFileSync: (filePath: string) => files.get(filePath) || "",
    renameSync: (from: string, to: string) => {
      files.set(to, files.get(from) || "");
      files.delete(from);
    },
  };
  return { files, fsMock };
});

vi.mock("node:fs", () => ({ default: fsMock }));

import {
  addExecution,
  addTaskMessage,
  createAgent,
  createTask,
  readBoard,
  removeAgent,
  removeTask,
  updateAgent,
  updateExecution,
  updateTask,
  writeBoard,
} from "../lib/store";

beforeEach(() => files.clear());

describe("store", () => {
  it("seeds and normalizes a board", () => {
    const board = readBoard();

    expect(board.agents).toHaveLength(2);
    expect(board.tasks).toHaveLength(2);
    expect(board.tasks[0].conversation).toEqual([]);
    expect(board.agents.every((agent) => agent.status === "idle")).toBe(true);
  });

  it("hydrates legacy assignments and derives agent status", () => {
    const board = readBoard();
    board.tasks[0].assignedAgentId = "agent-atlas";
    board.tasks[0].status = "working";
    board.tasks[0].executionStatus = "queued";
    board.tasks[1].assignedAgentId = "agent-hermes";
    board.tasks[1].status = "failed";
    board.tasks[1].executionStatus = "failed";
    writeBoard(board);

    const normalized = readBoard();

    expect(normalized.tasks[0].assignments).toEqual([{ agentId: "agent-atlas", prompt: "" }]);
    expect(normalized.agents.find((agent) => agent.id === "agent-atlas")?.status).toBe("busy");
    expect(normalized.agents.find((agent) => agent.id === "agent-hermes")?.status).toBe("error");
  });

  it("creates agents and tasks", () => {
    const agent = createAgent({ name: "Nova", provider: "hermes", model: "model-x" });
    const task = createTask({ title: "Write tests", priority: "urgent", assignments: [{ agentId: agent.id, prompt: "Implement" }] });

    expect(agent).toMatchObject({ name: "Nova", provider: "hermes", model: "model-x", status: "idle" });
    expect(task).toMatchObject({ title: "Write tests", priority: "urgent", status: "initial", executionStatus: "idle" });
    expect(readBoard().tasks[0].id).toBe(task.id);
  });

  it("updates and removes tasks and agents", () => {
    const board = readBoard();
    const taskId = board.tasks[0].id;
    const agentId = board.agents[0].id;

    expect(updateTask(taskId, { status: "failed" }).status).toBe("failed");
    expect(updateAgent(agentId, { status: "error" }).status).toBe("error");
    removeTask(taskId);
    removeAgent(agentId);

    expect(readBoard().tasks.some((task) => task.id === taskId)).toBe(false);
    expect(readBoard().agents.some((agent) => agent.id === agentId)).toBe(false);
  });

  it("rejects missing and finished task operations", () => {
    expect(() => updateTask("missing", { status: "failed" })).toThrow();
    expect(() => updateAgent("missing", { status: "error" })).toThrow();
    expect(() => removeTask("missing")).toThrow();

    const board = readBoard();
    board.tasks[0].status = "finished";
    writeBoard(board);
    expect(() => removeTask(board.tasks[0].id)).toThrow();
  });

  it("adds and updates executions", () => {
    const taskId = readBoard().tasks[0].id;
    const execution = addExecution(taskId, "agent-atlas", "Do it");

    expect(execution).toMatchObject({ taskId, agentId: "agent-atlas", prompt: "Do it", status: "queued" });
    expect(updateExecution(taskId, execution.id, { status: "succeeded", output: "done" }).executionStatus).toBe("succeeded");
    expect(readBoard().tasks[0].executions[0]).toMatchObject({ status: "succeeded", output: "done" });
    expect(() => addExecution("missing")).toThrow();
    expect(() => updateExecution(taskId, "missing", { status: "failed" })).toThrow();
  });

  it("adds task messages and rejects unknown tasks", () => {
    const taskId = readBoard().tasks[0].id;
    const message = addTaskMessage(taskId, { role: "user", content: "Hello" });

    expect(message).toMatchObject({ role: "user", content: "Hello" });
    expect(readBoard().tasks[0].conversation).toContainEqual(message);
    expect(() => addTaskMessage("missing", { role: "agent", content: "No" })).toThrow();
  });

  it("removes an active agent only after work stops", () => {
    const board = readBoard();
    board.tasks[0].assignedAgentId = "agent-atlas";
    board.tasks[0].assignments = [{ agentId: "agent-atlas", prompt: "first" }, { agentId: "agent-hermes", prompt: "second" }];
    board.tasks[0].status = "working";
    board.tasks[0].executionStatus = "queued";
    writeBoard(board);
    expect(() => removeAgent("agent-atlas")).toThrow();

    updateTask(board.tasks[0].id, { executionStatus: "idle", status: "initial" });
    removeAgent("agent-atlas");
    const remaining = readBoard();
    const task = remaining.tasks.find((candidate) => candidate.id === board.tasks[0].id);
    expect(task?.assignments).toEqual([{ agentId: "agent-hermes", prompt: "second" }]);
    expect(task?.assignedAgentId).toBe("agent-hermes");
  });

  it("unassigns the last assignment and legacy responsibility", () => {
    const board = readBoard();
    board.tasks[0].assignments = [{ agentId: "agent-atlas", prompt: "only" }];
    board.tasks[0].assignedAgentId = "agent-atlas";
    board.tasks[1].assignedAgentId = "agent-atlas";
    writeBoard(board);

    removeAgent("agent-atlas");
    const tasks = readBoard().tasks;
    expect(tasks[0]).toMatchObject({ status: "initial", executionStatus: "idle" });
    expect(tasks[0].assignedAgentId).toBeUndefined();
    expect(tasks[1].assignedAgentId).toBeUndefined();
  });

  it("writes arbitrary board data atomically", () => {
    const board = readBoard();
    const modified: BoardData = { ...board, tasks: [] };
    writeBoard(modified);
    expect(readBoard().tasks).toEqual([]);
  });
});
