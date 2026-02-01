import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

export class NotionEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'notionMd.editor';

  constructor(private readonly context: vscode.ExtensionContext) {}

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    // Track content to prevent sync loops
    let lastSentContent = '';
    let lastReceivedContent = '';

    // Get the directory of the markdown file for image storage
    const documentDir = path.dirname(document.uri.fsPath);

    // Setup webview options
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
        vscode.Uri.file(documentDir), // Allow loading images from document directory
      ],
    };

    // Set initial HTML content
    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    // Get current theme
    const getTheme = (): 'light' | 'dark' => {
      const kind = vscode.window.activeColorTheme.kind;
      // Dark and HighContrast are dark themes
      return kind === vscode.ColorThemeKind.Dark || kind === vscode.ColorThemeKind.HighContrast
        ? 'dark'
        : 'light';
    };

    // Send theme to webview
    const sendTheme = () => {
      webviewPanel.webview.postMessage({
        type: 'setTheme',
        theme: getTheme(),
      });
    };

    // Handle messages from webview
    webviewPanel.webview.onDidReceiveMessage(
      (message) => {
        switch (message.type) {
          case 'update':
            // Skip if content is same as what we sent (our own content coming back)
            if (message.content === lastSentContent) {
              return;
            }
            // Skip if content unchanged from last received
            if (message.content === lastReceivedContent) {
              return;
            }
            lastReceivedContent = message.content;
            this.updateDocument(document, message.content);
            return;

          case 'ready':
            // Send both content and theme when webview is ready
            const content = document.getText();
            lastSentContent = content;
            webviewPanel.webview.postMessage({
              type: 'setContent',
              content: content,
            });
            sendTheme();
            return;

          case 'saveImage':
            this.handleSaveImage(
              webviewPanel.webview,
              document,
              message.requestId,
              message.fileName,
              message.mimeType,
              message.base64Data
            );
            return;

          case 'resolveImagePath':
            this.handleResolveImagePath(
              webviewPanel.webview,
              document,
              message.requestId,
              message.relativePath
            );
            return;
        }
      },
      undefined,
      this.context.subscriptions
    );

    // Handle document changes (external edits)
    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(
      (e) => {
        if (e.document.uri.toString() === document.uri.toString() && e.contentChanges.length > 0) {
          const newContent = document.getText();
          // Only update webview if content differs from what we last sent
          // and differs from what webview sent us (prevents loops)
          if (newContent !== lastSentContent && newContent !== lastReceivedContent) {
            lastSentContent = newContent;
            webviewPanel.webview.postMessage({
              type: 'setContent',
              content: newContent,
            });
          }
        }
      }
    );

    // Handle theme changes
    const themeChangeSubscription = vscode.window.onDidChangeActiveColorTheme(() => {
      sendTheme();
    });

    // Cleanup on dispose
    webviewPanel.onDidDispose(() => {
      changeDocumentSubscription.dispose();
      themeChangeSubscription.dispose();
    });
  }

  private async handleSaveImage(
    webview: vscode.Webview,
    document: vscode.TextDocument,
    requestId: string,
    fileName: string,
    mimeType: string,
    base64Data: string
  ) {
    try {
      // Get directory of the markdown file
      const documentDir = path.dirname(document.uri.fsPath);
      const imagesDir = path.join(documentDir, 'images');

      // Create images directory if it doesn't exist
      if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true });
      }

      // Use content hash for filename (prevents duplicates)
      const imageBuffer = Buffer.from(base64Data, 'base64');
      const hash = crypto.createHash('md5').update(imageBuffer).digest('hex').slice(0, 12);
      const ext = path.extname(fileName) || this.getExtensionFromMimeType(mimeType);
      const uniqueName = `${hash}${ext}`;
      const imagePath = path.join(imagesDir, uniqueName);

      // Only write if file doesn't already exist (deduplication)
      if (!fs.existsSync(imagePath)) {
        fs.writeFileSync(imagePath, imageBuffer);
      }

      // Convert to webview URI for display
      const imageUri = webview.asWebviewUri(vscode.Uri.file(imagePath));

      // Relative path for markdown storage
      const relativePath = `./images/${uniqueName}`;

      webview.postMessage({
        type: 'imageSaved',
        requestId,
        relativePath,
        webviewUri: imageUri.toString(),
      });
    } catch (error) {
      webview.postMessage({
        type: 'imageSaved',
        requestId,
        relativePath: null,
        webviewUri: null,
        error: error instanceof Error ? error.message : 'Failed to save image',
      });
    }
  }

  private handleResolveImagePath(
    webview: vscode.Webview,
    document: vscode.TextDocument,
    requestId: string,
    relativePath: string
  ) {
    try {
      const documentDir = path.dirname(document.uri.fsPath);
      const absolutePath = path.resolve(documentDir, relativePath);

      // Check if file exists
      if (fs.existsSync(absolutePath)) {
        const imageUri = webview.asWebviewUri(vscode.Uri.file(absolutePath));
        webview.postMessage({
          type: 'resolveImage',
          requestId,
          webviewUri: imageUri.toString(),
        });
      } else {
        webview.postMessage({
          type: 'resolveImage',
          requestId,
          webviewUri: null,
        });
      }
    } catch {
      webview.postMessage({
        type: 'resolveImage',
        requestId,
        webviewUri: null,
      });
    }
  }

  private getExtensionFromMimeType(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
      'image/bmp': '.bmp',
    };
    return mimeToExt[mimeType] || '.png';
  }

  private updateDocument(document: vscode.TextDocument, content: string) {
    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      document.uri,
      new vscode.Range(0, 0, document.lineCount, 0),
      content
    );
    vscode.workspace.applyEdit(edit);

    // Clean up unused images
    this.cleanupUnusedImages(document, content);
  }

  private cleanupUnusedImages(document: vscode.TextDocument, content: string) {
    try {
      const documentDir = path.dirname(document.uri.fsPath);
      const imagesDir = path.join(documentDir, 'images');

      // Check if images directory exists
      if (!fs.existsSync(imagesDir)) {
        return;
      }

      // Extract all image references from markdown
      // Matches: ![...](./images/filename.ext) or ![...](images/filename.ext)
      const imageRegex = /!\[.*?\]\(\.?\/?(images\/[^)]+)\)/g;
      const referencedImages = new Set<string>();

      let match;
      while ((match = imageRegex.exec(content)) !== null) {
        // Normalize path: extract just the filename
        const imagePath = match[1];
        const fileName = path.basename(imagePath);
        referencedImages.add(fileName);
      }

      // Get all files in images directory
      const existingFiles = fs.readdirSync(imagesDir);

      // Delete files not referenced in markdown
      for (const file of existingFiles) {
        if (!referencedImages.has(file)) {
          const filePath = path.join(imagesDir, file);
          try {
            fs.unlinkSync(filePath);
          } catch {
            // Ignore deletion errors
          }
        }
      }

      // Remove images directory if empty
      const remainingFiles = fs.readdirSync(imagesDir);
      if (remainingFiles.length === 0) {
        fs.rmdirSync(imagesDir);
      }
    } catch {
      // Ignore cleanup errors - not critical
    }
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'index.js')
    );

    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'index.css')
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource} data:; img-src ${webview.cspSource} data: file: https:;">
  <title>Notion Markdown Editor</title>
  <link rel="stylesheet" href="${styleUri}">
  <style>
    * {
      box-sizing: border-box;
    }
    html, body {
      margin: 0;
      padding: 0;
      min-height: 100%;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
    }
    #root {
      max-width: 900px;
      margin: 0 auto;
      padding: 24px 16px;
      min-height: 100vh;
    }
    /* BlockNote editor styling */
    .bn-editor {
      padding: 0 !important;
    }
    /* Loading indicator */
    .loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 200px;
      color: var(--vscode-descriptionForeground);
    }
    .loading-spinner {
      width: 32px;
      height: 32px;
      border: 3px solid var(--vscode-editor-foreground);
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      opacity: 0.3;
    }
    .loading-text {
      margin-top: 12px;
      font-size: 13px;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div id="root">
    <div class="loading">
      <div class="loading-spinner"></div>
      <div class="loading-text">Loading editor...</div>
    </div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
