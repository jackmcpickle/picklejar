import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import * as taskManager from '../tasks/manager.js'

export const createSubtask = createTool({
  id: 'create-subtask',
  description: 'Create a subtask under a parent task for delegation to an agent',
  inputSchema: z.object({
    parentId: z.string().describe('Parent task ID'),
    title: z.string().describe('Short task title'),
    description: z.string().describe('Detailed task description'),
    type: z.enum(['discovery', 'implementation']).describe('Task type determines which agent pool handles it'),
  }),
  outputSchema: z.object({
    taskId: z.string(),
    status: z.string(),
  }),
  execute: async ({ parentId, title, description, type }) => {
    const task = taskManager.createSubtask(parentId, title, type, description)
    return { taskId: task.id, status: task.status }
  },
})

export const updateTaskStatus = createTool({
  id: 'update-task-status',
  description: 'Update the status of a task',
  inputSchema: z.object({
    taskId: z.string().describe('Task ID to update'),
    status: z.enum(['active', 'completed', 'failed']).describe('New status'),
    result: z.string().optional().describe('Result or error message'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
  }),
  execute: async ({ taskId, status, result }) => {
    if (status === 'completed') {
      taskManager.completeTask(taskId, result ?? 'Completed')
    } else if (status === 'failed') {
      taskManager.failTask(taskId, result ?? 'Failed')
    }
    return { success: true }
  },
})

export const reportCompletion = createTool({
  id: 'report-completion',
  description: 'Report that a task is complete with a summary of what was accomplished',
  inputSchema: z.object({
    taskId: z.string().describe('Task ID'),
    summary: z.string().describe('Summary of what was accomplished'),
    artifacts: z.array(z.string()).optional().describe('List of files created/modified'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
  }),
  execute: async ({ taskId, summary, artifacts }) => {
    const result = artifacts
      ? `${summary}\n\nArtifacts:\n${artifacts.map((a: string) => `- ${a}`).join('\n')}`
      : summary
    taskManager.completeTask(taskId, result)
    return { success: true }
  },
})
