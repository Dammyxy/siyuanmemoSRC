type OutputSink = (message: string) => void;

export function formatDiagnosticsOutputPart(part: unknown): string {
    if (typeof part === 'string') {
        return part;
    }
    if (part instanceof Error) {
        return part.stack || part.message;
    }

    try {
        return JSON.stringify(part, null, 2);
    } catch {
        return String(part);
    }
}

function writeLine(sink: OutputSink, parts: unknown[]): void {
    const content = parts.map(formatDiagnosticsOutputPart).join(' ');
    sink(`${content}\n`);
}

const stdoutSink: OutputSink = (message: string) => {
    process.stdout.write(message);
};

const stderrSink: OutputSink = (message: string) => {
    process.stderr.write(message);
};

export interface DiagnosticsOutputPort {
    info(...parts: unknown[]): void;
    warn(...parts: unknown[]): void;
    error(...parts: unknown[]): void;
    printJson(payload: unknown): void;
}

export class NodeDiagnosticsOutput implements DiagnosticsOutputPort {
    info(...parts: unknown[]): void {
        writeLine(stdoutSink, parts);
    }

    warn(...parts: unknown[]): void {
        writeLine(stderrSink, parts);
    }

    error(...parts: unknown[]): void {
        writeLine(stderrSink, parts);
    }

    printJson(payload: unknown): void {
        writeLine(stdoutSink, [formatDiagnosticsOutputPart(payload)]);
    }
}

export const diagnosticsOutput: DiagnosticsOutputPort = new NodeDiagnosticsOutput();
