import * as vscode from 'vscode';
import * as cp from 'child_process';

const spinner = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
const outputChannel = vscode.window.createOutputChannel('PHPStan');

export function runPhpStan(doc: vscode.TextDocument, diagnostics: vscode.DiagnosticCollection, config: vscode.WorkspaceConfiguration) {
    outputChannel.appendLine('Running Phpstan on: ' + doc.fileName);

    const binaryPath = config.get<string>('binaryPath') || 'phpstan';
    const configPath = config.get<string>('config') || '';
    const extraArgs = config.get<string>('args') || '';
    const errorFormat = config.get<string>('errorFormat') || 'json';
    const command = config.get<string>('command') || `${binaryPath} analyse ${doc.fileName} --error-format=${errorFormat} ${configPath ? '--configuration ' + configPath : ''} ${extraArgs}`;

    outputChannel.appendLine(`[PHPStan] Running command: ${command}`);
    outputChannel.appendLine(`[PHPStan] Using cwd: ${vscode.workspace.rootPath}`);
    outputChannel.show(true);

    spinner.text = 'PHPStan: Analyzing';
    spinner.show();

    cp.exec(command, { cwd: vscode.workspace.rootPath }, (err, stdout, stderr) => {
        spinner.hide();
        diagnostics.clear();

        if (err && stdout) {
            try {
                outputChannel.appendLine(`[PHPStan] Raw output:\n${stdout}`);

                const results = JSON.parse(stdout);
                const fileDiagnostics: vscode.Diagnostic[] = [];

                const fileMessages = results.files?.[doc.fileName]?.messages ?? [];
                outputChannel.appendLine(`[PHPStan] Found ${fileMessages.length} messages`);

                fileMessages.forEach((msg: any) => {
                    const range = new vscode.Range(
                        new vscode.Position(msg.line - 1, 0),
                        new vscode.Position(msg.line - 1, 1000)
                    );

                    // Determine severity based on whether the error is ignorable
                    const severity = msg.ignorable === true
                        ? vscode.DiagnosticSeverity.Warning
                        : vscode.DiagnosticSeverity.Error;

                    const diagnostic = new vscode.Diagnostic(
                        range,
                        msg.message,
                        severity
                    );

                    // Set the source property to indicate it's from PHPStan
                    diagnostic.source = 'PHPStan';

                    // Add the error identifier if available
                    if (msg.identifier) {
                        diagnostic.code = msg.identifier;
                    }

                    fileDiagnostics.push(diagnostic);

                    // Log with severity indicator
                    const severityLabel = msg.ignorable ? "WARNING" : "ERROR";
                    outputChannel.appendLine(`- Line ${msg.line} [${severityLabel}]: ${msg.message}`);
                });

                diagnostics.set(doc.uri, fileDiagnostics);
            } catch (e) {
                vscode.window.showErrorMessage('[PHPStan] Failed to parse output');
                outputChannel.appendLine('[PHPStan] Failed to parse JSON output');
                outputChannel.appendLine(`Error: ${(e as Error).message}`);
                outputChannel.appendLine(`Stdout: ${stdout}`);
                outputChannel.appendLine(`Stderr: ${stderr}`);
            }
        } else if (err) {
            outputChannel.appendLine(`[PHPStan] Error (no stdout): ${err.message}`);
            outputChannel.appendLine(`Stderr: ${stderr}`);
            vscode.window.showErrorMessage('PHPStan encountered an error (see Output tab)');
        } else {
            outputChannel.appendLine('[PHPStan] No errors found.');
        }
    });
}
