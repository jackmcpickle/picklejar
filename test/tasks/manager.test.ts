import { describe, it, expect } from 'vitest';
import {
    submitRootTask,
    createSubtask,
    completeTask,
    failTask,
    getTaskTree,
    getTask,
} from '../../src/tasks/manager.js';

describe('manager', () => {
    describe('submitRootTask', () => {
        it('creates root task', () => {
            const task = submitRootTask('Root', 'root desc');

            expect(task.id).toMatch(/^task-\d+$/);
            expect(task.title).toBe('Root');
            expect(task.description).toBe('root desc');
            expect(task.type).toBe('root');
            expect(task.parentId).toBeNull();
            expect(task.status).toBe('pending');
        });
    });

    describe('createSubtask', () => {
        it('creates linked child task', () => {
            const root = submitRootTask('Parent root', '');
            const sub = createSubtask(root.id, 'Sub', 'discovery', 'sub desc');

            expect(sub.parentId).toBe(root.id);
            expect(sub.type).toBe('discovery');
            expect(sub.description).toBe('sub desc');

            const parent = getTask(root.id);
            expect(parent?.subtaskIds).toContain(sub.id);
        });

        it('throws for non-existent parent', () => {
            expect(() =>
                createSubtask('task-fake', 'Orphan', 'implementation'),
            ).toThrow('Parent task task-fake not found');
        });
    });

    describe('completeTask', () => {
        it('sets status to completed with result', () => {
            const task = submitRootTask('Complete me', '');
            const completed = completeTask(task.id, 'all done');

            expect(completed.status).toBe('completed');
            expect(completed.result).toBe('all done');
        });
    });

    describe('failTask', () => {
        it('sets status to failed with reason', () => {
            const task = submitRootTask('Fail me', '');
            const failed = failTask(task.id, 'something broke');

            expect(failed.status).toBe('failed');
            expect(failed.result).toBe('something broke');
        });
    });

    describe('getTaskTree', () => {
        it('returns root with subtasks array', () => {
            const root = submitRootTask('Tree root', '');
            const sub1 = createSubtask(root.id, 'Sub 1', 'discovery');
            const sub2 = createSubtask(root.id, 'Sub 2', 'implementation');

            const tree = getTaskTree(root.id);

            expect(tree.id).toBe(root.id);
            expect(tree.title).toBe('Tree root');
            expect(tree.subtasks).toHaveLength(2);
            expect(tree.subtasks.map((s) => s.id)).toEqual([sub1.id, sub2.id]);
        });

        it('returns empty subtasks when none exist', () => {
            const root = submitRootTask('Lonely root', '');
            const tree = getTaskTree(root.id);

            expect(tree.subtasks).toEqual([]);
        });

        it('throws for non-existent root', () => {
            expect(() => getTaskTree('task-ghost')).toThrow(
                'Task task-ghost not found',
            );
        });
    });
});
