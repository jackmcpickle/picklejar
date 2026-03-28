import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultConfig } from './defaults.js';
import { picklejarConfigSchema, type PicklejarConfig } from './schema.js';

let _config: PicklejarConfig | null = null;

export function loadConfig(configPath?: string): PicklejarConfig {
    const filePath = resolve(configPath ?? 'picklejar.config.json');

    if (!existsSync(filePath)) {
        console.warn(`Config file not found at ${filePath}, using defaults`);
        _config = defaultConfig;
        return _config;
    }

    const raw: unknown = JSON.parse(readFileSync(filePath, 'utf-8'));
    const result = picklejarConfigSchema.safeParse(raw);

    if (!result.success) {
        const errors = result.error.issues
            .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
            .join('\n');
        throw new Error(`Invalid picklejar config:\n${errors}`);
    }

    _config = result.data;
    return _config;
}

export function getConfig(): PicklejarConfig {
    if (!_config) {
        return loadConfig();
    }
    return _config;
}

/** Reset config state (for testing) */
export function resetConfig(): void {
    _config = null;
}
