import { describe, it, expect, vi } from 'vitest';
import {
    createTask,
    getTask,
    getAllTasks,
    updateTaskStatus,
    assignTask,
    onTaskEvent,
} from '../../src/tasks/store.js';

describe('store', () => {
    describe('createTask', () => {
        it('creates task with correct fields', () => {
            const task = createTask('Test title', 'Test desc', 'discovery');

            expect(task.id).toMatch(/^task-\d+$/);
            expect(task.title).toBe('Test title');
            expect(task.description).toBe('Test desc');
            expect(task.status).toBe('pending');
            expect(task.type).toBe('discovery');
            expect(task.parentId).toBeNull();
            expect(task.assignedAgent).toBeNull();
            expect(task.result).toBeNull();
            expect(task.createdAt).toBeTypeOf('number');
            expect(task.updatedAt).toBe(task.createdAt);
            expect(task.subtaskIds).toEqual([]);
        });

        it('links subtask to parent subtaskIds', () => {
            const parent = createTask('Parent', 'parent desc', 'root');
            const child = createTask(
                'Child',
                'child desc',
                'discovery',
                parent.id,
            );

            expect(child.parentId).toBe(parent.id);

            const updatedParent = getTask(parent.id);
            expect(updatedParent?.subtaskIds).toContain(child.id);
        });
    });

    describe('getTask', () => {
        it('returns undefined for non-existent ID', () => {
            expect(getTask('task-nonexistent')).toBeUndefined();
        });

        it('returns existing task', () => {
            const created = createTask('Fetch me', '', 'implementation');
            const fetched = getTask(created.id);
            expect(fetched).toBe(created);
        });
    });

    describe('getAllTasks', () => {
        it('returns all created tasks', () => {
            const before = getAllTasks().length;
            createTask('All-1', '', 'discovery');
            createTask('All-2', '', 'implementation');
            const after = getAllTasks();

            expect(after.length).toBe(before + 2);
        });
    });

    describe('updateTaskStatus', () => {
        it('changes status and result', () => {
            const task = createTask('Status test', '', 'discovery');
            const updated = updateTaskStatus(task.id, 'completed', 'done');

            expect(updated.status).toBe('completed');
            expect(updated.result).toBe('done');
            expect(updated.updatedAt).toBeGreaterThanOrEqual(task.createdAt);
        });

        it('changes status without result', () => {
            const task = createTask('No result', '', 'discovery');
            const updated = updateTaskStatus(task.id, 'active');

            expect(updated.status).toBe('active');
            expect(updated.result).toBeNull();
        });

        it('throws for non-existent task', () => {
            expect(() => updateTaskStatus('task-missing', 'completed')).toThrow(
                'Task task-missing not found',
            );
        });
    });

    describe('assignTask', () => {
        it('sets agent and status to active', () => {
            const task = createTask('Assign test', '', 'implementation');
            const assigned = assignTask(task.id, 'agent-1');

            expect(assigned.assignedAgent).toBe('agent-1');
            expect(assigned.status).toBe('active');
            expect(assigned.updatedAt).toBeGreaterThanOrEqual(task.createdAt);
        });

        it('throws for non-existent task', () => {
            expect(() => assignTask('task-nope', 'agent-1')).toThrow(
                'Task task-nope not found',
            );
        });
    });

    describe('onTaskEvent', () => {
        it('listener receives events on create, update, assign', () => {
            const listener = vi.fn();
            const unsub = onTaskEvent(listener);

            const task = createTask('Event test', '', 'discovery');
            expect(listener).toHaveBeenCalledWith(task.id, 'created', task);

            updateTaskStatus(task.id, 'completed', 'result');
            expect(listener).toHaveBeenCalledWith(
                task.id,
                'completed',
                expect.objectContaining({ status: 'completed' }),
            );

            const task2 = createTask('Assign event', '', 'implementation');
            assignTask(task2.id, 'agent-2');
            expect(listener).toHaveBeenCalledWith(
                task2.id,
                'assigned',
                expect.objectContaining({ assignedAgent: 'agent-2' }),
            );

            unsub();
        });

        it('unsubscribe stops receiving events', () => {
            const listener = vi.fn();
            const unsub = onTaskEvent(listener);

            createTask('Before unsub', '', 'discovery');
            expect(listener).toHaveBeenCalledTimes(1);

            unsub();

            createTask('After unsub', '', 'discovery');
            // still only 1 call from before unsub
            expect(listener).toHaveBeenCalledTimes(1);
        });
    });
});
