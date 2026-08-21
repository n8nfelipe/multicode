import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Agent, BoardData, Execution, ExecutionStatus, Priority, Provider, Task, TaskAssignment, TaskMessage, TaskStatus } from "./types";

const dataDirectory = path.join(process.cwd(), ".data");
const dataFile = path.join(dataDirectory, "board.json");

const now = () => new Date().toISOString();

function seedData(): BoardData {
  const timestamp = now();
  return {
    agents: [
      { id: "agent-atlas", name: "Atlas", provider: "opencode", model: "openai/gpt-5.6-luna", createdAt: timestamp, status: "idle" },
      { id: "agent-hermes", name: "Hermes", provider: "hermes", model: "gpt-5.6-luna", createdAt: timestamp, status: "idle" },
    ],
    tasks: [
      {
        id: "task-001",
        title: "Mapear o fluxo de autenticação",
        priority: "high",
        status: "initial",
        executionStatus: "idle",
        createdAt: timestamp,
        updatedAt: timestamp,
        executions: [],
      },
      {
        id: "task-002",
        title: "Escrever testes para a fila",
        priority: "normal",
        status: "initial",
        executionStatus: "idle",
        createdAt: timestamp,
        updatedAt: timestamp,
        executions: [],
      },
    ],
  };
}

function ensureDataFile() {
  if (!fs.existsSync(dataDirectory)) fs.mkdirSync(dataDirectory, { recursive: true });
  if (!fs.existsSync(dataFile)) fs.writeFileSync(dataFile, JSON.stringify(seedData(), null, 2));
}

export function readBoard(): BoardData {
  ensureDataFile();
  const board = JSON.parse(fs.readFileSync(dataFile, "utf8")) as BoardData;
  board.tasks.forEach((task) => {
    task.conversation ??= [];
    // Cards created before multi-agent assignments used a single responsible agent.
    if (!task.assignments && task.assignedAgentId) {
      task.assignments = [{ agentId: task.assignedAgentId, prompt: "" }];
    }
    if (task.assignments?.length) task.assignedAgentId = task.assignments[0].agentId;
  });
  board.agents.forEach((agent) => {
    const assignedTasks = board.tasks.filter((task) => task.assignedAgentId === agent.id);
    const isBusy = assignedTasks.some((task) => task.status === "working" && ["queued", "running"].includes(task.executionStatus));
    const hasFailedTask = assignedTasks.some((task) => task.status === "failed" && task.executionStatus === "failed");
    agent.status = isBusy ? "busy" : hasFailedTask ? "error" : "idle";
  });
  return board;
}

export function writeBoard(board: BoardData) {
  ensureDataFile();
  const temporaryFile = `${dataFile}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(board, null, 2));
  fs.renameSync(temporaryFile, dataFile);
}

export function createAgent(input: { name: string; provider: Provider; model: string }): Agent {
  const board = readBoard();
  const agent: Agent = { id: randomUUID(), ...input, createdAt: now(), status: "idle" };
  board.agents.push(agent);
  writeBoard(board);
  return agent;
}

export function createTask(input: { title: string; commonContext?: string; priority: Priority; assignments?: TaskAssignment[] }): Task {
  const board = readBoard();
  const timestamp = now();
  const task: Task = {
    id: randomUUID(),
    ...input,
    status: "initial",
    executionStatus: "idle",
    createdAt: timestamp,
    updatedAt: timestamp,
    executions: [],
    assignments: input.assignments,
  };
  board.tasks.unshift(task);
  writeBoard(board);
  return task;
}

export function removeTask(taskId: string) {
  const board = readBoard();
  const task = board.tasks.find((candidate) => candidate.id === taskId);
  if (!task) throw new Error("Tarefa não encontrada.");
  if (task.status === "finished") throw new Error("Tarefas finalizadas não podem ser removidas.");
  board.tasks = board.tasks.filter((candidate) => candidate.id !== taskId);
  writeBoard(board);
}

export function updateTask(taskId: string, input: Partial<Pick<Task, "status" | "assignedAgentId" | "executionStatus" | "assignments">>) {
  const board = readBoard();
  const task = board.tasks.find((candidate) => candidate.id === taskId);
  if (!task) throw new Error("Tarefa não encontrada.");
  Object.assign(task, input, { updatedAt: now() });
  writeBoard(board);
  return task;
}

export function updateAgent(agentId: string, input: Partial<Pick<Agent, "status">>) {
  const board = readBoard();
  const agent = board.agents.find((candidate) => candidate.id === agentId);
  if (!agent) throw new Error("Agente não encontrado.");
  Object.assign(agent, input);
  writeBoard(board);
  return agent;
}

export function addExecution(taskId: string, agentId?: string, prompt?: string): Execution {
  const board = readBoard();
  const task = board.tasks.find((candidate) => candidate.id === taskId);
  if (!task) throw new Error("Tarefa não encontrada.");
  const execution: Execution = { id: randomUUID(), taskId, agentId, prompt, status: "queued", queuedAt: now() };
  task.executions.unshift(execution);
  task.executionStatus = "queued";
  task.status = "working";
  task.updatedAt = now();
  writeBoard(board);
  return execution;
}

export function updateExecution(taskId: string, executionId: string, patch: Partial<Execution> & { status: ExecutionStatus }) {
  const board = readBoard();
  const task = board.tasks.find((candidate) => candidate.id === taskId);
  const execution = task?.executions.find((candidate) => candidate.id === executionId);
  if (!task || !execution) throw new Error("Execução não encontrada.");
  Object.assign(execution, patch);
  task.executionStatus = patch.status;
  task.updatedAt = now();
  writeBoard(board);
  return task;
}

export function addTaskMessage(taskId: string, message: Omit<TaskMessage, "id" | "createdAt">) {
  const board = readBoard();
  const task = board.tasks.find((candidate) => candidate.id === taskId);
  if (!task) throw new Error("Tarefa não encontrada.");
  const storedMessage: TaskMessage = { id: randomUUID(), ...message, createdAt: now() };
  task.conversation ??= [];
  task.conversation.push(storedMessage);
  task.updatedAt = now();
  writeBoard(board);
  return storedMessage;
}

export function removeAgent(agentId: string) {
  const board = readBoard();
  if (board.tasks.some((task) => task.assignedAgentId === agentId && ["queued", "running"].includes(task.executionStatus))) {
    throw new Error("Não é possível remover um agente com tarefas em execução.");
  }
  board.agents = board.agents.filter((agent) => agent.id !== agentId);
  board.tasks.forEach((task) => {
    if (task.assignments?.some((assignment) => assignment.agentId === agentId)) {
      task.assignments = task.assignments.filter((assignment) => assignment.agentId !== agentId);
      task.assignedAgentId = task.assignments[0]?.agentId;
      if (task.assignments.length > 0) return;
      task.assignedAgentId = undefined;
      task.status = "initial";
      task.executionStatus = "idle";
    } else if (task.assignedAgentId === agentId) {
      task.assignedAgentId = undefined;
      task.status = "initial";
      task.executionStatus = "idle";
    }
  });
  writeBoard(board);
}
