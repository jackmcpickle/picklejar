#!/usr/bin/env node

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Command } from 'commander';
import { execa } from 'execa';
import pc from 'picocolors';
import { defaultConfig } from './config/defaults.js';

const program = new Command()
    .name('picklejar')
    .description('AI coding agent orchestration tool powered by Mastra AI')
    .version('0.1.0');

program
    .command('start')
    .description('Launch picklejar server with Mastra Studio')
    .option('-p, --port <number>', 'Server port', '4111')
    .option('-c, --config <path>', 'Config file path', 'picklejar.config.json')
    .action(async (opts: { port: string; config: string }) => {
        console.log(
            pc.bold(pc.green('\n🥒 Picklejar - AI Agent Orchestration\n')),
        );

        // Load config
        const { createPicklejar } = await import('./index.js');
        const { config } = createPicklejar(opts.config);

        console.log(
            pc.dim(`  Coordinator model: ${config.agents.coordinator.model}`),
        );
        console.log(
            pc.dim(
                `  Discovery agents:  ${config.agents.discovery.count}x ${config.agents.discovery.model}`,
            ),
        );
        console.log(
            pc.dim(
                `  Impl agents:       ${config.agents.implementation.count}x ${config.agents.implementation.model}`,
            ),
        );
        console.log();

        // Start mastra dev server
        console.log(pc.bold(`  Starting server on port ${opts.port}...`));
        console.log(pc.cyan(`  Studio:  http://localhost:${opts.port}`));
        console.log(
            pc.cyan(`  Swagger: http://localhost:${opts.port}/swagger-ui`),
        );
        console.log(
            pc.cyan(`  Tasks:   http://localhost:${opts.port}/tasks/list`),
        );
        console.log();

        const devProcess = execa(
            'npx',
            ['mastra', 'dev', '--port', opts.port],
            {
                stdio: 'inherit',
                env: { ...process.env },
            },
        );

        process.on('SIGINT', () => {
            devProcess.kill();
            process.exit(0);
        });

        await devProcess;
    });

program
    .command('task <description>')
    .description('Submit a coding task to the coordinator')
    .option('-p, --port <number>', 'Server port', '4111')
    .action(async (description: string, opts: { port: string }) => {
        const url = `http://localhost:${opts.port}/tasks`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: description, description }),
            });

            if (!response.ok) {
                console.error(
                    pc.red(`Failed to submit task: ${response.statusText}`),
                );
                process.exit(1);
            }

            const task = (await response.json()) as {
                id: string;
                title: string;
                status: string;
            };
            console.log(pc.green(`Task submitted: ${task.id}`));
            console.log(pc.dim(`  Title: ${task.title}`));
            console.log(pc.dim(`  Status: ${task.status}`));
            console.log(
                pc.dim(
                    `\n  Stream progress: curl http://localhost:${opts.port}/tasks/${task.id}/stream`,
                ),
            );
        } catch {
            console.error(
                pc.red('Could not connect to picklejar server. Is it running?'),
            );
            console.error(pc.dim('  Start it with: picklejar start'));
            process.exit(1);
        }
    });

program
    .command('status')
    .description('Show status of all tasks')
    .option('-p, --port <number>', 'Server port', '4111')
    .action(async (opts: { port: string }) => {
        try {
            const response = await fetch(
                `http://localhost:${opts.port}/tasks/list`,
            );
            if (!response.ok) throw new Error(response.statusText);

            const { tasks } = (await response.json()) as {
                tasks: Array<{
                    id: string;
                    title: string;
                    status: string;
                    type: string;
                }>;
            };

            if (tasks.length === 0) {
                console.log(
                    pc.dim(
                        'No tasks yet. Submit one with: picklejar task "your task description"',
                    ),
                );
                return;
            }

            console.log(pc.bold('\nTasks:\n'));
            for (const task of tasks) {
                const statusColor =
                    task.status === 'completed'
                        ? pc.green
                        : task.status === 'failed'
                          ? pc.red
                          : task.status === 'active'
                            ? pc.yellow
                            : pc.dim;

                console.log(
                    `  ${task.id} ${statusColor(`[${task.status}]`)} ${task.title} ${pc.dim(`(${task.type})`)}`,
                );
            }
            console.log();
        } catch {
            console.error(
                pc.red('Could not connect to picklejar server. Is it running?'),
            );
            process.exit(1);
        }
    });

// Plan commands
const plan = program.command('plan').description('Product planning workflow');

plan.command('start <idea>')
    .description('Start a planning workflow for a product idea')
    .option('-p, --port <number>', 'Server port', '4111')
    .option('-c, --context <text>', 'Additional context')
    .action(async (idea: string, opts: { port: string; context?: string }) => {
        try {
            const response = await fetch(
                `http://localhost:${opts.port}/api/workflows/planning/start`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        inputData: { idea, context: opts.context },
                    }),
                },
            );

            if (!response.ok) {
                console.error(
                    pc.red(`Failed to start planning: ${response.statusText}`),
                );
                process.exit(1);
            }

            const result = (await response.json()) as {
                runId: string;
            };
            console.log(pc.green(`Planning started: ${result.runId}`));
            console.log(
                pc.dim(`  Check status: picklejar plan status ${result.runId}`),
            );
        } catch {
            console.error(
                pc.red('Could not connect to server. Is it running?'),
            );
            process.exit(1);
        }
    });

plan.command('status <runId>')
    .description('Check planning workflow status')
    .option('-p, --port <number>', 'Server port', '4111')
    .action(async (runId: string, opts: { port: string }) => {
        try {
            const response = await fetch(
                `http://localhost:${opts.port}/api/workflows/planning/runs/${runId}`,
            );
            if (!response.ok) throw new Error(response.statusText);

            const result = (await response.json()) as {
                status: string;
                steps: Record<string, { status: string; output?: unknown }>;
            };

            console.log(pc.bold(`\nWorkflow: ${runId}`));
            console.log(`  Status: ${result.status}`);

            if (result.steps) {
                console.log(pc.bold('\n  Steps:'));
                for (const [name, step] of Object.entries(result.steps)) {
                    const color =
                        step.status === 'success'
                            ? pc.green
                            : step.status === 'failed'
                              ? pc.red
                              : step.status === 'suspended'
                                ? pc.yellow
                                : pc.dim;
                    console.log(`    ${color(`[${step.status}]`)} ${name}`);
                }
            }
            console.log();
        } catch {
            console.error(pc.red('Could not fetch workflow status.'));
            process.exit(1);
        }
    });

plan.command('approve <runId>')
    .description('Approve current suspended step')
    .option('-p, --port <number>', 'Server port', '4111')
    .action(async (runId: string, opts: { port: string }) => {
        try {
            const response = await fetch(
                `http://localhost:${opts.port}/api/workflows/planning/runs/${runId}/resume`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        resumeData: { approved: true },
                    }),
                },
            );

            if (!response.ok) {
                console.error(
                    pc.red(`Failed to approve: ${response.statusText}`),
                );
                process.exit(1);
            }

            console.log(pc.green('Approved. Workflow resuming...'));
        } catch {
            console.error(pc.red('Could not connect to server.'));
            process.exit(1);
        }
    });

plan.command('reject <runId>')
    .description('Reject current step with feedback')
    .option('-p, --port <number>', 'Server port', '4111')
    .requiredOption('-f, --feedback <text>', 'Feedback for revision')
    .action(async (runId: string, opts: { port: string; feedback: string }) => {
        try {
            const response = await fetch(
                `http://localhost:${opts.port}/api/workflows/planning/runs/${runId}/resume`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        resumeData: {
                            approved: false,
                            feedback: opts.feedback,
                        },
                    }),
                },
            );

            if (!response.ok) {
                console.error(
                    pc.red(`Failed to reject: ${response.statusText}`),
                );
                process.exit(1);
            }

            console.log(
                pc.yellow('Rejected with feedback. Workflow will revise...'),
            );
        } catch {
            console.error(pc.red('Could not connect to server.'));
            process.exit(1);
        }
    });

plan.command('list')
    .description('List all planning workflow runs')
    .option('-p, --port <number>', 'Server port', '4111')
    .action(async (opts: { port: string }) => {
        try {
            const response = await fetch(
                `http://localhost:${opts.port}/api/workflows/planning/runs`,
            );
            if (!response.ok) throw new Error(response.statusText);

            const { runs } = (await response.json()) as {
                runs: Array<{
                    runId: string;
                    status: string;
                    createdAt: string;
                }>;
            };

            if (!runs || runs.length === 0) {
                console.log(
                    pc.dim(
                        'No planning runs yet. Start one with: picklejar plan start "your idea"',
                    ),
                );
                return;
            }

            console.log(pc.bold('\nPlanning Runs:\n'));
            for (const run of runs) {
                const color =
                    run.status === 'success'
                        ? pc.green
                        : run.status === 'suspended'
                          ? pc.yellow
                          : run.status === 'failed'
                            ? pc.red
                            : pc.dim;
                console.log(`  ${run.runId} ${color(`[${run.status}]`)}`);
            }
            console.log();
        } catch {
            console.error(pc.red('Could not connect to server.'));
            process.exit(1);
        }
    });

program
    .command('init')
    .description('Initialize a new picklejar project')
    .action(async () => {
        console.log(pc.bold(pc.green('\n🥒 Initializing Picklejar\n')));

        // Write default config
        const configPath = resolve('picklejar.config.json');
        if (existsSync(configPath)) {
            console.log(pc.dim('  picklejar.config.json already exists'));
        } else {
            writeFileSync(
                configPath,
                JSON.stringify(
                    {
                        $schema: './picklejar.config.schema.json',
                        ...defaultConfig,
                    },
                    null,
                    2,
                ),
            );
            console.log(pc.green('  Created picklejar.config.json'));
        }

        // Write .env.example
        const envPath = resolve('.env.example');
        if (!existsSync(envPath)) {
            writeFileSync(
                envPath,
                [
                    '# Picklejar API Keys',
                    'ANTHROPIC_API_KEY=',
                    'OPENAI_API_KEY=',
                    '# Optional',
                    'GOOGLE_API_KEY=',
                    'OPENROUTER_API_KEY=',
                ].join('\n'),
            );
            console.log(pc.green('  Created .env.example'));
        }

        // Create .mastra directory
        const mastraDir = resolve('.mastra');
        if (!existsSync(mastraDir)) {
            mkdirSync(mastraDir, { recursive: true });
            console.log(pc.green('  Created .mastra/ directory'));
        }

        console.log(pc.bold('\n  Next steps:'));
        console.log(
            pc.dim('  1. Copy .env.example to .env and add your API keys'),
        );
        console.log(
            pc.dim('  2. Edit picklejar.config.json to customize agent models'),
        );
        console.log(pc.dim('  3. Run: picklejar start'));
        console.log();
    });

program.parse();
