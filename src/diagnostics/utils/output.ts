type OutputSink = (message: string) => void;

function serializePart(part: unknown): string {
    if (typeof part === 'string') {
        return part;
    }

    try {
        return JSON.stringify(part, null, 2);
    } catch {
        return String(part);
    }
}

function writeLine(sink: OutputSink, parts: unknown[]): void {
    const content = parts.map(serializePart).join(' ');
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
        writeLine(stdoutSink, [serializePart(payload)]);
    }
}

export const diagnosticsOutput: DiagnosticsOutputPort = new NodeDiagnosticsOutput();
