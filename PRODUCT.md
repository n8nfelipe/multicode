# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js + TypeScript, with a local SQLite database for the single-user MVP.

## Users

A developer or technical operator who wants to delegate work to locally configured AI agents and watch the work move through a Kanban board.

## Product Purpose

The product is a local Kanban control surface for creating tasks, configuring OpenCode or Hermes agents, assigning work, and tracking execution from queue to completion.

## Positioning

The board connects visible task flow to real local agent execution: assigning a task is the handoff that starts its operational queue, rather than a manual status change disconnected from the worker.

## Operating Context

The product runs on the same machine as the agent CLIs. A user creates tasks in the Initial lane, assigns them to a configured agent, and reviews running, failed, and completed executions from the board.

## Capabilities and Constraints

- The MVP is local and single-user, without application authentication; provider credentials remain managed by the local agent CLI.
- The board has fixed lanes: Agents, Initial, Working, and Finished.
- Agents are shown in a dedicated Agents lane; tasks never move into that lane.
- Each task may have multiple responsible agents, each with an independent prompt and execution. An agent may own a sequential queue of many tasks.
- Assigning a task moves it to Working and queues its execution.
- Successful execution moves the task to Finished.
- Failed execution remains visible in Working with a failed state and retry action.
- Agents are configured with a name, provider, and model.
- OpenCode agents can authenticate with a ChatGPT Plus/Pro account through the OpenCode CLI OAuth flow; Multicode never stores the credential.
- OpenCode and Hermes command invocation details remain an implementation boundary and must be isolated behind provider adapters.

## Product Principles

- Make the handoff visible.
- Keep the queue truthful.
- Preserve useful execution evidence.
- Make recovery a first-class action.

## Accessibility & Inclusion

The web interface must remain usable with keyboard navigation, visible focus states, semantic labels, and a responsive layout for narrow screens.
