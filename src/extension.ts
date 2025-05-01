import * as vscode from 'vscode';
import { runPhpStan } from './phpstanRunner';

export function activate(context: vscode.ExtensionContext) {
    vscode.window.showInformationMessage('🔍 PHPStan launched', { modal: false });

    const diagnosticCollection = vscode.languages.createDiagnosticCollection('phpstan');
    context.subscriptions.push(diagnosticCollection);

    const config = vscode.workspace.getConfiguration('phpstan');

    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(doc => {
            if (doc.languageId === 'php') {
                runPhpStan(doc, diagnosticCollection, config);
            }
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(doc => {
            if (doc.languageId === 'php') {
                runPhpStan(doc, diagnosticCollection, config);
            }
        })
    );

    // Run for already open documents
    vscode.workspace.textDocuments.forEach(doc => {
        if (doc.languageId === 'php') {
            runPhpStan(doc, diagnosticCollection, config);
        }
    });

    context.subscriptions.push(
        vscode.commands.registerCommand('phpstan-inline.analyze', () => {
            const editor = vscode.window.activeTextEditor;

            if (editor && editor.document.languageId === 'php') {
                runPhpStan(editor.document, diagnosticCollection, config);
            }
        })
    );
}
