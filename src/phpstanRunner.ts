import * as vscode from 'vscode';
import * as cp from 'child_process';

const outputChannel = vscode.window.createOutputChannel('PHPStan');
const spinnerLabel = "$(sync~spin) PHPStan:";

// Track the last analyzed file to prevent duplicate runs
let lastAnalyzedFile: string | null = null;
let lastAnalyzedTime: number = 0;

export function runPhpStan(spinner: vscode.StatusBarItem, doc: vscode.TextDocument, diagnostics: vscode.DiagnosticCollection, config: vscode.WorkspaceConfiguration, trigger: String | null = null) {
    const currentTime = Date.now();

    // Skip if this is the same file and was analyzed less than 3 seconds ago
    if (lastAnalyzedFile === doc.fileName && currentTime - lastAnalyzedTime < 3000) {
        return;
    }

    // Update tracking variables
    lastAnalyzedFile = doc.fileName;
    lastAnalyzedTime = currentTime;


    const binaryPath = config.get<string>('binaryPath') || 'phpstan';
    const configPath = config.get<string>('config') || '';
    const extraArgs = config.get<string>('args') || '';
    const errorFormat = config.get<string>('errorFormat') || 'json';
    const command = config.get<string>('command') || `${binaryPath} analyse ${doc.fileName} --error-format=${errorFormat} ${configPath ? '--configuration ' + configPath : ''} ${extraArgs}`;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    spinner.show();
    spinner.text = `${spinnerLabel} Analyzing 🔍`;

    outputChannel.clear();

    if (trigger) {
        outputChannel.appendLine(`[PHPStan] ${trigger}`);
    }

    outputChannel.appendLine(`[PHPStan] Analyzing: ${doc.fileName} 🔍`);

    cp.exec(command, { cwd: workspaceFolder }, (err, stdout, stderr) => {
        if (err && stdout) {
            try {
                const results = JSON.parse(stdout);
                const fileDiagnostics: vscode.Diagnostic[] = [];

                const fileMessages = results.files?.[doc.fileName]?.messages ?? [];
                outputChannel.appendLine(`[PHPStan] Found ${fileMessages.length} messages ` + (fileMessages.length === 0 ? '✅' : '❌'));
                diagnostics.clear();

                fileMessages.forEach((msg: any) => {
                    const range = new vscode.Range(
                        new vscode.Position(msg.line - 1, 0),
                        new vscode.Position(msg.line - 1, 1000)
                    );

                    const severity = msg.ignorable === true
                        ? vscode.DiagnosticSeverity.Warning
                        : vscode.DiagnosticSeverity.Error;

                    const diagnostic = new vscode.Diagnostic(range, msg.message, severity);

                    diagnostic.source = 'PHPStan';
                    if (msg.identifier) diagnostic.code = msg.identifier;

                    fileDiagnostics.push(diagnostic);
                });

                diagnostics.set(doc.uri, fileDiagnostics);
            } catch (e) {
                outputChannel.appendLine('[PHPStan] Failed to parse JSON output ⚠️');
                outputChannel.appendLine(`Error: ${(e as Error).message}`);
                outputChannel.appendLine(`Stdout: ${stdout}`);
                outputChannel.appendLine(`Stderr: ${stderr}`);
            }
        } else if (err) {
            outputChannel.appendLine(`[PHPStan] Error (no stdout): ${err.message}`);
            outputChannel.appendLine(`Stderr: ${stderr}`);
        } else {
            outputChannel.appendLine('[PHPStan] No errors found ✅');
        }

        setTimeout(() => {
            spinner.hide();
        }, 1000);
    });
}
