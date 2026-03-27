# Picklejar: AI Coding Agent Orchestration Tool

## Context

We're building a multi-tier AI coding agent orchestration system from scratch in an empty TypeScript repo. The tool lets users submit complex coding tasks to a **coordinator agent** (Claude Opus) that breaks them into subtasks, delegates discovery to **discovery agents** (Claude Sonnet), and implementation to **implementation agents** (OpenAI Codex). All agent models are swappable via JSON config. The system runs as a CLI that launches a web server (Mastra Studio) for monitoring and task management.

**Framework**: Mastra AI (v1.3.15, @mastra/core v1.10.0) - TypeScript-first, supports supervisor agents, 40+ model providers, built-in Studio UI, memory system, and custom tools via `createTool()`.

---

## Architecture Overview

```
                    ┌─────────────────────┐
                    │   CLI Entry Point    │
                    │  (Commander.js)      │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Mastra Instance    │
                    │  + Studio (port 4111)│
                    │  + Custom API routes │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Coordinator Agent   │
                    │  (Claude Opus)       │
                    │  Observational Memory│
                    └──────┬────┬─────────┘
                           │    │
              ┌────────────┘    └────────────┐
              │                              │
   ┌──────────▼──────────┐     ┌─────────────▼────────────┐
   │  Discovery Agents    │     │  Implementation Agents    │
   │  (1-3, Sonnet)       │     │  (1-5, OpenAI Codex)      │
   │  Working Memory      │     │  Message History           │
   │  Read-only tools     │     │  Write tools + git worktree│
   └──────────────────────┘     └───────────────────────────┘
```

---

## Project Structure

```
picklejar/
├── package.json
├── tsconfig.json
├── picklejar.config.json          # User-facing config (models, providers, agent counts)
├── picklejar.config.schema.json   # JSON Schema for config validation
├── .env.example                   # Required API keys template
├── src/
│   ├── index.ts                   # Mastra instance + registration
│   ├── cli.ts                     # CLI entry point (Commander.js)
│   ├── config/
│   │   ├── loader.ts              # Load + validate picklejar.config.json
│   │   ├── schema.ts              # Zod schema matching JSON Schema
│   │   └── defaults.ts            # Default config values
│   ├── agents/
│   │   ├── coordinator.ts         # Coordinator (supervisor) agent
│   │   ├── discovery.ts           # Discovery agent factory (1-3 instances)
│   │   └── implementation.ts      # Implementation agent factory (1-5 instances)
│   ├── tools/
│   │   ├── filesystem.ts          # readFile, writeFile, editFile, glob, grep
│   │   ├── git.ts                 # gitStatus, gitDiff, gitCommit, gitBranch, gitWorktree
│   │   ├── shell.ts               # executeCommand (sandboxed)
│   │   ├── task.ts                # createSubtask, updateTaskStatus, reportCompletion
│   │   └── index.ts               # Tool registry exports
│   ├── tasks/
│   │   ├── manager.ts             # Task state machine (pending/active/done/failed)
│   │   ├── store.ts               # In-memory + file-persisted task store
│   │   └── types.ts               # Task, Subtask, TaskStatus types
│   ├── worktree/
│   │   ├── manager.ts             # Git worktree lifecycle (create/cleanup)
│   │   └── types.ts               # Worktree config types
│   └── server/
│       └── routes.ts              # Custom API routes for task management + SSE progress
└── test/
    ├── tools/                     # Tool unit tests
    ├── agents/                    # Agent integration tests
    └── config/                    # Config loading tests
```

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Git isolation** | Git worktrees | Each implementation agent works in its own worktree/branch. Prevents file conflicts during parallel work. Coordinator merges results. |
| **Web UI** | Mastra Studio + custom API routes | Built-in Studio for agent interaction. Custom routes via `registerApiRoute` for task dashboard, progress SSE, and task submission. |
| **Config format** | JSON + JSON Schema | Universal, validatable with `ajv`, IDE support via `$schema`. Zod schema mirrors JSON Schema for runtime validation. |
| **Tools** | Custom Mastra tools (createTool) | Full control, no MCP server dependency. Built with Zod schemas for type safety. |
| **Token optimization** | RTK (Rust Token Killer) | All shell commands piped through RTK for 60-90% token reduction. Critical for keeping agent context windows efficient. |
| **Memory storage** | LibSQL (default, local) | Ships with `@mastra/libsql`. Zero config for local development. Can swap to Postgres for production. |
| **Real-time updates** | SSE via custom API routes | Server-sent events for streaming task progress to web UI. Simpler than WebSockets for unidirectional updates. |
| **Model resolution** | Config-driven with provider/model-name pattern | JSON config maps agent roles to `"provider/model-name"` strings. Mastra resolves providers automatically. |

---

## Configuration Schema

**`picklejar.config.json`**:
```json
{
  "$schema": "./picklejar.config.schema.json",
  "agents": {
    "coordinator": {
      "model": "anthropic/claude-opus-4-6",
      "maxSteps": 50
    },
    "discovery": {
      "model": "anthropic/claude-sonnet-4-6",
      "count": 2,
      "maxSteps": 30
    },
    "implementation": {
      "model": "openai/o3",
      "count": 3,
      "maxSteps": 40
    }
  },
  "providers": {
    "anthropic": { "apiKeyEnv": "ANTHROPIC_API_KEY" },
    "openai": { "apiKeyEnv": "OPENAI_API_KEY" },
    "google": { "apiKeyEnv": "GOOGLE_API_KEY" },
    "ollama": { "baseUrl": "http://localhost:11434" },
    "openrouter": { "apiKeyEnv": "OPENROUTER_API_KEY" }
  },
  "memory": {
    "storage": "libsql",
    "observationalMemory": true
  },
  "server": {
    "port": 4111
  }
}
```

**Swapping models** is as simple as changing the `"model"` string:
- Anthropic: `"anthropic/claude-sonnet-4-6"`
- OpenAI: `"openai/gpt-4-turbo"` or `"openai/o3"`
- Google: `"google/gemini-2.5-pro"`
- Ollama (open source): `"ollama/llama3.3:70b"`
- OpenRouter: `"openrouter/meta-llama/llama-3.3-70b"`

---

## Agent Definitions

### Coordinator Agent (`src/agents/coordinator.ts`)
```typescript
import { Agent } from '@mastra/core/agent'
import { Memory } from '@mastra/memory'
import { config } from '../config/loader'

// Sub-agents are passed via the `agents` property
// Mastra automatically converts them to callable tools
export const createCoordinator = (discoveryAgents, implAgents) =>
  new Agent({
    id: 'coordinator',
    name: 'Coordinator',
    instructions: `You are the lead architect orchestrating a coding task.
      Break tasks into discovery and implementation subtasks.
      Delegate discovery to discovery agents, implementation to implementation agents.
      Synthesize results and manage progress.`,
    model: config.agents.coordinator.model,
    agents: [...discoveryAgents, ...implAgents],
    tools: { createSubtask, updateTaskStatus, reportCompletion },
    memory: new Memory({
      options: { lastMessages: 40, observationalMemory: true }
    }),
    maxSteps: config.agents.coordinator.maxSteps,
  })
```

### Discovery Agent (`src/agents/discovery.ts`)
```typescript
export const createDiscoveryAgent = (index: number) =>
  new Agent({
    id: `discovery-${index}`,
    name: `Discovery Agent ${index}`,
    instructions: `You explore codebases and report findings.
      Use file reading, search, and git tools to analyze code.
      Return structured findings to the coordinator.`,
    model: config.agents.discovery.model,
    tools: { readFile, globFiles, grepSearch, gitStatus, gitDiff },
    memory: new Memory({
      options: { lastMessages: 20 }
    }),
    maxSteps: config.agents.discovery.maxSteps,
  })
```

### Implementation Agent (`src/agents/implementation.ts`)
```typescript
export const createImplementationAgent = (index: number) =>
  new Agent({
    id: `implementation-${index}`,
    name: `Implementation Agent ${index}`,
    instructions: `You write, edit, and test code.
      Work in your assigned git worktree.
      Run tests after changes. Commit when tests pass.`,
    model: config.agents.implementation.model,
    tools: { readFile, writeFile, editFile, executeCommand, gitCommit, gitWorktree },
    memory: new Memory({
      options: { lastMessages: 30 }
    }),
    maxSteps: config.agents.implementation.maxSteps,
  })
```

**Supervisor pattern**: The coordinator has discovery and implementation agents in its `agents` array. Mastra converts sub-agents into callable tools, so the coordinator can invoke them naturally via tool calls.

---

## Tool Definitions

### Filesystem Tools (`src/tools/filesystem.ts`)
| Tool | Input | Output | Description |
|------|-------|--------|-------------|
| `readFile` | `{ path, startLine?, endLine? }` | `{ content, lines }` | Read file contents with optional line range |
| `writeFile` | `{ path, content }` | `{ success, path }` | Write/create a file |
| `editFile` | `{ path, oldString, newString }` | `{ success, diff }` | Find-and-replace in a file |
| `globFiles` | `{ pattern, cwd? }` | `{ files: string[] }` | Glob pattern file search |
| `grepSearch` | `{ pattern, path?, glob? }` | `{ matches: Match[] }` | Regex content search |

### Git Tools (`src/tools/git.ts`)
| Tool | Input | Output | Description |
|------|-------|--------|-------------|
| `gitStatus` | `{ cwd? }` | `{ status }` | Git status |
| `gitDiff` | `{ cwd?, staged? }` | `{ diff }` | Git diff |
| `gitCommit` | `{ message, files?, cwd? }` | `{ hash }` | Stage and commit |
| `gitBranch` | `{ name, cwd? }` | `{ branch }` | Create/switch branch |
| `gitWorktree` | `{ action, branch?, path? }` | `{ worktreePath }` | Create/remove worktree |

### Shell Tool (`src/tools/shell.ts`)
| Tool | Input | Output | Description |
|------|-------|--------|-------------|
| `executeCommand` | `{ command, cwd?, timeout? }` | `{ stdout, stderr, exitCode }` | Run shell command via RTK for token-optimized output |

**RTK Integration**: All shell commands are piped through [RTK (Rust Token Killer)](https://github.com/rtk-ai/rtk) - a Rust CLI proxy that compresses command outputs by 60-90%. This is critical for keeping agent context windows efficient. A `git diff` goes from ~21K tokens to ~1.2K tokens. RTK supports 50+ commands (git, npm, test runners, docker, etc.).

```typescript
// Shell tool wraps commands with rtk for token optimization
execute: async ({ command, cwd, timeout }) => {
  const result = await execa('rtk', ['exec', '--', ...parseCommand(command)], {
    cwd, timeout, reject: false
  })
  return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode }
}
```

RTK is installed as a system dependency (`brew install rtk` or pre-built binary). The `picklejar init` command will check for RTK and prompt installation if missing.

### Task Management Tools (`src/tools/task.ts`)
| Tool | Input | Output | Description |
|------|-------|--------|-------------|
| `createSubtask` | `{ parentId, title, type, assignTo }` | `{ taskId }` | Create a subtask |
| `updateTaskStatus` | `{ taskId, status, result? }` | `{ success }` | Update task status |
| `reportCompletion` | `{ taskId, summary, artifacts }` | `{ success }` | Mark task complete with results |

---

## CLI Design (`src/cli.ts`)

```typescript
#!/usr/bin/env node
import { Command } from 'commander'

const program = new Command()
  .name('picklejar')
  .description('AI coding agent orchestration tool')
  .version('0.1.0')

program
  .command('start')
  .description('Launch picklejar server and Studio')
  .option('-p, --port <number>', 'Server port', '4111')
  .option('-c, --config <path>', 'Config file path', 'picklejar.config.json')
  .action(async (opts) => {
    // 1. Load and validate config
    // 2. Create Mastra instance with agents
    // 3. Start dev server (mastra dev equivalent)
    // 4. Print Studio URL
  })

program
  .command('task <description>')
  .description('Submit a task directly from CLI')
  .action(async (description) => {
    // POST to running server's task endpoint
  })

program
  .command('status')
  .description('Show current task status')
  .action(async () => {
    // GET from running server's status endpoint
  })

program
  .command('init')
  .description('Create default picklejar.config.json and check dependencies')
  .action(async () => {
    // Write default config + .env.example
    // Check for RTK installation, prompt to install if missing
    // Verify Node.js >= 20
  })
```

**Package bin**: `"bin": { "picklejar": "./dist/cli.js" }` in package.json.

---

## Web Server & Custom Routes (`src/server/routes.ts`)

Using Mastra's `registerApiRoute` from `@mastra/core/server`:

1. **`POST /api/tasks`** - Submit a new task to the coordinator
2. **`GET /api/tasks`** - List all tasks with status
3. **`GET /api/tasks/:id`** - Get task details + subtasks
4. **`GET /api/tasks/:id/stream`** - SSE stream for real-time task progress
5. **`GET /api/agents`** - List active agents with status
6. **`GET /api/health`** - Health check

These routes appear in Mastra's Swagger UI at `/swagger-ui` alongside built-in agent routes.

---

## Memory Configuration

| Agent Type | Memory Type | Purpose |
|-----------|-------------|---------|
| Coordinator | Observational Memory | Long-term project context. Compresses conversation history automatically (5-40x). Persists across tasks. |
| Discovery | Working Memory (lastMessages: 20) | Per-task context for exploration. Fresh thread per subtask. |
| Implementation | Message History (lastMessages: 30) | Per-task conversation. Fresh thread per subtask. |

**Storage**: `@mastra/libsql` with local SQLite file (`:memory:` for dev, file path for persistence).

**Multi-agent memory sharing**: Coordinator uses `resourceId` = project ID. Sub-agents get derived `resourceId` = `{projectId}-{agentName}`. Each subtask gets a unique `threadId`.

---

## Git Worktree Strategy

1. **Main branch** stays clean - coordinator reads from it
2. When an implementation agent gets a subtask:
   - `git worktree add ./worktrees/impl-{agentIndex}-{taskId} -b task/{taskId}`
   - Agent works exclusively in that worktree directory
   - Agent commits to its branch when tests pass
3. When subtask completes:
   - Coordinator reviews the branch diff
   - Merges to main (or a staging branch)
   - Worktree cleaned up: `git worktree remove`
4. Conflict resolution: coordinator decides merge order, sequential merges

---

## Implementation Order

### Phase 1: Foundation (Steps 1-5)
1. **Project scaffolding** - package.json, tsconfig.json, dependencies
2. **RTK integration** - Check/install RTK, wrap shell tool with `rtk exec`
3. **Config system** - JSON schema, loader, defaults, Zod validation
4. **Basic tools** - readFile, writeFile, editFile, glob, grep, shell (via RTK)
5. **Single agent test** - One discovery agent with tools, verify via Mastra Studio

### Phase 2: Multi-Agent Core (Steps 5-8)
5. **Task management** - Task store, state machine, task tools
6. **All agent types** - Coordinator, discovery factory, implementation factory
7. **Supervisor wiring** - Coordinator delegates to sub-agents via Mastra's `agents` property
8. **Memory integration** - Observational for coordinator, working for discovery, history for impl

### Phase 3: Isolation & CLI (Steps 9-11)
9. **Git worktree manager** - Create/cleanup worktrees per implementation agent
10. **Git tools** - Status, diff, commit, branch, worktree tools
11. **CLI** - Commander.js entry point with start, task, status, init commands

### Phase 4: Web & Polish (Steps 12-14)
12. **Custom API routes** - Task CRUD, SSE streaming, agent status endpoints
13. **SSE progress streaming** - Real-time task updates to Mastra Studio
14. **End-to-end testing** - Full flow: submit task via CLI -> coordinator breaks down -> agents execute -> results merged

---

## Dependencies

```json
{
  "dependencies": {
    "@mastra/core": "^1.10.0",
    "@mastra/memory": "^1.10.0",
    "@mastra/libsql": "latest",
    "@ai-sdk/anthropic": "^3.0.0",
    "@ai-sdk/openai": "^3.0.0",
    "@ai-sdk/google": "latest",
    "mastra": "^1.3.15",
    "commander": "^14.0.0",
    "zod": "^3.23.0",
    "ajv": "^8.17.0",
    "execa": "^9.0.0",
    "picocolors": "^1.1.0",
    "fast-glob": "^3.3.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0",
    "@types/node": "^22.0.0",
    "tsup": "^8.0.0"
  }
}
```

---

## Verification Plan

1. **Config loading**: `picklejar init` creates valid config, `picklejar start` loads it
2. **Tool tests**: Unit test each tool (readFile reads, writeFile writes, etc.)
3. **Single agent**: Start with one discovery agent, submit a task via Studio, verify file reading works
4. **Multi-agent**: Coordinator delegates to discovery + implementation agents
5. **Worktree isolation**: Two implementation agents work in parallel without conflicts
6. **Memory persistence**: Coordinator remembers project context across multiple tasks
7. **Model swapping**: Change config model to `ollama/llama3.3:70b`, verify agent uses it
8. **CLI flow**: `picklejar start` launches server, `picklejar task "add tests"` submits task
9. **Web UI**: Task progress visible in Mastra Studio, SSE endpoint streams updates
10. **End-to-end**: Submit "refactor module X" -> coordinator plans -> discovery explores -> impl agents code -> branches merged
