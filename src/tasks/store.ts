import type { Task, TaskStatus } from './types.js'

let nextId = 1
const tasks = new Map<string, Task>()

export function createTask(
  title: string,
  description: string,
  type: Task['type'],
  parentId: string | null = null,
): Task {
  const id = `task-${nextId++}`
  const now = Date.now()
  const task: Task = {
    id,
    title,
    description,
    status: 'pending',
    type,
    parentId,
    assignedAgent: null,
    result: null,
    createdAt: now,
    updatedAt: now,
    subtaskIds: [],
  }
  tasks.set(id, task)

  if (parentId) {
    const parent = tasks.get(parentId)
    if (parent) {
      parent.subtaskIds.push(id)
      parent.updatedAt = now
    }
  }

  emitTaskEvent(id, 'created')
  return task
}

export function getTask(id: string): Task | undefined {
  return tasks.get(id)
}

export function getAllTasks(): Task[] {
  return Array.from(tasks.values())
}

export function updateTaskStatus(id: string, status: TaskStatus, result?: string): Task {
  const task = tasks.get(id)
  if (!task) throw new Error(`Task ${id} not found`)

  task.status = status
  task.updatedAt = Date.now()
  if (result !== undefined) task.result = result

  emitTaskEvent(id, status)
  return task
}

export function assignTask(id: string, agentId: string): Task {
  const task = tasks.get(id)
  if (!task) throw new Error(`Task ${id} not found`)

  task.assignedAgent = agentId
  task.status = 'active'
  task.updatedAt = Date.now()

  emitTaskEvent(id, 'assigned')
  return task
}

// SSE event emitter for real-time progress
type TaskEventListener = (taskId: string, event: string, task: Task) => void
const listeners: TaskEventListener[] = []

export function onTaskEvent(listener: TaskEventListener): () => void {
  listeners.push(listener)
  return () => {
    const idx = listeners.indexOf(listener)
    if (idx >= 0) listeners.splice(idx, 1)
  }
}

function emitTaskEvent(taskId: string, event: string) {
  const task = tasks.get(taskId)
  if (task) {
    for (const listener of listeners) {
      listener(taskId, event, task)
    }
  }
}
