import * as vscode from 'vscode';
import * as cp from 'child_process';

const outputChannel = vscode.window.createOutputChannel('PHPStan');
const spinnerLabel = "$(sync~spin) PHPStan:";

// Track the last analyzed file to prevent duplicate runs
let lastAnalyzedFile: string | null = null;
let lastAnalyzedTime: number = 0;

// Track linted files and their modification status
interface LintedFile {
    fileName: string;
    lastLinted: number;
    lastModified: number;
}
const lintedFiles: Map<string, LintedFile> = new Map();

export function runPhpStan(spinner: vscode.StatusBarItem, doc: vscode.TextDocument, diagnostics: vscode.DiagnosticCollection, config: vscode.WorkspaceConfiguration, trigger: String | null = null) {
    const currentTime = Date.now();
    const fileName = doc.fileName;

    // Skip if this is the same file and was analyzed less than 3 seconds ago
    if (lastAnalyzedFile === fileName && currentTime - lastAnalyzedTime < 3000) {
        return;
    }

    // Check if file was already linted and hasn't been modified since
    const lintedFile = lintedFiles.get(fileName);
    if (lintedFile && trigger === 'Changed active editor') {
        // Only skip if the file hasn't been modified since last lint
        if (lintedFile.lastModified <= lintedFile.lastLinted) {
            outputChannel.appendLine(`[PHPStan] Skipping analysis of ${fileName} (already linted and not modified)`);
            return;
        }
    }

    // Update tracking variables
    lastAnalyzedFile = fileName;
    lastAnalyzedTime = currentTime;

    // Update or create linted file entry
    lintedFiles.set(fileName, {
        fileName,
        lastLinted: currentTime,
        lastModified: doc.isDirty ? currentTime : (lintedFile?.lastModified || 0)
    });

    const binaryPath = config.get<string>('binaryPath') || 'phpstan';
    const configPath = config.get<string>('config') || '';
    const extraArgs = config.get<string>('args') || '';
    const errorFormat = config.get<string>('errorFormat') || 'json';
    const command = config.get<string>('command') || `${binaryPath} analyse ${fileName} --error-format=${errorFormat} ${configPath ? '--configuration ' + configPath : ''} ${extraArgs}`;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    spinner.show();
    spinner.text = `${spinnerLabel} Analyzing 🔍`;

    outputChannel.clear();

    if (trigger) {
        outputChannel.appendLine(`[PHPStan] ${trigger}`);
    }

    outputChannel.appendLine(`[PHPStan] Analyzing: ${fileName} 🔍`);

    cp.exec(command, { cwd: workspaceFolder }, (err, stdout, stderr) => {
        if (err && stdout) {
            try {
                const results = JSON.parse(stdout);
                const fileDiagnostics: vscode.Diagnostic[] = [];
                const fileMessages = results.files?.[fileName]?.messages ?? [];

                outputChannel.appendLine(`[PHPStan] Finished analyzing ${fileName}. Found ${fileMessages.length} messages ` + (fileMessages.length === 0 ? '✅' : '❌'));
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
            // Clear diagnostics only for the current file when no errors
            diagnostics.delete(doc.uri);
        }

        setTimeout(() => {
            spinner.hide();
        }, 1000);
    });
}

// Function to mark a file as modified
export function markFileAsModified(fileName: string) {
    const lintedFile = lintedFiles.get(fileName);
    if (lintedFile) {
        lintedFile.lastModified = Date.now();
        lintedFiles.set(fileName, lintedFile);
    }
}
