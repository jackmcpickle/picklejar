import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { defaultConfig } from '../src/config/defaults.js';
import { resetConfig } from '../src/config/loader.js';
import { createPicklejar } from '../src/index.js';

let tmpDir: string;
let originalCwd: string;

beforeEach(() => {
    resetConfig();
    tmpDir = mkdtempSync(join(tmpdir(), 'picklejar-index-test-'));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
});

afterEach(() => {
    process.chdir(originalCwd);
    resetConfig();
    rmSync(tmpDir, { recursive: true, force: true });
});

describe('createPicklejar', () => {
    it('returns all expected properties', () => {
        const pj = createPicklejar();
        expect(pj).toHaveProperty('mastra');
        expect(pj).toHaveProperty('config');
        expect(pj).toHaveProperty('coordinator');
        expect(pj).toHaveProperty('discoveryAgents');
        expect(pj).toHaveProperty('implementationAgents');
    });

    it('coordinator is registered in mastra agents', () => {
        const pj = createPicklejar();
        const agent = pj.mastra.getAgent('coordinator');
        expect(agent).toBeDefined();
    });

    it('all discovery agents are registered', () => {
        const pj = createPicklejar();
        for (const da of pj.discoveryAgents) {
            const agent = pj.mastra.getAgent(da.name);
            expect(agent).toBeDefined();
        }
    });

    it('all implementation agents are registered', () => {
        const pj = createPicklejar();
        for (const ia of pj.implementationAgents) {
            const agent = pj.mastra.getAgent(ia.name);
            expect(agent).toBeDefined();
        }
    });

    it('uses default config when no path provided', () => {
        const pj = createPicklejar();
        expect(pj.config.agents.coordinator.model).toBe(
            defaultConfig.agents.coordinator.model,
        );
    });

    it('loads config from provided path', () => {
        const customConfig = {
            ...defaultConfig,
            server: { port: 5555 },
        };
        const configPath = join(tmpDir, 'custom.json');
        writeFileSync(configPath, JSON.stringify(customConfig));

        const pj = createPicklejar(configPath);
        expect(pj.config.server.port).toBe(5555);
    });

    it('creates correct number of discovery agents', () => {
        const pj = createPicklejar();
        expect(pj.discoveryAgents).toHaveLength(
            defaultConfig.agents.discovery.count,
        );
    });

    it('creates correct number of implementation agents', () => {
        const pj = createPicklejar();
        expect(pj.implementationAgents).toHaveLength(
            defaultConfig.agents.implementation.count,
        );
    });
});
