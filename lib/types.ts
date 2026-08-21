export type Provider = "opencode" | "hermes";
export type TaskStatus = "initial" | "working" | "finished" | "failed";
export type ExecutionStatus = "idle" | "queued" | "running" | "succeeded" | "failed" | "stuck";
export type Priority = "urgent" | "high" | "normal";

export type OpenAIAuthStatus = {
  provider: "openai";
  authenticated: boolean;
  available: boolean;
  message?: string;
};

export type Agent = {
  id: string;
  name: string;
  provider: Provider;
  model: string;
  createdAt: string;
  status: "idle" | "busy" | "error";
};

export type Execution = {
  id: string;
  taskId: string;
  agentId?: string;
  prompt?: string;
  status: ExecutionStatus;
  queuedAt: string;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number | null;
  output?: string;
  error?: string;
};

export type TaskAssignment = {
  agentId: string;
  prompt: string;
};

export type TaskMessage = {
  id: string;
  role: "user" | "agent";
  content: string;
  createdAt: string;
};

export type Task = {
  id: string;
  title: string;
  commonContext?: string;
  priority: Priority;
  status: TaskStatus;
  executionStatus: ExecutionStatus;
  assignedAgentId?: string;
  createdAt: string;
  updatedAt: string;
  executions: Execution[];
  assignments?: TaskAssignment[];
  conversation?: TaskMessage[];
};

export type BoardData = {
  agents: Agent[];
  tasks: Task[];
};
