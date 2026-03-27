import { createTool } from '@mastra/core/tools';
import { execa } from 'execa';
import { z } from 'zod';

/**
 * Checks if RTK (Rust Token Killer) is available on the system.
 * RTK compresses CLI output by 60-90%, saving agent context window tokens.
 * See: https://github.com/rtk-ai/rtk
 */
async function isRtkAvailable(): Promise<boolean> {
    try {
        await execa('rtk', ['--version']);
        return true;
    } catch {
        return false;
    }
}

let _rtkAvailable: boolean | null = null;

async function getRtkAvailable(): Promise<boolean> {
    _rtkAvailable ??= await isRtkAvailable();
    return _rtkAvailable;
}

export const executeCommand = createTool({
    id: 'execute-command',
    description:
        'Execute a shell command. Output is piped through RTK for token optimization when available.',
    inputSchema: z.object({
        command: z.string().describe('Shell command to execute'),
        cwd: z.string().optional().describe('Working directory'),
        timeout: z
            .number()
            .int()
            .min(1000)
            .max(600000)
            .optional()
            .describe('Timeout in ms (max 10min)'),
    }),
    outputSchema: z.object({
        stdout: z.string(),
        stderr: z.string(),
        exitCode: z.number(),
    }),
    execute: async ({ command, cwd, timeout }) => {
        const useRtk = await getRtkAvailable();

        const result = useRtk
            ? await execa('rtk', ['exec', '--', 'sh', '-c', command], {
                  cwd,
                  timeout: timeout ?? 120000,
                  reject: false,
              })
            : await execa('sh', ['-c', command], {
                  cwd,
                  timeout: timeout ?? 120000,
                  reject: false,
              });

        return {
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode ?? 1,
        };
    },
});
