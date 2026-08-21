import { executeWithAgent } from "./executors";
import { addTaskMessage, readBoard, updateAgent } from "./store";
import type { Agent, Task, TaskMessage } from "./types";

function conversationPrompt(task: Task, agent: Agent, messages: TaskMessage[], question: string, execution = task.executions[0]) {
  const transcript = messages.map((message) => `${message.role === "user" ? "Usuário" : agent.name}:\n${message.content}`).join("\n\n");
  const latestExecution = execution;
  return [
    "Você está em uma conversa interativa sobre uma tarefa que falhou.",
    "Responda à pergunta do usuário com clareza e honestidade, como em uma sessão do OpenCode.",
    "Use as ferramentas disponíveis para investigar o estado atual quando isso ajudar a explicar o que aconteceu.",
    "Não diga apenas que vai investigar: investigue quando solicitado e descreva evidências, bloqueios e próximos passos.",
    "Não declare a tarefa concluída nesta conversa; só faça isso após executar e verificar uma nova tentativa.",
    "",
    `Task ID: ${task.id}`,
    `Title: ${task.title}`,
    ...(task.commonContext ? ["", "Contexto comum da tarefa:", task.commonContext] : []),
    "",
    "Dados da última execução:",
    `Status: ${latestExecution?.status || task.executionStatus}`,
    `Erro: ${latestExecution?.error || "nenhum erro registrado"}`,
    `Saída:\n${latestExecution?.output || "nenhuma saída registrada"}`,
    "",
    "Histórico da conversa:",
    transcript || "(primeira mensagem)",
    "",
    `Pergunta atual do usuário:\n${question}`,
  ].join("\n");
}

export async function askAgentAboutTask(taskId: string, question: string, agentId?: string) {
  const board = readBoard();
  const task = board.tasks.find((candidate) => candidate.id === taskId);
  if (!task?.assignedAgentId) throw new Error("A tarefa não possui agente responsável.");
  if (task.status !== "failed") throw new Error("A conversa fica disponível quando a tarefa está na raia de Falha.");
  const targetAgentId = agentId || task.assignedAgentId;
  const agent = board.agents.find((candidate) => candidate.id === targetAgentId);
  if (!agent) throw new Error("Agente não encontrado.");

  const normalizedQuestion = question.trim();
  if (!normalizedQuestion) throw new Error("Escreva uma pergunta para o agente.");
  const messages = task.conversation ?? [];
  const latestExecution = task.executions.find((execution) => execution.agentId === agent.id) || task.executions[0];
  addTaskMessage(task.id, { role: "user", content: normalizedQuestion });
  updateAgent(agent.id, { status: "busy" });
  try {
    const result = await executeWithAgent(agent, conversationPrompt(task, agent, messages, normalizedQuestion, latestExecution));
    const response = result.output.trim() || result.error?.trim() || "O agente não retornou uma resposta.";
    addTaskMessage(task.id, { role: "agent", content: response });
    updateAgent(agent.id, { status: result.exitCode === 0 ? "idle" : "error" });
  } catch (cause) {
    const response = cause instanceof Error ? cause.message : "Não foi possível obter uma resposta do agente.";
    addTaskMessage(task.id, { role: "agent", content: response });
    updateAgent(agent.id, { status: "error" });
  }
  return readBoard().tasks.find((candidate) => candidate.id === task.id) as Task;
}
