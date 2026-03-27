import { registerApiRoute } from '@mastra/core/server';
import type { Context } from 'hono';
import * as taskManager from '../tasks/manager.js';
import { getActiveWorktrees } from '../worktree/manager.js';

// Note: paths must NOT start with /api (reserved by Mastra)
// These routes will be available at /tasks, /tasks/list, etc.

export const taskCreateRoute = registerApiRoute('/tasks', {
    method: 'POST',
    handler: async (c: Context) => {
        const body = (await c.req.json()) as {
            title: string;
            description: string;
        };
        const task = taskManager.submitRootTask(body.title, body.description);

        // Get the Mastra instance to trigger the coordinator
        const mastra = c.get('mastra' as never) as
            | {
                  getAgent: (
                      id: string,
                  ) =>
                      | {
                            generate: (
                                prompt: string,
                                opts: unknown,
                            ) => Promise<unknown>;
                        }
                      | undefined;
              }
            | undefined;
        const coordinator = mastra?.getAgent('coordinator');
        if (coordinator) {
            coordinator
                .generate(
                    `New task submitted: ${body.title}\n\nDescription: ${body.description}\n\nTask ID: ${task.id}`,
                    {
                        memory: {
                            resource: 'project',
                            thread: `task-${task.id}`,
                        },
                    },
                )
                .catch((err: unknown) => {
                    const message =
                        err instanceof Error ? err.message : String(err);
                    console.error(
                        `Coordinator error on task ${task.id}:`,
                        message,
                    );
                    taskManager.failTask(task.id, message);
                });
        }

        return c.json(task, 201);
    },
});

export const taskListRoute = registerApiRoute('/tasks/list', {
    method: 'GET',
    handler: async (c: Context) => {
        const tasks = taskManager.getAllTasks();
        return c.json({ tasks, count: tasks.length });
    },
});

export const taskDetailRoute = registerApiRoute('/tasks/:id', {
    method: 'GET',
    handler: async (c: Context) => {
        const id = c.req.param('id');
        if (!id) return c.json({ error: 'Task ID required' }, 400);
        try {
            const tree = taskManager.getTaskTree(id);
            return c.json(tree);
        } catch {
            return c.json({ error: `Task ${id} not found` }, 404);
        }
    },
});

export const taskStreamRoute = registerApiRoute('/tasks/:id/stream', {
    method: 'GET',
    handler: async (c: Context) => {
        const id = c.req.param('id');
        if (!id) return c.json({ error: 'Task ID required' }, 400);

        const task = taskManager.getTask(id);
        if (!task) {
            return c.json({ error: `Task ${id} not found` }, 404);
        }

        return new Response(
            new ReadableStream({
                start(controller) {
                    const encoder = new TextEncoder();

                    controller.enqueue(
                        encoder.encode(
                            `data: ${JSON.stringify({ event: 'init', task })}\n\n`,
                        ),
                    );

                    const unsubscribe = taskManager.onTaskEvent(
                        (taskId, event, updatedTask) => {
                            if (taskId === id || updatedTask.parentId === id) {
                                controller.enqueue(
                                    encoder.encode(
                                        `data: ${JSON.stringify({ event, taskId, task: updatedTask })}\n\n`,
                                    ),
                                );
                            }
                        },
                    );

                    c.req.raw.signal.addEventListener('abort', () => {
                        unsubscribe();
                        controller.close();
                    });
                },
            }),
            {
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    Connection: 'keep-alive',
                },
            },
        );
    },
});

export const agentStatusRoute = registerApiRoute('/agents/status', {
    method: 'GET',
    handler: async (c: Context) => {
        const worktrees = getActiveWorktrees();
        return c.json({ worktrees });
    },
});

export const healthRoute = registerApiRoute('/health', {
    method: 'GET',
    handler: async (c: Context) => {
        return c.json({ status: 'ok', uptime: process.uptime() });
    },
});

export const apiRoutes = [
    taskCreateRoute,
    taskListRoute,
    taskDetailRoute,
    taskStreamRoute,
    agentStatusRoute,
    healthRoute,
];
