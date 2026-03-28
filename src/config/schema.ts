import { z } from 'zod';

const agentConfigSchema = z.object({
    model: z
        .string()
        .regex(
            /^[\w-]+\/[\w.-]+$/,
            'Model must be in provider/model-name format',
        ),
    maxSteps: z.number().int().min(1).max(200).default(50),
});

const discoveryConfigSchema = agentConfigSchema.extend({
    count: z.number().int().min(1).max(3).default(2),
    maxSteps: z.number().int().min(1).max(100).default(30),
});

const implementationConfigSchema = agentConfigSchema.extend({
    count: z.number().int().min(1).max(5).default(3),
    maxSteps: z.number().int().min(1).max(100).default(40),
});

const providerConfigSchema = z.object({
    apiKeyEnv: z.string().optional(),
    baseUrl: z.url().optional(),
});

export const picklejarConfigSchema = z.object({
    $schema: z.string().optional(),
    agents: z.object({
        coordinator: agentConfigSchema,
        planner: agentConfigSchema
            .extend({
                maxSteps: z.number().int().min(1).max(100).default(30),
            })
            .default({
                model: 'anthropic/claude-opus-4-6',
                maxSteps: 30,
            }),
        discovery: discoveryConfigSchema,
        implementation: implementationConfigSchema,
    }),
    providers: z.record(z.string(), providerConfigSchema).default({}),
    memory: z
        .object({
            storage: z.enum(['libsql', 'postgres']).default('libsql'),
            observationalMemory: z.boolean().default(true),
        })
        .default({ storage: 'libsql', observationalMemory: true }),
    server: z
        .object({
            port: z.number().int().min(1024).max(65535).default(4111),
        })
        .default({ port: 4111 }),
});

export type PicklejarConfig = z.infer<typeof picklejarConfigSchema>;
