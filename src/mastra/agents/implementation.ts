import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { getConfig } from '../../config/loader.js';
import {
    gitCommit,
    gitBranch,
    gitWorktree,
    gitStatus,
    gitDiff,
} from '../tools/index.js';
import { createFullWorkspace } from '../workspace.js';

export function createImplementationAgent(index: number): Agent {
    const config = getConfig();

    return new Agent({
        id: `implementation-${index}`,
        name: `Implementation Agent ${index}`,
        description: `Writes, edits, and tests code. Works in isolated git worktrees. Agent instance ${index}.`,
        instructions: `You are Implementation Agent ${index}, a specialist in writing and modifying code.

Your responsibilities:
- Write new code files and modify existing ones
- Run tests and linters after making changes
- Fix issues identified during testing
- Create git commits for completed work
- Work within your assigned git worktree to avoid conflicts with other agents

Guidelines:
- Always read existing code before modifying it
- Write clean, well-structured code following existing patterns
- Run tests after changes to verify correctness
- Make focused commits with clear messages
- Report what you've done and any issues encountered`,
        model: config.agents.implementation.model,
        tools: {
            gitCommit,
            gitBranch,
            gitWorktree,
            gitStatus,
            gitDiff,
        },
        workspace: createFullWorkspace('.'),
        memory: new Memory({
            options: {
                lastMessages: 30,
            },
        }),
        defaultOptions: {
            maxSteps: config.agents.implementation.maxSteps,
        },
    });
}

export function createImplementationAgents(): Agent[] {
    const config = getConfig();
    return Array.from({ length: config.agents.implementation.count }, (_, i) =>
        createImplementationAgent(i + 1),
    );
}
