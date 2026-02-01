import * as vscode from 'vscode';
import { NotionEditorProvider } from './notionEditorProvider';

export function activate(context: vscode.ExtensionContext) {
  console.log('Notion Markdown Editor is now active');

  // Register the custom editor provider
  const provider = new NotionEditorProvider(context);

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      NotionEditorProvider.viewType,
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
        supportsMultipleEditorsPerDocument: false,
      }
    )
  );

  // Register command to open file with Notion editor
  context.subscriptions.push(
    vscode.commands.registerCommand('notionMd.openWithNotionEditor', async () => {
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor && activeEditor.document.fileName.endsWith('.md')) {
        await vscode.commands.executeCommand(
          'vscode.openWith',
          activeEditor.document.uri,
          NotionEditorProvider.viewType
        );
      } else {
        vscode.window.showInformationMessage('Please open a Markdown file first');
      }
    })
  );
}

export function deactivate() {}
