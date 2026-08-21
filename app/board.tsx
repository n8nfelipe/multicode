"use client";

import { useEffect, useState } from "react";
import type { Agent, BoardData, OpenAIAuthStatus, Priority, Provider, Task, TaskAssignment, TaskStatus } from "../lib/types";

const emptyBoard: BoardData = { agents: [], tasks: [] };
const unknownOpenAIAuth: OpenAIAuthStatus = { provider: "openai", authenticated: false, available: true };

function Icon({ name }: { name: "plus" | "close" | "refresh" | "arrow" | "terminal" | "account" | "trash" }) {
  const paths = {
    plus: <><path d="M12 5v14M5 12h14" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    refresh: <><path d="M20 11a8.1 8.1 0 0 0-14.9-3L3 11m0 0V5m0 6h6M4 13a8.1 8.1 0 0 0 14.9 3L21 13m0 0v6m0-6h-6" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    terminal: <><path d="m4 17 6-5-6-5M12 19h8" /></>,
    account: <><circle cx="12" cy="8" r="3" /><path d="M5 21a7 7 0 0 1 14 0" /></>,
    trash: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="square" strokeLinejoin="miter">{paths[name]}</svg>;
}

const statusLabel = { queued: "na fila", running: "executando", succeeded: "concluída", failed: "falhou", stuck: "travado", idle: "sem execução" };
const priorityLabel = { urgent: "urgente", high: "alta", normal: "normal" };

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

function agentFor(task: Task, agents: Agent[]) {
  return agents.find((agent) => agent.id === task.assignedAgentId);
}

export function Board() {
  const [board, setBoard] = useState<BoardData>(emptyBoard);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<"task" | "agent" | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [openAIAuth, setOpenAIAuth] = useState<OpenAIAuthStatus>(unknownOpenAIAuth);
  const [authenticating, setAuthenticating] = useState(false);
  const [dropTarget, setDropTarget] = useState<TaskStatus | null>(null);

  async function loadBoard(showLoader = false) {
    if (showLoader) setLoading(true);
    try {
      const response = await fetch("/api/board", { cache: "no-store" });
      const data = await response.json() as BoardData;
      setBoard(data);
      setSelectedTask((current) => current ? data.tasks.find((task) => task.id === current.id) ?? null : null);
      setError("");
    } catch {
      setError("Não foi possível conectar ao quadro local.");
    } finally {
      setLoading(false);
    }
  }

  async function loadOpenAIAuth() {
    try {
      const response = await fetch("/api/auth/openai", { cache: "no-store" });
      setOpenAIAuth(await response.json() as OpenAIAuthStatus);
    } catch {
      setOpenAIAuth({ provider: "openai", authenticated: false, available: false, message: "Não foi possível consultar o OpenCode." });
    }
  }

  async function connectOpenAI() {
    setAuthenticating(true);
    setError("");
    try {
      const response = await fetch("/api/auth/openai", { method: "POST" });
      const data = await response.json() as OpenAIAuthStatus & { error?: string };
      if (!response.ok) throw new Error(data.error || "O login com a conta OpenAI falhou.");
      setOpenAIAuth(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "O login com a conta OpenAI falhou.");
      await loadOpenAIAuth();
    } finally {
      setAuthenticating(false);
    }
  }

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadBoard(true), 0);
    const timer = window.setInterval(() => void loadBoard(), 3000);
    const initialAuthLoad = window.setTimeout(() => void loadOpenAIAuth(), 0);
    const authTimer = window.setInterval(() => void loadOpenAIAuth(), 10000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
      window.clearTimeout(initialAuthLoad);
      window.clearInterval(authTimer);
    };
  }, []);

  async function action(body: Record<string, string | undefined>) {
    setError("");
    try {
      const response = await fetch("/api/board", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json() as { error?: string; board?: BoardData };
      if (!response.ok) throw new Error(data.error || "A operação falhou.");
      if (data.board) setBoard(data.board);
      else await loadBoard();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "A operação falhou.");
      return false;
    }
  }

  const initialTasks = board.tasks.filter((task) => task.status === "initial");
  const workingTasks = board.tasks.filter((task) => task.status === "working");
  const failedTasks = board.tasks.filter((task) => task.status === "failed");
  const finishedTasks = board.tasks.filter((task) => task.status === "finished");
  const activeCount = workingTasks.length;
  const failedCount = board.tasks.filter((task) => task.executionStatus === "failed").length;

  async function moveTask(taskId: string, status: TaskStatus) {
    setDropTarget(null);
    await action({ action: "move-task", taskId, targetStatus: status });
  }

  async function removeAgent(agent: Agent) {
    if (!window.confirm(`Remover o agente ${agent.name}? Tarefas não finalizadas voltarão para Inicial.`)) return;
    await action({ action: "remove-agent", agentId: agent.id });
  }

  async function removeTaskCard(task: Task) {
    if (!window.confirm(`Remover o card “${task.title}”? Esta ação não pode ser desfeita.`)) return;
    const ok = await action({ action: "remove-task", taskId: task.id });
    if (ok && selectedTask?.id === task.id) setSelectedTask(null);
  }

  function beginDrag(event: React.DragEvent<HTMLButtonElement>, taskId: string) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", taskId);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true" />
          <div>
            <div className="eyebrow">multicode / central de operações</div>
            <div className="brand-name">Pátio de serviço</div>
            <p className="brand-sub">O trabalho entra, ganha um responsável e sai com histórico.</p>
          </div>
        </div>
        <div className="top-actions">
          <button className="button ghost" onClick={() => void loadBoard(true)} aria-label="Atualizar quadro"><Icon name="refresh" /> Atualizar</button>
          <button className="button openai-button" onClick={() => void connectOpenAI()} disabled={authenticating || !openAIAuth.available} title="A autenticação é compartilhada por todos os agentes OpenCode"><Icon name="account" />{authenticating ? "Abrindo OpenAI..." : openAIAuth.authenticated ? "OpenAI conectado" : openAIAuth.available ? "Entrar com OpenAI" : "OpenCode indisponível"}</button>
          <button className="button" onClick={() => setModal("agent")}><Icon name="terminal" /> Novo agente</button>
          <button className="button primary" onClick={() => setModal("task")}><Icon name="plus" /> Nova tarefa</button>
        </div>
      </header>

      {error && <div className="error-banner" role="alert">{error}</div>}

      <section className="dashboard" aria-label="Resumo do quadro">
        <div className="status-strip">
          <div className="stat"><div className="stat-label">Agentes configurados</div><div className="stat-value">{board.agents.length.toString().padStart(2, "0")}</div></div>
          <div className="stat"><div className="stat-label">Tarefas no quadro</div><div className="stat-value">{board.tasks.length.toString().padStart(2, "0")}</div></div>
          <div className="stat"><div className="stat-label">Em execução</div><div className="stat-value orange">{activeCount.toString().padStart(2, "0")}</div></div>
          <div className="stat"><div className="stat-label">Requer atenção</div><div className="stat-value red">{failedCount.toString().padStart(2, "0")}</div></div>
        </div>

        <div className="board-grid">
          <Lane className="agents" title="Agentes" note="cadastrados" count={board.agents.length}>
            <button className="lane-add" onClick={() => setModal("agent")}><Icon name="plus" /> Adicionar agente</button>
            {loading && <div className="lane-empty">Carregando agentes...</div>}
            {!loading && board.agents.length === 0 && <div className="lane-empty">Nenhum agente configurado. Crie o primeiro para começar a distribuir trabalho.</div>}
            {board.agents.map((agent) => <AgentCard key={agent.id} agent={agent} tasks={board.tasks} openAIAuthenticated={openAIAuth.authenticated} onRemove={() => void removeAgent(agent)} />)}
          </Lane>
          <Lane title="Inicial" note="aguardando atribuição" count={initialTasks.length} dropStatus="initial" dropTarget={dropTarget} onDropStatus={moveTask} onDragEnterStatus={setDropTarget}>
            {initialTasks.length === 0 && <div className="lane-empty">O backlog está limpo. Novas tarefas entram aqui.</div>}
            {initialTasks.map((task) => <TaskCard key={task.id} task={task} agents={board.agents} onClick={() => setSelectedTask(task)} onRemove={() => void removeTaskCard(task)} onDragStart={beginDrag} draggable={task.status !== "finished"} />)}
          </Lane>
          <Lane className="working" title="Fazendo" note="fila dos agentes" count={workingTasks.length} dropStatus="working" dropTarget={dropTarget} onDropStatus={moveTask} onDragEnterStatus={setDropTarget}>
            {workingTasks.length === 0 && <div className="lane-empty">Nenhuma execução ativa. Atribua uma tarefa a um agente.</div>}
            {workingTasks.map((task) => <TaskCard key={task.id} task={task} agents={board.agents} onClick={() => setSelectedTask(task)} onRemove={() => void removeTaskCard(task)} onDragStart={beginDrag} draggable={task.status !== "finished"} />)}
          </Lane>
          <Lane className="failed" title="Falha" note="execução interrompida" count={failedTasks.length} dropStatus="failed" dropTarget={dropTarget} onDropStatus={moveTask} onDragEnterStatus={setDropTarget}>
            {failedTasks.length === 0 && <div className="lane-empty">As tarefas que não puderam ser concluídas aparecem aqui.</div>}
            {failedTasks.map((task) => <TaskCard key={task.id} task={task} agents={board.agents} onClick={() => setSelectedTask(task)} onRemove={() => void removeTaskCard(task)} onDragStart={beginDrag} draggable={task.status !== "finished"} />)}
          </Lane>
          <Lane className="finished" title="Finalizado" note="concluída ou encerrada manualmente" count={finishedTasks.length} dropStatus="finished" dropTarget={dropTarget} onDropStatus={moveTask} onDragEnterStatus={setDropTarget}>
            {finishedTasks.length === 0 && <div className="lane-empty">As tarefas concluídas aparecem aqui com seu histórico preservado.</div>}
            {finishedTasks.map((task) => <TaskCard key={task.id} task={task} agents={board.agents} onClick={() => setSelectedTask(task)} />)}
          </Lane>
        </div>
      </section>

      <div className="section-rule"><span>Atualização automática a cada 3s</span><span>fila local / {new Date().getFullYear()}</span></div>

      {modal === "agent" && <AgentModal openAIAuth={openAIAuth} authenticating={authenticating} onLogin={connectOpenAI} onClose={() => setModal(null)} onSubmit={async (data) => { const ok = await action({ action: "create-agent", ...data }); if (ok) setModal(null); }} />}
      {modal === "task" && <TaskModal agents={board.agents} onClose={() => setModal(null)} onSubmit={async (data) => { const ok = await action({ action: "create-task", ...data }); if (ok) setModal(null); }} />}
      {selectedTask && <TaskDrawer task={selectedTask} agents={board.agents} onClose={() => setSelectedTask(null)} onAssign={async (agentId, prompt) => { const ok = await action({ action: "assign-task", taskId: selectedTask.id, agentId, prompt }); if (ok) setSelectedTask(null); }} onRetry={async (message) => { await action({ action: "retry-task", taskId: selectedTask.id, ...(message ? { message } : {}) }); }} onMessage={async (message, agentId) => action({ action: "message-task", taskId: selectedTask.id, message, agentId })} onRemove={async () => { const ok = await action({ action: "remove-task", taskId: selectedTask.id }); if (ok) setSelectedTask(null); }} />}
    </main>
  );
}

function Lane({ title, note, count, className = "", dropStatus, dropTarget, onDropStatus, onDragEnterStatus, children }: { title: string; note: string; count: number; className?: string; dropStatus?: TaskStatus; dropTarget?: TaskStatus | null; onDropStatus?: (taskId: string, status: TaskStatus) => void; onDragEnterStatus?: (status: TaskStatus | null) => void; children: React.ReactNode }) {
  const droppable = Boolean(dropStatus && onDropStatus);
  return <section className={`lane ${className} ${dropTarget === dropStatus ? "drop-target" : ""}`} onDragOver={droppable ? (event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } : undefined} onDragEnter={droppable && dropStatus ? (event) => { event.preventDefault(); onDragEnterStatus?.(dropStatus); } : undefined} onDragLeave={droppable ? (event) => { if (event.currentTarget === event.target) onDragEnterStatus?.(null); } : undefined} onDrop={droppable && dropStatus ? (event) => { event.preventDefault(); const taskId = event.dataTransfer.getData("text/plain"); if (taskId) onDropStatus?.(taskId, dropStatus); } : undefined}><div className="lane-head"><div><div className="lane-title">{title}</div><div className="lane-note">{note}</div></div><div className="lane-count">{count.toString().padStart(2, "0")}</div></div><div className="lane-body">{children}</div></section>;
}

function AgentCard({ agent, tasks, openAIAuthenticated, onRemove }: { agent: Agent; tasks: Task[]; openAIAuthenticated: boolean; onRemove: () => void }) {
  const assigned = tasks.filter((task) => task.assignedAgentId === agent.id && task.status !== "finished").length;
  return <article className="agent-card"><div className="agent-top"><div className="agent-identity"><div className={`agent-avatar ${agent.provider}`}>{initials(agent.name)}</div><div><div className="agent-name">{agent.name}</div><div className="agent-provider">{agent.provider === "opencode" ? "OpenCode" : "Hermes"}</div></div></div><div className="agent-status"><span className={`status-dot ${agent.status}`} />{agent.status === "busy" ? "ocupado" : agent.status === "error" ? "erro" : "livre"}</div></div><div className="agent-model">modelo <code>{agent.model}</code></div><div className="agent-footer"><span>{assigned} {assigned === 1 ? "tarefa na fila" : "tarefas na fila"}</span>{agent.provider === "opencode" ? <span className={`auth-chip ${openAIAuthenticated ? "connected" : "disconnected"}`}><span className="status-dot" />{openAIAuthenticated ? "OpenAI OK" : "sem login"}</span> : <span>{agent.status === "busy" ? "RUN" : "READY"}</span>}<button className="agent-remove" onClick={onRemove} aria-label={`Remover agente ${agent.name}`} title="Remover agente"><Icon name="trash" /></button></div></article>;
}

function TaskCard({ task, agents, onClick, onRemove, onDragStart, draggable = false }: { task: Task; agents: Agent[]; onClick: () => void; onRemove?: () => void; onDragStart?: (event: React.DragEvent<HTMLButtonElement>, taskId: string) => void; draggable?: boolean }) {
  const assigned = (task.assignments?.map((assignment) => agents.find((candidate) => candidate.id === assignment.agentId)).filter(Boolean) as Agent[]) || (agentFor(task, agents) ? [agentFor(task, agents)!] : []);
  return <article className={`task-card ${draggable ? "draggable" : ""}`}><button className="task-card-main" draggable={draggable} onDragStart={draggable && onDragStart ? (event) => onDragStart(event, task.id) : undefined} onClick={onClick}><div className="task-top"><span className="task-id">{task.id.slice(0, 8).toUpperCase()}</span><span className={`priority ${task.priority}`}>{priorityLabel[task.priority]}</span></div><div className="task-title">{task.title}</div><div className="task-footer">{assigned.length ? <span className="task-agents">{assigned.map((agent) => <span className="task-agent" key={agent.id}><span className={`mini-avatar ${agent.provider}`}>{initials(agent.name)}</span>{agent.name}</span>)}</span> : <span>sem agente</span>}{task.executionStatus !== "idle" && <span className={`execution ${task.executionStatus}`}><span className="pulse" />{statusLabel[task.executionStatus]}</span>}</div></button>{task.status !== "finished" && onRemove && <button className="task-card-remove" onClick={(event) => { event.stopPropagation(); onRemove(); }} aria-label={`Remover card ${task.title}`} title="Remover card"><Icon name="trash" /></button>}</article>;
}

function ModalShell({ kicker, title, onClose, children, drawer = false }: { kicker: string; title: string; onClose: () => void; children: React.ReactNode; drawer?: boolean }) {
  return <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={`modal ${drawer ? "drawer" : ""}`} role="dialog" aria-modal="true" aria-label={title}><div className="modal-head"><div><div className="modal-kicker">{kicker}</div><div className="modal-title">{title}</div></div><button className="close-button" onClick={onClose} aria-label="Fechar"><Icon name="close" /></button></div>{children}</section></div>;
}

function AgentModal({ openAIAuth, authenticating, onLogin, onClose, onSubmit }: { openAIAuth: OpenAIAuthStatus; authenticating: boolean; onLogin: () => Promise<void>; onClose: () => void; onSubmit: (data: { name: string; provider: Provider; model: string }) => Promise<void> }) {
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<Provider>("opencode");
  const [model, setModel] = useState("openai/gpt-5.6-luna");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({ name, provider, model });
    } finally {
      setSubmitting(false);
    }
  }

  return <ModalShell kicker="configuração / agente" title="Adicionar agente" onClose={onClose}><form className="modal-body" onSubmit={(event) => void handleSubmit(event)}><fieldset disabled={submitting}><div className="field"><label htmlFor="agent-name">Nome de operação</label><input id="agent-name" name="name" required value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Atlas" autoFocus /></div><div className="field-row"><div className="field"><label htmlFor="agent-provider">Provedor</label><select id="agent-provider" name="provider" required value={provider} onChange={(event) => { const nextProvider = event.target.value as Provider; setProvider(nextProvider); setModel(nextProvider === "hermes" ? "gpt-5.6-luna" : "openai/gpt-5.6-luna"); }}><option value="opencode">OpenCode</option><option value="hermes">Hermes</option></select></div><div className="field"><label htmlFor="agent-model">Modelo</label><input id="agent-model" name="model" required value={model} onChange={(event) => setModel(event.target.value)} placeholder={provider === "hermes" ? "Ex.: gpt-5.6-luna" : "Ex.: openai/gpt-5.6-luna"} /></div></div>{provider === "opencode" ? <div className="auth-callout"><div><strong>Conta para este agente</strong><p>{openAIAuth.authenticated ? "OpenCode está conectado à sua conta OpenAI." : "Use sua conta ChatGPT Plus/Pro para autenticar o OpenCode."}</p></div><button type="button" className="button small" onClick={() => void onLogin()} disabled={!openAIAuth.available || authenticating}>{authenticating ? "Abrindo OpenAI..." : openAIAuth.authenticated ? "Refazer login" : "Entrar com OpenAI"}</button></div> : <div className="auth-callout"><div><strong>Conta do Hermes</strong><p>O agente usa o provider e as credenciais configuradas no Hermes.</p></div><code>provider configurado no Hermes</code></div>}<p className="brand-sub">OpenCode usa a conta conectada e Hermes usa o provider autenticado no CLI Hermes. Use <code>OPENCODE_BIN</code>, <code>HERMES_BIN</code> e <code>HERMES_PROVIDER</code> para substituir os comandos padrão.</p><div className="modal-actions"><button type="button" className="button ghost" onClick={onClose}>Cancelar</button><button className="button primary" type="submit">Adicionar agente <Icon name="arrow" /></button></div></fieldset></form></ModalShell>;
}

function TaskModal({ agents, onClose, onSubmit }: { agents: Agent[]; onClose: () => void; onSubmit: (data: { title: string; commonContext?: string; priority: Priority; assignments?: string }) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [commonContext, setCommonContext] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [prompts, setPrompts] = useState<Record<string, string>>({});

  function toggleAgent(agentId: string) {
    setSelectedAgentIds((current) => current.includes(agentId) ? current.filter((id) => id !== agentId) : [...current, agentId]);
  }

  function submit() {
    const assignments: TaskAssignment[] = selectedAgentIds.map((agentId) => ({ agentId, prompt: prompts[agentId]?.trim() || "" }));
    void onSubmit({ title, commonContext: commonContext.trim() || undefined, priority, assignments: assignments.length ? JSON.stringify(assignments) : undefined });
  }

  return <ModalShell kicker="backlog / nova entrada" title="Criar tarefa" onClose={onClose}><form className="modal-body" onSubmit={(event) => { event.preventDefault(); submit(); }}><div className="field"><label htmlFor="task-title">Título da tarefa</label><input id="task-title" required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="O que precisa ser feito?" autoFocus /></div><div className="field"><label htmlFor="task-common-context">Contexto comum</label><textarea id="task-common-context" value={commonContext} onChange={(event) => setCommonContext(event.target.value)} placeholder="Informações, restrições e referências válidas para todos os agentes." /></div><div className="field"><label>Agentes e prompts individuais</label><div className="agent-picker">{agents.length === 0 && <div className="lane-empty">Cadastre um agente antes de iniciar uma tarefa.</div>}{agents.map((agent) => { const selected = selectedAgentIds.includes(agent.id); return <div className={`agent-prompt ${selected ? "selected" : ""}`} key={agent.id}><label className="agent-check"><input type="checkbox" checked={selected} onChange={() => toggleAgent(agent.id)} /> <span>{agent.name} / {agent.provider}</span></label>{selected && <textarea required value={prompts[agent.id] ?? ""} onChange={(event) => setPrompts((current) => ({ ...current, [agent.id]: event.target.value }))} placeholder={`Prompt exclusivo para ${agent.name}...`} />}</div>; })}</div><p className="field-hint">Selecione mais de um agente para executar este card em paralelo. Cada agente recebe somente o seu prompt.</p></div><div className="field"><label htmlFor="task-priority">Prioridade</label><select id="task-priority" value={priority} onChange={(event) => setPriority(event.target.value as Priority)}><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></div><div className="modal-actions"><button type="button" className="button ghost" onClick={onClose}>Cancelar</button><button className="button primary" type="submit">Criar tarefa <Icon name="arrow" /></button></div></form></ModalShell>;
}

function TaskDrawer({ task, agents, onClose, onAssign, onRetry, onMessage, onRemove }: { task: Task; agents: Agent[]; onClose: () => void; onAssign: (agentId: string, prompt: string) => Promise<void>; onRetry: (message?: string) => Promise<void>; onMessage: (message: string, agentId?: string) => Promise<boolean>; onRemove: () => Promise<void> }) {
  const agent = agentFor(task, agents);
  const latest = task.executions[0];
  const isExecuting = task.executionStatus === "queued" || task.executionStatus === "running";
  const taskAssignments: TaskAssignment[] = task.assignments?.length ? task.assignments : task.assignedAgentId ? [{ agentId: task.assignedAgentId, prompt: "" }] : [];
  const workByAgent = taskAssignments.map((assignment) => ({ assignment, agent: agents.find((candidate) => candidate.id === assignment.agentId), execution: task.executions.find((candidate) => candidate.agentId === assignment.agentId) }));
  const conversationAgentId = workByAgent.find(({ execution }) => execution?.status === "stuck")?.assignment.agentId || task.assignedAgentId;
  const conversationAgent = agents.find((candidate) => candidate.id === conversationAgentId);
  const [selectedAgent, setSelectedAgent] = useState(task.assignedAgentId || "");
  const [assignPrompt, setAssignPrompt] = useState("");
  const [message, setMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  const conversation = task.conversation ?? [];

  async function sendMessage() {
    const normalized = message.trim();
    if (!normalized) return;
    setSendingMessage(true);
    try {
      if (await onMessage(normalized, conversationAgentId)) setMessage("");
    } finally {
      setSendingMessage(false);
    }
  }

  async function removeCard() {
    if (!window.confirm(`Remover o card “${task.title}”? Esta ação não pode ser desfeita.`)) return;
    await onRemove();
  }

  async function reactivateTask() {
    setReactivating(true);
    try {
      await onRetry();
    } finally {
      setReactivating(false);
    }
  }

  return <ModalShell drawer kicker={`tarefa / ${task.id.slice(0, 8).toUpperCase()}`} title={task.title} onClose={onClose}><div className="modal-body"><div className="detail-block">
    <div className="detail-label">Responsável</div>
    {task.status === "initial" ? <div className="field"><label htmlFor="assign-agent">Agente responsável</label><select id="assign-agent" value={selectedAgent} onChange={(event) => setSelectedAgent(event.target.value)}><option value="">Escolha um agente...</option>{agents.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} / {candidate.provider}</option>)}</select><label htmlFor="assign-prompt">Prompt individual</label><textarea id="assign-prompt" required value={assignPrompt} onChange={(event) => setAssignPrompt(event.target.value)} placeholder="O que este agente deve fazer?" /><div className="modal-actions"><button className="button primary" disabled={!selectedAgent || !assignPrompt.trim()} onClick={() => void onAssign(selectedAgent, assignPrompt.trim())}>Vincular e iniciar <Icon name="arrow" /></button></div></div> : <div className="agent-work-list">{workByAgent.map(({ assignment, agent: assignedAgent, execution }) => <div className="agent-work" key={assignment.agentId}><div className="agent-work-head"><div className="agent-identity">{assignedAgent && <><div className={`agent-avatar ${assignedAgent.provider}`}>{initials(assignedAgent.name)}</div><div><div className="agent-name">{assignedAgent.name}</div><div className="agent-provider">{assignedAgent.provider} / {assignedAgent.model}</div></div></>}</div><div className={`execution ${execution?.status || "idle"}`}><span className="pulse" />{statusLabel[execution?.status || "idle"]}</div></div><div className="agent-work-label">O que está sendo feito</div><div className="agent-work-prompt">{assignment.prompt || "Sem prompt informado."}</div>{execution?.output && <><div className="agent-work-label">Saída atual</div><div className="agent-work-output">{execution.output}</div></>}</div>)}</div>}
  </div><div className="detail-block"><div className="detail-label">Estado da execução</div><div className={`execution ${task.executionStatus}`}><span className="pulse" />{statusLabel[task.executionStatus]}</div>{(task.executionStatus === "failed" || task.executionStatus === "stuck") && <div className="notice" style={{ marginTop: 12 }}>{task.executionStatus === "stuck" ? "O agente não respondeu dentro do tempo limite e foi interrompido." : latest?.error || "O agente encerrou com erro."}<div className="modal-actions"><button className="button small" onClick={() => void onRetry()} disabled={sendingMessage || reactivating}>Tentar novamente <Icon name="refresh" /></button></div></div>}{isExecuting && <div className="notice" style={{ marginTop: 12 }}>Se a execução parou ou ficou presa, coloque o pedido novamente na fila.<div className="modal-actions"><button className="button small" onClick={() => void reactivateTask()} disabled={sendingMessage || reactivating}>{reactivating ? "Reativando..." : "Reativar pedido"} <Icon name="refresh" /></button></div></div>}</div>{isExecuting && <div className="detail-block"><div className="detail-label">Acompanhamento ao vivo</div><div className="log-box live-log">{latest?.output || latest?.error || "Aguardando saída do agente..."}</div></div>}{!isExecuting && latest?.output && <div className="detail-block"><div className="detail-label">Saída da execução</div><div className="log-box">{latest.output}</div></div>}{latest?.error && task.executionStatus !== "failed" && <div className="detail-block"><div className="detail-label">Log de erro</div><div className="log-box">{latest.error}</div></div>}{task.status === "failed" && <div className="detail-block conversation-block"><div className="detail-label">Interagir com {conversationAgent?.name || agent?.name || "o agente"}</div><div className="conversation" aria-live="polite">{conversation.length === 0 && <div className="conversation-empty">Pergunte o que aconteceu, peça um diagnóstico ou indique como o agente deve continuar.</div>}{conversation.map((entry) => <div className={`conversation-message ${entry.role}`} key={entry.id}><div className="conversation-author">{entry.role === "user" ? "Você" : agent?.name || "Agente"}</div><div className="conversation-content">{entry.content}</div></div>)}</div><div className="field message-field"><label htmlFor="agent-message">Mensagem</label><textarea id="agent-message" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Pergunte o que aconteceu ou diga como continuar." disabled={sendingMessage} onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void sendMessage(); }} /></div><div className="conversation-actions"><span>Ctrl/⌘ + Enter para enviar</span><button className="button small primary" onClick={() => void sendMessage()} disabled={!message.trim() || sendingMessage}>{sendingMessage ? "Aguardando agente..." : "Enviar mensagem"} <Icon name="arrow" /></button></div></div>}<div className="detail-block"><div className="detail-label">Prioridade</div><div className={`priority ${task.priority}`}>{priorityLabel[task.priority]}</div></div>{task.status !== "finished" && <div className="detail-block task-danger-zone"><button className="button small danger" onClick={() => void removeCard()}><Icon name="trash" /> Remover card</button></div>}</div></ModalShell>;
}
