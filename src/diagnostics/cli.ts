/**
 * Diagnostics CLI
 * 诊断工具命令行入口
 *
 * Commands:
 * - scan
 * - validate
 * - analyze
 * - report
 */

import minimist from 'minimist';
import * as path from 'path';
import { ArchitectureScanner } from './scanners/ArchitectureScanner.ts';
import { InterfaceValidator } from './validators/InterfaceValidator.ts';
import { MigrationAnalyzer } from './analyzers/MigrationAnalyzer.ts';
import { ReportGenerator } from './reporters/ReportGenerator.ts';
import { ApiCompatibilityChecker } from './validators/ApiCompatibilityChecker.ts';
import { diagnosticsOutput } from './utils/output';

const logProgress = (message: string) => {
    diagnosticsOutput.info(`[Diagnostics CLI] ${message}`);
};

const parseArgs = () => {
    const args = minimist(process.argv.slice(2));
    return {
        command: args._[0],
        rootDir: args.root ? path.resolve(args.root) : process.cwd(),
        output: args.output ? path.resolve(args.output) : undefined,
        compatOutput: args['compat-output'] ? path.resolve(args['compat-output']) : undefined,
    };
};

async function run() {
    const { command, rootDir, output, compatOutput } = parseArgs();

    if (!command) {
        diagnosticsOutput.error('Usage: diagnostics <scan|validate|analyze|report> [--root <path>] [--output <path>]');
        process.exit(1);
    }

    const scanner = new ArchitectureScanner();
    const validator = new InterfaceValidator();
    const analyzer = new MigrationAnalyzer();
    const reporter = new ReportGenerator();
    const compatibilityChecker = new ApiCompatibilityChecker();

    switch (command) {
        case 'scan': {
            logProgress('Starting architecture scan...');
            const scanResult = await scanner.scan(rootDir);
            diagnosticsOutput.printJson(scanResult);
            break;
        }

        case 'validate': {
            logProgress('Running interface validation...');
            const validationResult = await validator.validateAllQueues(rootDir);
            diagnosticsOutput.printJson(validationResult);

            logProgress('Running API compatibility check...');
            const compatResult = compatibilityChecker.checkCompatibility(rootDir);
            diagnosticsOutput.printJson(compatResult);

            if (compatOutput) {
                const report = compatibilityChecker.generateCompatibilityReport(compatResult);
                compatibilityChecker.saveCompatibilityReport(report, compatOutput);
            }
            break;
        }

        case 'analyze': {
            logProgress('Scanning architecture for migration analysis...');
            const scanResult = await scanner.scan(rootDir);
            logProgress('Analyzing migration path...');
            const migrationPlan = await analyzer.analyzeMigrationPath(scanResult);
            diagnosticsOutput.printJson(migrationPlan);
            break;
        }

        case 'report': {
            logProgress('Generating diagnostic report...');
            const scanResult = await scanner.scan(rootDir);
            const validationResult = await validator.validateAllQueues(rootDir);
            const migrationPlan = await analyzer.analyzeMigrationPath(scanResult);

            const report = reporter.generateDiagnosticReport(
                scanResult,
                validationResult,
                migrationPlan
            );

            const reportPath =
                output ?? path.join(rootDir, 'QUEUE_ARCHITECTURE_DIAGNOSTIC_REPORT.md');
            reporter.saveReport(report, reportPath);

            const architectureDoc = reporter.generateArchitectureDoc(scanResult, migrationPlan);
            reporter.saveArchitectureDoc(architectureDoc, rootDir);

            const compatResult = compatibilityChecker.checkCompatibility(rootDir);
            const compatReport = compatibilityChecker.generateCompatibilityReport(compatResult);
            const compatPath =
                compatOutput ?? path.join(rootDir, 'QUEUE_API_COMPATIBILITY_REPORT.md');
            compatibilityChecker.saveCompatibilityReport(compatReport, compatPath);

            break;
        }

        default:
            diagnosticsOutput.error(`Unknown command: ${command}`);
            process.exit(1);
    }
}

run().catch(error => {
    diagnosticsOutput.error('[Diagnostics CLI] Failed:', error);
    process.exit(1);
});
