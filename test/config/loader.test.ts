import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { defaultConfig } from '../../src/config/defaults.js';
import { loadConfig, getConfig, resetConfig } from '../../src/config/loader.js';
import { picklejarConfigSchema } from '../../src/config/schema.js';

const validConfig = {
    agents: {
        coordinator: { model: 'anthropic/claude-opus-4-6', maxSteps: 50 },
        discovery: {
            model: 'anthropic/claude-sonnet-4-6',
            count: 2,
            maxSteps: 30,
        },
        implementation: { model: 'openai/o3', count: 3, maxSteps: 40 },
    },
    providers: {
        anthropic: { apiKeyEnv: 'ANTHROPIC_API_KEY' },
    },
    memory: { storage: 'libsql' as const, observationalMemory: true },
    server: { port: 4111 },
};

function writeConfig(
    dir: string,
    data: unknown,
    filename = 'picklejar.config.json',
): string {
    const path = join(dir, filename);
    writeFileSync(path, JSON.stringify(data));
    return path;
}

describe('loadConfig', () => {
    let tmpDir: string;

    beforeEach(() => {
        resetConfig();
        tmpDir = mkdtempSync(join(tmpdir(), 'picklejar-test-'));
    });

    afterEach(() => {
        resetConfig();
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it('loads valid config from file', () => {
        const path = writeConfig(tmpDir, validConfig);
        const config = loadConfig(path);

        expect(config.agents.coordinator.model).toBe(
            'anthropic/claude-opus-4-6',
        );
        expect(config.agents.discovery.count).toBe(2);
        expect(config.agents.implementation.count).toBe(3);
        expect(config.server.port).toBe(4111);
    });

    it('returns defaults when file does not exist', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const config = loadConfig(join(tmpDir, 'nonexistent.json'));

        expect(config).toEqual(defaultConfig);
        expect(warnSpy).toHaveBeenCalledOnce();
        warnSpy.mockRestore();
    });

    it('throws on invalid JSON', () => {
        const path = join(tmpDir, 'bad.json');
        writeFileSync(path, '{ broken json !!!');

        expect(() => loadConfig(path)).toThrow();
    });

    it('throws on schema-invalid config - bad model format', () => {
        const bad = {
            ...validConfig,
            agents: {
                ...validConfig.agents,
                coordinator: { model: 'no-slash-here', maxSteps: 50 },
            },
        };
        const path = writeConfig(tmpDir, bad);

        expect(() => loadConfig(path)).toThrow('Invalid picklejar config');
    });

    it('throws on schema-invalid config - count out of range', () => {
        const bad = {
            ...validConfig,
            agents: {
                ...validConfig.agents,
                discovery: {
                    model: 'anthropic/claude-sonnet-4-6',
                    count: 99,
                    maxSteps: 30,
                },
            },
        };
        const path = writeConfig(tmpDir, bad);

        expect(() => loadConfig(path)).toThrow('Invalid picklejar config');
    });

    it('throws on schema-invalid config - maxSteps exceeds limit', () => {
        const bad = {
            ...validConfig,
            agents: {
                ...validConfig.agents,
                coordinator: {
                    model: 'anthropic/claude-opus-4-6',
                    maxSteps: 999,
                },
            },
        };
        const path = writeConfig(tmpDir, bad);

        expect(() => loadConfig(path)).toThrow('Invalid picklejar config');
    });

    it('throws on schema-invalid config - invalid storage type', () => {
        const bad = {
            ...validConfig,
            memory: { storage: 'mysql', observationalMemory: true },
        };
        const path = writeConfig(tmpDir, bad);

        expect(() => loadConfig(path)).toThrow('Invalid picklejar config');
    });

    it('throws on schema-invalid config - port out of range', () => {
        const bad = {
            ...validConfig,
            server: { port: 80 },
        };
        const path = writeConfig(tmpDir, bad);

        expect(() => loadConfig(path)).toThrow('Invalid picklejar config');
    });

    it('applies defaults for omitted optional fields', () => {
        const minimal = {
            agents: {
                coordinator: { model: 'anthropic/claude-opus-4-6' },
                discovery: { model: 'anthropic/claude-sonnet-4-6' },
                implementation: { model: 'openai/o3' },
            },
        };
        const path = writeConfig(tmpDir, minimal);
        const config = loadConfig(path);

        expect(config.agents.coordinator.maxSteps).toBe(50);
        expect(config.agents.discovery.maxSteps).toBe(30);
        expect(config.agents.discovery.count).toBe(2);
        expect(config.agents.implementation.maxSteps).toBe(40);
        expect(config.agents.implementation.count).toBe(3);
        expect(config.providers).toEqual({});
        expect(config.memory.storage).toBe('libsql');
        expect(config.memory.observationalMemory).toBe(true);
        expect(config.server.port).toBe(4111);
    });

    it('preserves $schema field', () => {
        const withSchema = {
            $schema: './picklejar.config.schema.json',
            ...validConfig,
        };
        const path = writeConfig(tmpDir, withSchema);
        const config = loadConfig(path);

        expect(config.$schema).toBe('./picklejar.config.schema.json');
    });
});

describe('getConfig', () => {
    let tmpDir: string;

    beforeEach(() => {
        resetConfig();
        tmpDir = mkdtempSync(join(tmpdir(), 'picklejar-test-'));
    });

    afterEach(() => {
        resetConfig();
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it('returns loaded config after loadConfig', () => {
        const path = writeConfig(tmpDir, validConfig);
        loadConfig(path);
        const config = getConfig();

        expect(config.agents.coordinator.model).toBe(
            'anthropic/claude-opus-4-6',
        );
    });

    it('auto-loads when called without prior loadConfig', () => {
        const config = getConfig();

        expect(config.agents.coordinator).toBeDefined();
        expect(config.agents.discovery).toBeDefined();
        expect(config.agents.implementation).toBeDefined();
    });
});

describe('resetConfig', () => {
    let tmpDir: string;

    beforeEach(() => {
        resetConfig();
        tmpDir = mkdtempSync(join(tmpdir(), 'picklejar-test-'));
    });

    afterEach(() => {
        resetConfig();
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it('clears state so getConfig auto-loads again', () => {
        const configA = { ...validConfig, server: { port: 5000 } };
        const configB = { ...validConfig, server: { port: 6000 } };

        const pathA = writeConfig(tmpDir, configA, 'a.json');
        const pathB = writeConfig(tmpDir, configB, 'b.json');

        loadConfig(pathA);
        expect(getConfig().server.port).toBe(5000);

        resetConfig();

        loadConfig(pathB);
        expect(getConfig().server.port).toBe(6000);
    });

    it('causes getConfig to re-resolve default path after reset', () => {
        const path = writeConfig(tmpDir, {
            ...validConfig,
            server: { port: 9999 },
        });
        loadConfig(path);
        expect(getConfig().server.port).toBe(9999);

        resetConfig();

        const config = getConfig();
        expect(config.server.port).not.toBe(9999);
    });
});

describe('picklejarConfigSchema', () => {
    describe('model format validation', () => {
        const validModels = [
            'anthropic/claude-opus-4-6',
            'openai/gpt-4o',
            'google/gemini-2.5-pro',
            'provider/model.v2.1',
            'my-provider/my-model',
        ];

        const invalidModels = [
            'no-slash',
            '/leading-slash',
            'trailing-slash/',
            'has spaces/model',
            'provider/model name',
            '',
        ];

        for (const model of validModels) {
            it(`accepts "${model}"`, () => {
                const input = {
                    ...validConfig,
                    agents: { ...validConfig.agents, coordinator: { model } },
                };
                const result = picklejarConfigSchema.safeParse(input);
                expect(result.success).toBe(true);
            });
        }

        for (const model of invalidModels) {
            it(`rejects "${model}"`, () => {
                const input = {
                    ...validConfig,
                    agents: { ...validConfig.agents, coordinator: { model } },
                };
                const result = picklejarConfigSchema.safeParse(input);
                expect(result.success).toBe(false);
            });
        }
    });

    describe('boundary values', () => {
        it('accepts coordinator maxSteps at boundaries (1, 200)', () => {
            for (const maxSteps of [1, 200]) {
                const input = {
                    ...validConfig,
                    agents: {
                        ...validConfig.agents,
                        coordinator: { model: 'a/b', maxSteps },
                    },
                };
                expect(picklejarConfigSchema.safeParse(input).success).toBe(
                    true,
                );
            }
        });

        it('rejects coordinator maxSteps outside boundaries (0, 201)', () => {
            for (const maxSteps of [0, 201]) {
                const input = {
                    ...validConfig,
                    agents: {
                        ...validConfig.agents,
                        coordinator: { model: 'a/b', maxSteps },
                    },
                };
                expect(picklejarConfigSchema.safeParse(input).success).toBe(
                    false,
                );
            }
        });

        it('accepts discovery count at boundaries (1, 3)', () => {
            for (const count of [1, 3]) {
                const input = {
                    ...validConfig,
                    agents: {
                        ...validConfig.agents,
                        discovery: { model: 'a/b', count },
                    },
                };
                expect(picklejarConfigSchema.safeParse(input).success).toBe(
                    true,
                );
            }
        });

        it('rejects discovery count outside boundaries (0, 4)', () => {
            for (const count of [0, 4]) {
                const input = {
                    ...validConfig,
                    agents: {
                        ...validConfig.agents,
                        discovery: { model: 'a/b', count },
                    },
                };
                expect(picklejarConfigSchema.safeParse(input).success).toBe(
                    false,
                );
            }
        });

        it('accepts implementation count at boundaries (1, 5)', () => {
            for (const count of [1, 5]) {
                const input = {
                    ...validConfig,
                    agents: {
                        ...validConfig.agents,
                        implementation: { model: 'a/b', count },
                    },
                };
                expect(picklejarConfigSchema.safeParse(input).success).toBe(
                    true,
                );
            }
        });

        it('rejects implementation count outside boundaries (0, 6)', () => {
            for (const count of [0, 6]) {
                const input = {
                    ...validConfig,
                    agents: {
                        ...validConfig.agents,
                        implementation: { model: 'a/b', count },
                    },
                };
                expect(picklejarConfigSchema.safeParse(input).success).toBe(
                    false,
                );
            }
        });

        it('accepts discovery maxSteps at boundaries (1, 100)', () => {
            for (const maxSteps of [1, 100]) {
                const input = {
                    ...validConfig,
                    agents: {
                        ...validConfig.agents,
                        discovery: { model: 'a/b', maxSteps },
                    },
                };
                expect(picklejarConfigSchema.safeParse(input).success).toBe(
                    true,
                );
            }
        });

        it('rejects discovery maxSteps outside boundaries (0, 101)', () => {
            for (const maxSteps of [0, 101]) {
                const input = {
                    ...validConfig,
                    agents: {
                        ...validConfig.agents,
                        discovery: { model: 'a/b', maxSteps },
                    },
                };
                expect(picklejarConfigSchema.safeParse(input).success).toBe(
                    false,
                );
            }
        });

        it('accepts port at boundaries (1024, 65535)', () => {
            for (const port of [1024, 65535]) {
                const input = { ...validConfig, server: { port } };
                expect(picklejarConfigSchema.safeParse(input).success).toBe(
                    true,
                );
            }
        });

        it('rejects port outside boundaries (1023, 65536)', () => {
            for (const port of [1023, 65536]) {
                const input = { ...validConfig, server: { port } };
                expect(picklejarConfigSchema.safeParse(input).success).toBe(
                    false,
                );
            }
        });

        it('rejects non-integer maxSteps', () => {
            const input = {
                ...validConfig,
                agents: {
                    ...validConfig.agents,
                    coordinator: { model: 'a/b', maxSteps: 25.5 },
                },
            };
            expect(picklejarConfigSchema.safeParse(input).success).toBe(false);
        });

        it('rejects non-integer port', () => {
            const input = { ...validConfig, server: { port: 4111.5 } };
            expect(picklejarConfigSchema.safeParse(input).success).toBe(false);
        });
    });

    describe('memory storage enum', () => {
        it('accepts libsql', () => {
            const input = { ...validConfig, memory: { storage: 'libsql' } };
            expect(picklejarConfigSchema.safeParse(input).success).toBe(true);
        });

        it('accepts postgres', () => {
            const input = { ...validConfig, memory: { storage: 'postgres' } };
            expect(picklejarConfigSchema.safeParse(input).success).toBe(true);
        });

        it('rejects unknown storage', () => {
            const input = { ...validConfig, memory: { storage: 'sqlite' } };
            expect(picklejarConfigSchema.safeParse(input).success).toBe(false);
        });
    });
});
