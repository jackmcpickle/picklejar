import { Workspace } from '@mastra/core/workspace';
import { LocalFilesystem } from '@mastra/core/workspace';
import { LocalSandbox } from '@mastra/core/workspace';

export function createReadOnlyWorkspace(basePath = '.') {
    return new Workspace({
        filesystem: new LocalFilesystem({
            basePath,
            contained: false,
            readOnly: true,
        }),
        tools: {
            mastra_workspace_write_file: { enabled: false },
            mastra_workspace_edit_file: { enabled: false },
            mastra_workspace_delete: { enabled: false },
            mastra_workspace_mkdir: { enabled: false },
            mastra_workspace_execute_command: { enabled: false },
        },
    });
}

export function createFullWorkspace(basePath = '.') {
    return new Workspace({
        filesystem: new LocalFilesystem({
            basePath,
            contained: false,
        }),
        sandbox: new LocalSandbox({
            workingDirectory: basePath,
        }),
    });
}
