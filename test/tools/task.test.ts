import { describe, it, expect, beforeEach } from 'vitest';
import {
    createSubtask,
    updateTaskStatus,
    reportCompletion,
} from '../../src/mastra/tools/task.js';
import * as taskManager from '../../src/tasks/manager.js';

let rootId: string;

beforeEach(() => {
    const root = taskManager.submitRootTask('Root', 'root task');
    rootId = root.id;
});

describe('createSubtask', () => {
    it('creates subtask under parent', async () => {
        const result = await createSubtask.execute!(
            {
                parentId: rootId,
                title: 'Sub',
                description: 'sub desc',
                type: 'discovery',
            },
            {} as unknown,
        );

        expect(result.taskId).toMatch(/^task-\d+$/);
        expect(result.status).toBe('pending');

        const task = taskManager.getTask(result.taskId);
        expect(task?.title).toBe('Sub');
        expect(task?.type).toBe('discovery');
        expect(task?.parentId).toBe(rootId);
    });
});

describe('updateTaskStatus', () => {
    it('completes a task', async () => {
        const sub = taskManager.createSubtask(
            rootId,
            'Complete me',
            'implementation',
        );
        const result = await updateTaskStatus.execute!(
            { taskId: sub.id, status: 'completed', result: 'done' },
            {} as unknown,
        );

        expect(result).toEqual({ success: true });
        expect(taskManager.getTask(sub.id)?.status).toBe('completed');
        expect(taskManager.getTask(sub.id)?.result).toBe('done');
    });

    it('fails a task', async () => {
        const sub = taskManager.createSubtask(rootId, 'Fail me', 'discovery');
        const result = await updateTaskStatus.execute!(
            { taskId: sub.id, status: 'failed', result: 'broke' },
            {} as unknown,
        );

        expect(result).toEqual({ success: true });
        expect(taskManager.getTask(sub.id)?.status).toBe('failed');
        expect(taskManager.getTask(sub.id)?.result).toBe('broke');
    });
});

describe('reportCompletion', () => {
    it('completes with summary', async () => {
        const sub = taskManager.createSubtask(
            rootId,
            'Report me',
            'implementation',
        );
        const result = await reportCompletion.execute!(
            { taskId: sub.id, summary: 'All done' },
            {} as unknown,
        );

        expect(result).toEqual({ success: true });
        expect(taskManager.getTask(sub.id)?.status).toBe('completed');
        expect(taskManager.getTask(sub.id)?.result).toBe('All done');
    });

    it('includes artifacts in result', async () => {
        const sub = taskManager.createSubtask(
            rootId,
            'Artifacts',
            'implementation',
        );
        const result = await reportCompletion.execute!(
            {
                taskId: sub.id,
                summary: 'Done',
                artifacts: ['file1.ts', 'file2.ts'],
            },
            {} as unknown,
        );

        expect(result).toEqual({ success: true });
        const task = taskManager.getTask(sub.id);
        expect(task?.result).toBe('Done\n\nArtifacts:\n- file1.ts\n- file2.ts');
    });
});
