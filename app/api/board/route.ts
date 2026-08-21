import { NextResponse } from "next/server";
import { normalizeOpenAIModel } from "../../../lib/executors";
import { getOpenAIAuthStatus } from "../../../lib/openai-auth";
import { enqueueTask } from "../../../lib/queue";
import { askAgentAboutTask } from "../../../lib/interaction";
import { createAgent, createTask, readBoard, removeAgent, removeTask, updateTask } from "../../../lib/store";
import type { Agent, Priority, Provider, TaskAssignment, TaskStatus } from "../../../lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function required(value: string | undefined, label: string) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${label} é obrigatório.`);
  return normalized;
}

function parseAssignments(value: string | undefined): TaskAssignment[] {
  if (!value) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new Error("A configuração dos agentes é inválida."); }
  if (!Array.isArray(parsed)) throw new Error("A configuração dos agentes é inválida.");
  return parsed.map((item) => {
    if (!item || typeof item !== "object" || typeof (item as TaskAssignment).agentId !== "string" || typeof (item as TaskAssignment).prompt !== "string") {
      throw new Error("Cada agente precisa de um prompt.");
    }
    return { agentId: required((item as TaskAssignment).agentId, "Agente"), prompt: required((item as TaskAssignment).prompt, "Prompt") };
  });
}

async function requireOpenAIAccount(agent: Pick<Agent, "provider">) {
  if (agent.provider !== "opencode") return;
  const auth = await getOpenAIAuthStatus();
  if (!auth.available) throw new Error(auth.message || "O OpenCode não está disponível.");
  if (!auth.authenticated) throw new Error("Conecte sua conta OpenAI no OpenCode antes de iniciar a tarefa.");
}

export async function GET() {
  return NextResponse.json(readBoard());
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, string>;
    switch (body.action) {
      case "create-agent": {
        if (body.provider !== "opencode" && body.provider !== "hermes") throw new Error("Provedor inválido.");
        const provider = body.provider as Provider;
        const model = required(body.model, "Modelo");
        if (provider === "opencode") {
          await requireOpenAIAccount({ provider });
        }
        createAgent({ name: required(body.name, "Nome"), provider, model: provider === "opencode" ? normalizeOpenAIModel(model) : model });
        return NextResponse.json({ board: readBoard() });
      }
      case "create-task": {
        if (body.priority && !["urgent", "high", "normal"].includes(body.priority)) throw new Error("Prioridade inválida.");
        const title = required(body.title, "Título");
        const commonContext = body.commonContext?.trim() || undefined;
        const assignments = parseAssignments(body.assignments);
        const board = readBoard();
        for (const assignment of assignments) {
          const agent = board.agents.find((candidate) => candidate.id === assignment.agentId);
          if (!agent) throw new Error("Agente não encontrado.");
          await requireOpenAIAccount(agent);
        }
        const task = createTask({ title, commonContext, priority: (body.priority || "normal") as Priority, assignments: assignments.length ? assignments : undefined });
        if (assignments.length) {
          updateTask(task.id, { assignedAgentId: assignments[0].agentId, status: "working", executionStatus: "queued" });
          assignments.forEach((assignment) => enqueueTask(task.id, assignment.agentId));
        }
        return NextResponse.json({ task: readBoard().tasks.find((candidate) => candidate.id === task.id), board: readBoard() });
      }
      case "assign-task": {
        const board = readBoard();
        const agent = board.agents.find((candidate) => candidate.id === body.agentId);
        if (!agent) throw new Error("Agente não encontrado.");
        await requireOpenAIAccount(agent);
        updateTask(body.taskId, { assignedAgentId: body.agentId, assignments: [{ agentId: body.agentId, prompt: required(body.prompt, "Prompt") }], status: "working", executionStatus: "queued" });
        enqueueTask(body.taskId, body.agentId);
        return NextResponse.json({ board: readBoard() });
      }
      case "retry-task": {
        const board = readBoard();
        const task = board.tasks.find((candidate) => candidate.id === body.taskId);
        if (!task?.assignedAgentId) throw new Error("A tarefa não possui agente responsável.");
        const assignments = task.assignments?.length ? task.assignments : [{ agentId: task.assignedAgentId, prompt: "" }];
        for (const assignment of assignments) {
          const agent = board.agents.find((candidate) => candidate.id === assignment.agentId);
          if (!agent) throw new Error("Agente não encontrado.");
          await requireOpenAIAccount(agent);
        }
        updateTask(body.taskId, { status: "working", executionStatus: "queued" });
        assignments.forEach((assignment) => enqueueTask(body.taskId, assignment.agentId, body.message?.trim() || undefined));
        return NextResponse.json({ board: readBoard() });
      }
      case "message-task": {
        const board = readBoard();
        const task = board.tasks.find((candidate) => candidate.id === body.taskId);
        if (!task?.assignedAgentId) throw new Error("A tarefa não possui agente responsável.");
        const agent = board.agents.find((candidate) => candidate.id === task.assignedAgentId);
        if (!agent) throw new Error("Agente não encontrado.");
        await requireOpenAIAccount(agent);
        await askAgentAboutTask(body.taskId, required(body.message, "Mensagem"), body.agentId);
        return NextResponse.json({ board: readBoard() });
      }
      case "move-task": {
        const targetStatus = body.targetStatus as TaskStatus;
        if (!["initial", "working", "failed", "finished"].includes(targetStatus)) {
          throw new Error("Status de tarefa inválido.");
        }
        const board = readBoard();
        const task = board.tasks.find((candidate) => candidate.id === body.taskId);
        if (!task) throw new Error("Tarefa não encontrada.");
        if (task.status === "finished") throw new Error("Tarefas finalizadas não podem ser movidas.");
        if (targetStatus === "working") {
          if (!task.assignedAgentId) throw new Error("Vincule um agente antes de mover a tarefa para Fazendo.");
          const assignments = task.assignments?.length ? task.assignments : [{ agentId: task.assignedAgentId, prompt: "" }];
          for (const assignment of assignments) {
            const agent = board.agents.find((candidate) => candidate.id === assignment.agentId);
            if (!agent) throw new Error("Agente não encontrado.");
            await requireOpenAIAccount(agent);
          }
          updateTask(task.id, { status: "working", executionStatus: "queued" });
          assignments.forEach((assignment) => enqueueTask(task.id, assignment.agentId));
        } else if (targetStatus === "initial") {
          updateTask(task.id, { status: "initial", executionStatus: "idle", assignedAgentId: undefined });
        } else if (targetStatus === "finished") {
          updateTask(task.id, { status: "finished", executionStatus: "succeeded" });
        } else {
          updateTask(task.id, { status: "failed", executionStatus: "failed" });
        }
        return NextResponse.json({ board: readBoard() });
      }
      case "remove-agent":
        removeAgent(body.agentId);
        return NextResponse.json({ board: readBoard() });
      case "remove-task": {
        const task = readBoard().tasks.find((candidate) => candidate.id === body.taskId);
        if (!task) throw new Error("Tarefa não encontrada.");
        if (task.status === "finished") throw new Error("Tarefas finalizadas não podem ser removidas.");
        removeTask(body.taskId);
        return NextResponse.json({ board: readBoard() });
      }
      default:
        return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível concluir a operação." }, { status: 400 });
  }
}
