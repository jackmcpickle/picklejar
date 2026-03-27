import { Agent } from '@mastra/core/agent'
import { Memory } from '@mastra/memory'
import { getConfig } from '../config/loader.js'
import { createSubtask, updateTaskStatus, reportCompletion } from '../tools/index.js'
import { createDiscoveryAgents } from './discovery.js'
import { createImplementationAgents } from './implementation.js'

export function createCoordinator(): {
  coordinator: Agent
  discoveryAgents: Agent[]
  implementationAgents: Agent[]
} {
  const config = getConfig()
  const discoveryAgents = createDiscoveryAgents()
  const implementationAgents = createImplementationAgents()

  // Build agents record from arrays
  const agentsRecord: Record<string, Agent> = {}
  for (const agent of discoveryAgents) {
    agentsRecord[agent.id!] = agent
  }
  for (const agent of implementationAgents) {
    agentsRecord[agent.id!] = agent
  }

  const coordinator = new Agent({
    id: 'coordinator',
    name: 'Coordinator',
    description: 'High-level orchestrator that breaks down coding tasks and delegates to specialized agents.',
    instructions: `You are the Coordinator, the lead architect orchestrating complex coding tasks.

Your responsibilities:
1. Receive coding tasks from the user
2. Break complex tasks into focused subtasks
3. Delegate discovery work to Discovery Agents (for code exploration, analysis, research)
4. Delegate implementation work to Implementation Agents (for writing code, running tests)
5. Synthesize results from all agents
6. Manage overall progress and handle failures

Available agents:
${discoveryAgents.map((a) => `- ${a.name}: Code exploration, file reading, pattern searching`).join('\n')}
${implementationAgents.map((a) => `- ${a.name}: Code writing, testing, git commits`).join('\n')}

Workflow:
1. First, use discovery agents to understand the codebase and gather context
2. Then, create implementation subtasks based on findings
3. Assign implementation agents to write code in isolated git worktrees
4. Review results and merge work when complete

Guidelines:
- Always start with discovery before implementation
- Break large tasks into small, focused subtasks
- Assign one subtask per agent at a time
- Monitor progress and handle failures gracefully
- Provide a final summary when the task is complete`,
    model: config.agents.coordinator.model,
    agents: agentsRecord,
    tools: { createSubtask, updateTaskStatus, reportCompletion },
    memory: new Memory({
      options: {
        lastMessages: 40,
        observationalMemory: config.memory.observationalMemory,
      },
    }),
    defaultOptions: {
      maxSteps: config.agents.coordinator.maxSteps,
    },
  })

  return { coordinator, discoveryAgents, implementationAgents }
}
