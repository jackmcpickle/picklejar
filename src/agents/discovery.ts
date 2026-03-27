import { Agent } from '@mastra/core/agent'
import { Memory } from '@mastra/memory'
import { getConfig } from '../config/loader.js'
import { readFile, globFiles, grepSearch, gitStatus, gitDiff } from '../tools/index.js'

export function createDiscoveryAgent(index: number): Agent {
  const config = getConfig()

  return new Agent({
    id: `discovery-${index}`,
    name: `Discovery Agent ${index}`,
    description: `Explores codebases, reads files, searches for patterns, and reports findings. Agent instance ${index}.`,
    instructions: `You are Discovery Agent ${index}, a specialist in code exploration and analysis.

Your responsibilities:
- Read and analyze source code files
- Search for patterns, functions, classes, and dependencies
- Explore directory structures and understand project architecture
- Analyze git history and changes
- Report structured findings back to the coordinator

Guidelines:
- Be thorough but concise in your findings
- Include file paths and line numbers when referencing code
- Highlight potential issues, patterns, and architectural decisions
- Focus on what's relevant to the task at hand`,
    model: config.agents.discovery.model,
    tools: { readFile, globFiles, grepSearch, gitStatus, gitDiff },
    memory: new Memory({
      options: {
        lastMessages: 20,
      },
    }),
    defaultOptions: {
      maxSteps: config.agents.discovery.maxSteps,
    },
  })
}

export function createDiscoveryAgents(): Agent[] {
  const config = getConfig()
  return Array.from({ length: config.agents.discovery.count }, (_, i) =>
    createDiscoveryAgent(i + 1),
  )
}
