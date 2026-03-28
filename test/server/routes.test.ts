import { describe, it, expect, vi } from 'vitest';
import {
    apiRoutes,
    taskCreateRoute,
    taskListRoute,
    taskDetailRoute,
    taskStreamRoute,
    agentStatusRoute,
    healthRoute,
} from '../../src/server/routes.js';
import {
    submitRootTask,
    createSubtask,
    completeTask,
    getTaskTree,
    getAllTasks,
    getTask,
    onTaskEvent,
} from '../../src/tasks/manager.js';
import { getActiveWorktrees } from '../../src/worktree/manager.js';

describe('server routes', () => {
    describe('route exports', () => {
        it('apiRoutes contains 6 routes', () => {
            expect(apiRoutes).toHaveLength(6);
        });

        it('all named route exports exist', () => {
            expect(taskCreateRoute).toBeDefined();
            expect(taskListRoute).toBeDefined();
            expect(taskDetailRoute).toBeDefined();
            expect(taskStreamRoute).toBeDefined();
            expect(agentStatusRoute).toBeDefined();
            expect(healthRoute).toBeDefined();
        });

        it('apiRoutes includes all named exports', () => {
            expect(apiRoutes).toContain(taskCreateRoute);
            expect(apiRoutes).toContain(taskListRoute);
            expect(apiRoutes).toContain(taskDetailRoute);
            expect(apiRoutes).toContain(taskStreamRoute);
            expect(apiRoutes).toContain(agentStatusRoute);
            expect(apiRoutes).toContain(healthRoute);
        });
    });

    describe('route metadata', () => {
        it('taskCreateRoute - POST /tasks', () => {
            expect(taskCreateRoute.path).toBe('/tasks');
            expect(taskCreateRoute.method).toBe('POST');
            expect(taskCreateRoute.handler).toBeTypeOf('function');
        });

        it('taskListRoute - GET /tasks/list', () => {
            expect(taskListRoute.path).toBe('/tasks/list');
            expect(taskListRoute.method).toBe('GET');
        });

        it('taskDetailRoute - GET /tasks/:id', () => {
            expect(taskDetailRoute.path).toBe('/tasks/:id');
            expect(taskDetailRoute.method).toBe('GET');
        });

        it('taskStreamRoute - GET /tasks/:id/stream', () => {
            expect(taskStreamRoute.path).toBe('/tasks/:id/stream');
            expect(taskStreamRoute.method).toBe('GET');
        });

        it('agentStatusRoute - GET /agents/status', () => {
            expect(agentStatusRoute.path).toBe('/agents/status');
            expect(agentStatusRoute.method).toBe('GET');
        });

        it('healthRoute - GET /health', () => {
            expect(healthRoute.path).toBe('/health');
            expect(healthRoute.method).toBe('GET');
        });

        it('no route paths start with /api', () => {
            for (const route of apiRoutes) {
                expect(route.path).not.toMatch(/^\/api/);
            }
        });
    });

    describe('task flow integration', () => {
        it('submit root task appears in getAllTasks', () => {
            const task = submitRootTask('Route test', 'via route');
            const all = getAllTasks();
            expect(all.some((t) => t.id === task.id)).toBe(true);
        });

        it('submit root task → getTaskTree returns empty subtasks', () => {
            const task = submitRootTask('Tree test', 'desc');
            const tree = getTaskTree(task.id);

            expect(tree.id).toBe(task.id);
            expect(tree.title).toBe('Tree test');
            expect(tree.subtasks).toEqual([]);
        });

        it('create subtask → visible in getTaskTree', () => {
            const root = submitRootTask('Parent', '');
            const sub = createSubtask(
                root.id,
                'Child',
                'discovery',
                'child desc',
            );

            const tree = getTaskTree(root.id);
            expect(tree.subtasks).toHaveLength(1);
            expect(tree.subtasks[0].id).toBe(sub.id);
            expect(tree.subtasks[0].title).toBe('Child');
        });

        it('complete task → status reflected in getTask', () => {
            const task = submitRootTask('To complete', '');
            completeTask(task.id, 'done');

            const updated = getTask(task.id);
            expect(updated?.status).toBe('completed');
            expect(updated?.result).toBe('done');
        });

        it('getAllTasks returns count matching array length', () => {
            const before = getAllTasks().length;
            submitRootTask('Count test', '');
            const after = getAllTasks();

            expect(after.length).toBe(before + 1);
        });

        it('task events fire for SSE consumers', () => {
            const events: { taskId: string; event: string }[] = [];
            const unsubscribe = onTaskEvent((taskId, event) => {
                events.push({ taskId, event });
            });

            const task = submitRootTask('Event test', '');
            completeTask(task.id, 'result');

            unsubscribe();

            expect(events).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        taskId: task.id,
                        event: 'created',
                    }),
                    expect.objectContaining({
                        taskId: task.id,
                        event: 'completed',
                    }),
                ]),
            );
        });

        it('unsubscribe stops receiving events', () => {
            const events: string[] = [];
            const unsubscribe = onTaskEvent((_taskId, event) => {
                events.push(event);
            });

            submitRootTask('Before unsub', '');
            unsubscribe();
            submitRootTask('After unsub', '');

            // Only the 'created' from first task
            expect(events).toEqual(['created']);
        });
    });

    describe('worktree status', () => {
        it('getActiveWorktrees returns empty array when no worktrees', () => {
            const worktrees = getActiveWorktrees();
            expect(worktrees).toEqual([]);
        });
    });

    describe('route handler logic', () => {
        function mockContext(
            overrides: {
                json?: () => Promise<unknown>;
                param?: (key: string) => string | undefined;
                get?: (key: string) => unknown;
                signal?: AbortSignal;
            } = {},
        ) {
            const responses: Array<{ body: unknown; status?: number }> = [];
            return {
                ctx: {
                    req: {
                        json: overrides.json ?? (() => Promise.resolve({})),
                        param: overrides.param ?? (() => undefined),
                        raw: {
                            signal:
                                overrides.signal ??
                                new AbortController().signal,
                        },
                    },
                    get: overrides.get ?? (() => undefined),
                    json: (body: unknown, status?: number) => {
                        responses.push({ body, status });
                        return { body, status };
                    },
                },
                responses,
            };
        }

        describe('taskCreateRoute handler', () => {
            it('creates task from body and returns 201', async () => {
                const { ctx, responses } = mockContext({
                    json: () =>
                        Promise.resolve({
                            title: 'handler test',
                            description: 'desc',
                        }),
                });

                await taskCreateRoute.handler(ctx as any);

                expect(responses).toHaveLength(1);
                expect(responses[0].status).toBe(201);
                expect(responses[0].body).toMatchObject({
                    title: 'handler test',
                    status: 'pending',
                    type: 'root',
                });
            });
        });

        describe('taskListRoute handler', () => {
            it('returns tasks array with count', async () => {
                submitRootTask('list-handler-test', '');
                const { ctx, responses } = mockContext();

                await taskListRoute.handler(ctx as any);

                expect(responses).toHaveLength(1);
                const body = responses[0].body as {
                    tasks: unknown[];
                    count: number;
                };
                expect(body.count).toBe(body.tasks.length);
                expect(body.count).toBeGreaterThan(0);
            });
        });

        describe('taskDetailRoute handler', () => {
            it('returns task tree for valid ID', async () => {
                const task = submitRootTask('detail-test', '');
                const { ctx, responses } = mockContext({
                    param: (key: string) =>
                        key === 'id' ? task.id : undefined,
                });

                await taskDetailRoute.handler(ctx as any);

                expect(responses).toHaveLength(1);
                expect(responses[0].body).toMatchObject({
                    id: task.id,
                    title: 'detail-test',
                    subtasks: [],
                });
            });

            it('returns 404 for non-existent ID', async () => {
                const { ctx, responses } = mockContext({
                    param: () => 'task-99999',
                });

                await taskDetailRoute.handler(ctx as any);

                expect(responses).toHaveLength(1);
                expect(responses[0].status).toBe(404);
            });
        });

        describe('healthRoute handler', () => {
            it('returns status ok with uptime', async () => {
                const { ctx, responses } = mockContext();

                await healthRoute.handler(ctx as any);

                expect(responses).toHaveLength(1);
                const body = responses[0].body as {
                    status: string;
                    uptime: number;
                };
                expect(body.status).toBe('ok');
                expect(body.uptime).toBeTypeOf('number');
            });
        });

        describe('agentStatusRoute handler', () => {
            it('returns worktrees array', async () => {
                const { ctx, responses } = mockContext();

                await agentStatusRoute.handler(ctx as any);

                expect(responses).toHaveLength(1);
                const body = responses[0].body as {
                    worktrees: unknown[];
                };
                expect(body.worktrees).toBeInstanceOf(Array);
            });
        });

        describe('taskStreamRoute handler', () => {
            it('returns SSE response with init event for valid task', async () => {
                const task = submitRootTask('stream-test', '');
                const controller = new AbortController();
                const { ctx } = mockContext({
                    param: (key: string) =>
                        key === 'id' ? task.id : undefined,
                    signal: controller.signal,
                });

                const result = await taskStreamRoute.handler(ctx as any);

                expect(result).toBeInstanceOf(Response);
                const response = result as Response;
                expect(response.headers.get('Content-Type')).toBe(
                    'text/event-stream',
                );

                // Read the first chunk (init event)
                const reader = response.body!.getReader();
                const { value } = await reader.read();
                const text = new TextDecoder().decode(value);
                expect(text).toContain('"event":"init"');

                controller.abort();
                reader.releaseLock();
            });

            it('returns 404 for non-existent task', async () => {
                const { ctx, responses } = mockContext({
                    param: () => 'task-nonexistent',
                });

                await taskStreamRoute.handler(ctx as any);

                expect(responses).toHaveLength(1);
                expect(responses[0].status).toBe(404);
            });
        });
    });
});
