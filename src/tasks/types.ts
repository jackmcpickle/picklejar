export type TaskStatus = 'pending' | 'active' | 'completed' | 'failed'
export type TaskType = 'discovery' | 'implementation'

export interface Task {
  id: string
  title: string
  description: string
  status: TaskStatus
  type: TaskType | 'root'
  parentId: string | null
  assignedAgent: string | null
  result: string | null
  createdAt: number
  updatedAt: number
  subtaskIds: string[]
}
