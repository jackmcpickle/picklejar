import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import * as taskManager from '../../tasks/manager.js';

// Step 1: Intake — validate input, generate slug + date
const intake = createStep({
    id: 'intake',
    description: 'Validate input and generate file naming metadata',
    inputSchema: z.object({
        idea: z.string().describe('Product idea or feature description'),
        context: z.string().optional().describe('Additional context'),
    }),
    outputSchema: z.object({
        prompt: z.string(),
    }),
    execute: async ({ inputData }) => {
        const date = new Date().toISOString().split('T')[0];
        const slug = inputData.idea
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 50);

        const prompt = [
            `Explore this codebase to understand its structure, patterns, and relevant existing code.`,
            `The goal is to gather context for planning this feature:`,
            ``,
            `**Idea:** ${inputData.idea}`,
            inputData.context ? `**Context:** ${inputData.context}` : '',
            ``,
            `Provide a structured summary of:`,
            `1. Project structure and key files`,
            `2. Existing patterns and conventions`,
            `3. Related code that would be affected`,
            `4. Technical constraints or considerations`,
            ``,
            `Metadata for file naming: date=${date}, slug=${slug}`,
        ]
            .filter(Boolean)
            .join('\n');

        return { prompt };
    },
});

// Step 2: Discovery — wraps discovery agent (registered at runtime via createStep(agent))
// This is created dynamically in the workflow registration since we need the agent instance.
// We use a placeholder step here and wire it up in the Mastra index.

// Step 3: Spec generation step
const specGeneration = createStep({
    id: 'spec-generation',
    description: 'Generate a full technical spec from discovery findings',
    inputSchema: z.object({
        text: z.string(),
    }),
    outputSchema: z.object({
        prompt: z.string(),
    }),
    execute: async (params) => {
        const initData = params.getInitData<{
            idea: string;
            context?: string;
        }>();

        const prompt = [
            `Based on the codebase analysis, generate a detailed technical specification.`,
            ``,
            `**Feature:** ${initData.idea}`,
            initData.context ? `**Context:** ${initData.context}` : '',
            ``,
            `Previous analysis findings:`,
            params.inputData.text,
            ``,
            `Generate a complete spec in this format:`,
            ``,
            `# <Feature Name>`,
            `## Problem`,
            `## Solution`,
            `## User Stories`,
            `## Technical Design`,
            `### Data Models`,
            `### API Contracts`,
            `### File Changes (create/modify/delete)`,
            `### Dependencies`,
            `## Acceptance Criteria`,
            `## Out of Scope`,
            `## Risks`,
        ]
            .filter(Boolean)
            .join('\n');

        return { prompt };
    },
});

// Step 4: Write spec to disk + suspend for approval
const specApproval = createStep({
    id: 'spec-approval',
    description: 'Write spec to disk and wait for user approval',
    inputSchema: z.object({
        text: z.string(),
    }),
    resumeSchema: z.object({
        approved: z.boolean(),
        feedback: z.string().optional(),
    }),
    outputSchema: z.object({
        specPath: z.string(),
        specContent: z.string(),
        approved: z.boolean(),
    }),
    execute: async (params) => {
        const initData = params.getInitData<{ idea: string }>();
        const date = new Date().toISOString().split('T')[0];
        const slug = initData.idea
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 50);
        const specPath = `docs/specs/${date}-${slug}.md`;

        // Write spec file
        const dir = dirname(specPath);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
        writeFileSync(specPath, params.inputData.text);

        if (!params.resumeData?.approved) {
            await params.suspend({
                specPath,
                message: `Spec written to ${specPath}. Review and approve or reject with feedback.`,
            });
        }

        return {
            specPath,
            specContent: params.inputData.text,
            approved: true,
        };
    },
});

// Step 5: Task breakdown
const taskBreakdown = createStep({
    id: 'task-breakdown',
    description: 'Break approved spec into implementation tasks',
    inputSchema: z.object({
        specPath: z.string(),
        specContent: z.string(),
        approved: z.boolean(),
    }),
    outputSchema: z.object({
        prompt: z.string(),
    }),
    execute: async ({ inputData }) => {
        const prompt = [
            `Break this approved spec into ordered implementation tasks.`,
            ``,
            `Spec location: ${inputData.specPath}`,
            ``,
            `Spec content:`,
            inputData.specContent,
            ``,
            `For each task provide:`,
            `- Title (short, actionable)`,
            `- Description (detailed enough for an agent to execute)`,
            `- Type: "discovery" or "implementation"`,
            `- Dependencies (which tasks must complete first)`,
            `- Acceptance criteria`,
            ``,
            `Order tasks by dependency. Output as a numbered list.`,
        ].join('\n');

        return { prompt };
    },
});

// Step 6: Write task plan + suspend for approval
const taskApproval = createStep({
    id: 'task-approval',
    description: 'Write task plan to disk and wait for user approval',
    inputSchema: z.object({
        text: z.string(),
    }),
    resumeSchema: z.object({
        approved: z.boolean(),
        feedback: z.string().optional(),
    }),
    outputSchema: z.object({
        planContent: z.string(),
        approved: z.boolean(),
    }),
    execute: async (params) => {
        const initData = params.getInitData<{ idea: string }>();
        const specResult = params.getStepResult<{
            specPath: string;
            specContent: string;
            approved: boolean;
        }>('spec-approval');
        const date = new Date().toISOString().split('T')[0];
        const slug = initData.idea
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 50);
        const planPath = `docs/specs/${date}-${slug}-tasks.md`;

        // Write task plan file
        const dir = dirname(planPath);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
        writeFileSync(planPath, params.inputData.text);

        if (!params.resumeData?.approved) {
            await params.suspend({
                planPath,
                specPath: specResult.specPath,
                message: `Task plan written to ${planPath}. Review and approve to begin execution.`,
            });
        }

        return {
            planContent: params.inputData.text,
            approved: true,
        };
    },
});

// Step 7: Execution — submit tasks to coordinator
const execution = createStep({
    id: 'execution',
    description: 'Submit approved tasks to the coordinator for execution',
    inputSchema: z.object({
        planContent: z.string(),
        approved: z.boolean(),
    }),
    outputSchema: z.object({
        rootTaskId: z.string(),
        message: z.string(),
    }),
    execute: async (params) => {
        const initData = params.getInitData<{ idea: string }>();

        // Create root task
        const rootTask = taskManager.submitRootTask(
            initData.idea,
            params.inputData.planContent,
        );

        // Trigger coordinator
        const coordinator = params.mastra.getAgent('coordinator');
        if (coordinator) {
            coordinator
                .generate(
                    `Execute the following implementation plan:\n\n${params.inputData.planContent}\n\nRoot task ID: ${rootTask.id}`,
                    {
                        memory: {
                            resource: 'project',
                            thread: `task-${rootTask.id}`,
                        },
                    },
                )
                .catch((err: unknown) => {
                    const message =
                        err instanceof Error ? err.message : String(err);
                    console.error(
                        `Coordinator error on task ${rootTask.id}:`,
                        message,
                    );
                    taskManager.failTask(rootTask.id, message);
                });
        }

        return {
            rootTaskId: rootTask.id,
            message: `Execution started. Monitor at /tasks/${rootTask.id}`,
        };
    },
});

// Export steps for agent wiring in mastra/index.ts
export {
    intake,
    specGeneration,
    specApproval,
    taskBreakdown,
    taskApproval,
    execution,
};

// Workflow factory — needs agent instances from mastra/index.ts
export function createPlanningWorkflow(
    discoveryAgent: import('@mastra/core/agent').Agent,
    plannerAgent: import('@mastra/core/agent').Agent,
) {
    const discoveryStep = createStep(discoveryAgent);
    const plannerSpecStep = createStep(plannerAgent);
    const plannerTaskStep = createStep(plannerAgent);

    return createWorkflow({
        id: 'planning',
        description:
            'Product planning workflow: idea → discovery → spec → approval → task breakdown → approval → execution',
        inputSchema: z.object({
            idea: z.string().describe('Product idea or feature description'),
            context: z.string().optional().describe('Additional context'),
        }),
        outputSchema: z.object({
            rootTaskId: z.string(),
            message: z.string(),
        }),
    })
        .then(intake)
        .then(discoveryStep)
        .then(specGeneration)
        .then(plannerSpecStep)
        .then(specApproval)
        .then(taskBreakdown)
        .then(plannerTaskStep)
        .then(taskApproval)
        .then(execution)
        .commit();
}
