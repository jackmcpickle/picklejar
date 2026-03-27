import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { execa } from 'execa'

async function git(args: string[], cwd?: string) {
  const result = await execa('git', args, { cwd, reject: false })
  if (result.exitCode !== 0 && result.stderr) {
    throw new Error(`git ${args[0]} failed: ${result.stderr}`)
  }
  return result.stdout
}

export const gitStatus = createTool({
  id: 'git-status',
  description: 'Show the working tree status',
  inputSchema: z.object({
    cwd: z.string().optional().describe('Repository directory'),
  }),
  outputSchema: z.object({
    status: z.string(),
  }),
  execute: async ({ cwd }) => {
    const status = await git(['status', '--short'], cwd)
    return { status }
  },
})

export const gitDiff = createTool({
  id: 'git-diff',
  description: 'Show changes in the working tree or staging area',
  inputSchema: z.object({
    cwd: z.string().optional().describe('Repository directory'),
    staged: z.boolean().optional().describe('Show staged changes only'),
  }),
  outputSchema: z.object({
    diff: z.string(),
  }),
  execute: async ({ cwd, staged }) => {
    const args = ['diff']
    if (staged) args.push('--cached')
    const diff = await git(args, cwd)
    return { diff }
  },
})

export const gitCommit = createTool({
  id: 'git-commit',
  description: 'Stage files and create a commit',
  inputSchema: z.object({
    message: z.string().describe('Commit message'),
    files: z.array(z.string()).optional().describe('Files to stage (defaults to all changes)'),
    cwd: z.string().optional().describe('Repository directory'),
  }),
  outputSchema: z.object({
    hash: z.string(),
  }),
  execute: async ({ message, files, cwd }) => {
    if (files && files.length > 0) {
      await git(['add', ...files], cwd)
    } else {
      await git(['add', '-A'], cwd)
    }
    await git(['commit', '-m', message], cwd)
    const hash = await git(['rev-parse', '--short', 'HEAD'], cwd)
    return { hash: hash.trim() }
  },
})

export const gitBranch = createTool({
  id: 'git-branch',
  description: 'Create or switch to a git branch',
  inputSchema: z.object({
    name: z.string().describe('Branch name'),
    create: z.boolean().optional().describe('Create a new branch'),
    cwd: z.string().optional().describe('Repository directory'),
  }),
  outputSchema: z.object({
    branch: z.string(),
  }),
  execute: async ({ name, create, cwd }) => {
    if (create) {
      await git(['checkout', '-b', name], cwd)
    } else {
      await git(['checkout', name], cwd)
    }
    return { branch: name }
  },
})

export const gitWorktree = createTool({
  id: 'git-worktree',
  description: 'Manage git worktrees for parallel agent work',
  inputSchema: z.object({
    action: z.enum(['add', 'remove', 'list']).describe('Worktree action'),
    branch: z.string().optional().describe('Branch name (for add)'),
    path: z.string().optional().describe('Worktree path (for add/remove)'),
    cwd: z.string().optional().describe('Repository directory'),
  }),
  outputSchema: z.object({
    result: z.string(),
    worktreePath: z.string().optional(),
  }),
  execute: async ({ action, branch, path, cwd }) => {
    switch (action) {
      case 'add': {
        if (!branch || !path) throw new Error('branch and path required for add')
        await git(['worktree', 'add', path, '-b', branch], cwd)
        return { result: `Worktree created at ${path}`, worktreePath: path }
      }
      case 'remove': {
        if (!path) throw new Error('path required for remove')
        await git(['worktree', 'remove', path, '--force'], cwd)
        return { result: `Worktree removed: ${path}` }
      }
      case 'list': {
        const listResult = await git(['worktree', 'list'], cwd)
        return { result: listResult }
      }
    }
  },
})
