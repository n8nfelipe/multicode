import { executeWithAgent } from "./executors";
import { addExecution, readBoard, updateAgent, updateExecution, writeBoard } from "./store";

type QueueItem = { taskId: string; agentId: string; prompt: string; instruction?: string };

const queues = new Map<string, QueueItem[]>();
const active = new Set<string>();

export function enqueueTask(taskId: string, agentId?: string, instruction?: string) {
  const board = readBoard();
  const task = board.tasks.find((candidate) => candidate.id === taskId);
  const assignment = task?.assignments?.find((candidate) => candidate.agentId === agentId)
    ?? (task && task.assignedAgentId === agentId ? { agentId, prompt: "" } : undefined)
    ?? (task?.assignments?.[0]);
  const resolvedAgentId = agentId || assignment?.agentId;
  if (!task || !resolvedAgentId) throw new Error("A tarefa precisa de pelo menos um agente responsável.");
  const resolvedAssignment = assignment || { agentId: resolvedAgentId, prompt: "" };
  const queue = queues.get(resolvedAgentId) ?? [];
  if (!queue.some((item) => item.taskId === taskId)) queue.push({ taskId, agentId: resolvedAgentId, prompt: resolvedAssignment.prompt, instruction });
  queues.set(resolvedAgentId, queue);
  void processAgentQueue(resolvedAgentId);
}

async function processAgentQueue(agentId: string) {
  if (active.has(agentId)) return;
  const queue = queues.get(agentId);
  const next = queue?.shift();
  if (!next) return;
  const nextTaskId = next.taskId;
  active.add(agentId);
  const board = readBoard();
  const task = board.tasks.find((candidate) => candidate.id === nextTaskId);
  const agent = board.agents.find((candidate) => candidate.id === agentId);
  if (!task || !agent) {
    active.delete(agentId);
    void processAgentQueue(agentId);
    return;
  }

  const assignment = task.assignments?.find((candidate) => candidate.agentId === agentId);
  const execution = addExecution(task.id, agentId, assignment?.prompt || next.prompt);
  updateExecution(task.id, execution.id, { status: "running", startedAt: new Date().toISOString() });
  updateAgent(agentId, { status: "busy" });

  let streamedOutput = "";
  let streamedError = "";
  const result = await executeWithAgent(
    agent,
    [
      "Execute a tarefa abaixo de ponta a ponta usando as ferramentas disponíveis.",
      "Não pare após explicar ou criar um plano: realize a ação solicitada e verifique o resultado.",
      "Se não puder concluir, informe claramente o bloqueio na resposta final.",
      "Na última linha, escreva exatamente TASK_RESULT: SUCCESS se concluiu e verificou a tarefa, ou TASK_RESULT: FAILED se não concluiu.",
      "",
      `Task ID: ${task.id}`,
      `Title: ${task.title}`,
      ...(task.commonContext ? ["", "Common context:", task.commonContext] : []),
      "",
       assignment?.prompt || next.prompt || "",
      ...(next.instruction ? ["", "Orientação adicional após a falha:", next.instruction] : []),
    ].join("\n"),
    (channel, chunk) => {
      if (channel === "stdout") streamedOutput += chunk;
      else streamedError += chunk;
      try {
        if (readBoard().tasks.some((candidate) => candidate.id === task.id)) {
          updateExecution(task.id, execution.id, {
            status: "running",
            output: streamedOutput || undefined,
            error: streamedError || undefined,
          });
        }
      } catch {
        // The card may have been removed while the agent is still running.
      }
    },
  ).catch((cause: unknown) => ({
    exitCode: -1,
    output: "",
    timedOut: false,
    error: cause instanceof Error ? cause.message : "O agente não pôde iniciar a execução.",
  }));
  const confirmed = agent.provider !== "opencode" || /(?:^|\n)TASK_RESULT: SUCCESS\s*$/.test(result.output.trim());
  const succeeded = result.exitCode === 0 && confirmed;
  const stuck = Boolean(result.timedOut);
  const executionError = !confirmed && result.exitCode === 0
    ? [result.error, "O agente encerrou sem confirmar que concluiu e verificou a tarefa."].filter(Boolean).join("\n\n")
    : result.error;
  const taskStillExists = readBoard().tasks.some((candidate) => candidate.id === task.id);
  if (taskStillExists) {
    updateExecution(task.id, execution.id, {
      status: succeeded ? "succeeded" : stuck ? "stuck" : "failed",
      finishedAt: new Date().toISOString(),
      exitCode: result.exitCode,
      output: result.output,
      error: executionError,
    });
  }
  updateAgent(agentId, { status: succeeded ? "idle" : "error" });
  if (taskStillExists) {
    const finalBoard = readBoard();
    const finalTask = finalBoard.tasks.find((candidate) => candidate.id === task.id);
    if (finalTask) {
      const assignmentIds = finalTask.assignments?.map((item) => item.agentId) ?? [agentId];
      const latestByAgent = assignmentIds.map((id) => finalTask.executions.find((item) => item.agentId === id));
      const allDone = latestByAgent.every((item) => item && ["succeeded", "failed", "stuck"].includes(item.status));
      const allSucceeded = allDone && latestByAgent.every((item) => item?.status === "succeeded");
      const anyFailed = latestByAgent.some((item) => item?.status === "failed");
      const anyStuck = latestByAgent.some((item) => item?.status === "stuck");
      finalTask.status = allSucceeded ? "finished" : anyStuck || allDone && anyFailed ? "failed" : "working";
      finalTask.executionStatus = allSucceeded ? "succeeded" : anyStuck ? "stuck" : anyFailed ? "failed" : "running";
      finalTask.updatedAt = new Date().toISOString();
      writeBoard(finalBoard);
    }
  }
  active.delete(agentId);
  void processAgentQueue(agentId);
}
