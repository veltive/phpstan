import * as vscode from 'vscode';
import * as cp from 'child_process';
import { LintedFiles } from './lintedFiles';

const outputChannel = vscode.window.createOutputChannel('PHPStan');
const spinnerLabel = "$(sync~spin) PHPStan:";

LintedFiles.initialize(outputChannel);

export function runPhpStan(spinner: vscode.StatusBarItem, doc: vscode.TextDocument, diagnostics: vscode.DiagnosticCollection, config: vscode.WorkspaceConfiguration, trigger: String | null = null) {
    const currentTime = Date.now();
    const fileName = doc.fileName;

    // Use LintedFiles class to manage file tracking
    if (LintedFiles.shouldSkipAnalysis(fileName, currentTime, trigger)) {
        return;
    }

    // Update tracking in LintedFiles
    LintedFiles.updateTracking(fileName, currentTime, doc.isDirty);

    // Output information about the analysis
    outputInformation(outputChannel, spinner, fileName, trigger);
    executePhpStan(config, vscode.workspace.workspaceFolders?.[0]?.uri.fsPath, doc, diagnostics, spinner, fileName);
}

function outputInformation(outputChannel: vscode.OutputChannel, spinner: vscode.StatusBarItem, fileName: string, trigger: String | null = null) {
    spinner.show();
    spinner.text = `${spinnerLabel} Analyzing 🔍`;

    if (trigger) {
        //
    }

    outputChannel.appendLine(`[PHPStan] Analyzing: ${fileName} 🔍`);
}

function executePhpStan(
    config: vscode.WorkspaceConfiguration,
    workspaceFolder: string | undefined,
    doc: vscode.TextDocument,
    diagnostics: vscode.DiagnosticCollection,
    spinner: vscode.StatusBarItem,
    fileName: string
) {
    const binaryPath = config.get<string>('binaryPath') || 'phpstan';
    const configPath = config.get<string>('config') || '';
    const extraArgs = config.get<string>('args') || '';
    const errorFormat = config.get<string>('errorFormat') || 'json';
    const command = config.get<string>('command') || `${binaryPath} analyse ${fileName} --error-format=${errorFormat} ${configPath ? '--configuration ' + configPath : ''} ${extraArgs}`;

    cp.exec(command, { cwd: workspaceFolder }, (err, stdout, stderr) => {
        if (err && stdout) {
            try {
                const results = JSON.parse(stdout);
                const fileDiagnostics: vscode.Diagnostic[] = [];
                const fileMessages = results.files?.[fileName]?.messages ?? [];

                outputChannel.appendLine(`[PHPStan] Finished analyzing ${fileName}. ` + (fileMessages.length === 0 ? '✅' : '❌'));
                // Only clear diagnostics for the current file, not all files
                diagnostics.delete(doc.uri);

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

                    if (msg.identifier) {
                        diagnostic.code = msg.identifier;
                    }

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
            // Clear diagnostics only for the current file when no errors
            diagnostics.delete(doc.uri);
        }

        setTimeout(() => {
            spinner.hide();
        }, 1000);
    });}

// Function to mark a file as modified
export function markFileAsModified(fileName: string) {
    LintedFiles.markFileAsModified(fileName);
}

// Add this function to register the document change event
export function registerDocumentChangeListener(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document.languageId === 'php') {
                markFileAsModified(event.document.fileName);
            }
        })
    );
}
