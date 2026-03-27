import * as store from './store.js'
import type { Task, TaskType } from './types.js'

export function submitRootTask(title: string, description: string): Task {
  return store.createTask(title, description, 'root')
}

export function createSubtask(
  parentId: string,
  title: string,
  type: TaskType,
  description: string = '',
): Task {
  const parent = store.getTask(parentId)
  if (!parent) throw new Error(`Parent task ${parentId} not found`)
  return store.createTask(title, description, type, parentId)
}

export function completeTask(id: string, result: string): Task {
  return store.updateTaskStatus(id, 'completed', result)
}

export function failTask(id: string, reason: string): Task {
  return store.updateTaskStatus(id, 'failed', reason)
}

export function getTaskTree(rootId: string): Task & { subtasks: Task[] } {
  const root = store.getTask(rootId)
  if (!root) throw new Error(`Task ${rootId} not found`)

  const subtasks = root.subtaskIds
    .map((id) => store.getTask(id))
    .filter((t): t is Task => t !== undefined)

  return { ...root, subtasks }
}

export { getTask, getAllTasks, assignTask, onTaskEvent } from './store.js'
