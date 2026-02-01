import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { BlockNoteSchema, defaultBlockSpecs, createHeadingBlockSpec, createCodeBlockSpec } from '@blocknote/core';
import { createHighlighter } from './shiki.bundle';
import { filterSuggestionItems } from '@blocknote/core/extensions';
import { BlockNoteView } from '@blocknote/mantine';
import {
  useCreateBlockNote,
  FormattingToolbarController,
  FormattingToolbar,
  BlockTypeSelect,
  BasicTextStyleButton,
  CreateLinkButton,
  NestBlockButton,
  UnnestBlockButton,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
} from '@blocknote/react';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';

// Custom schema: only include markdown-compatible blocks
// Excludes: video, audio, file, toggleListItem
// Disables: toggle headings (collapsible headings)
const schema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph: defaultBlockSpecs.paragraph,
    heading: createHeadingBlockSpec({
      levels: [1, 2, 3, 4, 5, 6],
      allowToggleHeadings: false,
    }),
    bulletListItem: defaultBlockSpecs.bulletListItem,
    numberedListItem: defaultBlockSpecs.numberedListItem,
    checkListItem: defaultBlockSpecs.checkListItem,
    // toggleListItem: excluded - not supported in markdown
    codeBlock: createCodeBlockSpec({
      indentLineWithTab: true,
      defaultLanguage: 'text',
      supportedLanguages: {
        text: { name: 'Plain Text' },
        javascript: { name: 'JavaScript', aliases: ['js'] },
        typescript: { name: 'TypeScript', aliases: ['ts'] },
        jsx: { name: 'JSX' },
        tsx: { name: 'TSX' },
        python: { name: 'Python', aliases: ['py'] },
        html: { name: 'HTML' },
        css: { name: 'CSS' },
        json: { name: 'JSON' },
        bash: { name: 'Bash', aliases: ['sh', 'shell', 'zsh'] },
        sql: { name: 'SQL' },
        markdown: { name: 'Markdown', aliases: ['md'] },
        yaml: { name: 'YAML', aliases: ['yml'] },
        go: { name: 'Go' },
        rust: { name: 'Rust', aliases: ['rs'] },
        java: { name: 'Java' },
        c: { name: 'C' },
        cpp: { name: 'C++', aliases: ['c++'] },
        diff: { name: 'Diff' },
        dockerfile: { name: 'Dockerfile', aliases: ['docker'] },
      },
      createHighlighter: () => createHighlighter({
        themes: ['light-plus', 'dark-plus'],
        langs: [],
      }),
    }),
    table: defaultBlockSpecs.table,
    quote: defaultBlockSpecs.quote,
    image: defaultBlockSpecs.image,
    // video: excluded - not supported in markdown
    // audio: excluded - not supported in markdown
    // file: excluded - not supported in markdown
  },
});

// VS Code API - must be declared before use
declare const acquireVsCodeApi: () => {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

const vscode = acquireVsCodeApi();

// Message types for type safety
interface SetContentMessage {
  type: 'setContent';
  content: string;
}

interface SetThemeMessage {
  type: 'setTheme';
  theme: 'light' | 'dark';
}

interface ImageSavedMessage {
  type: 'imageSaved';
  requestId: string;
  relativePath: string | null;
  webviewUri: string | null;
  error?: string;
}

interface ResolveImageMessage {
  type: 'resolveImage';
  requestId: string;
  webviewUri: string | null;
}

type IncomingMessage = SetContentMessage | SetThemeMessage | ImageSavedMessage | ResolveImageMessage;

// Pending image save requests
const pendingImageRequests = new Map<string, { resolve: (url: string) => void; reject: (err: Error) => void }>();

// Pending image resolve requests (for displaying relative paths)
const pendingResolveRequests = new Map<string, (url: string) => void>();

// Map of relative paths to webview URIs (for resolving images)
const imageUriMap = new Map<string, string>();

// Handle file upload by saving to local images folder
async function uploadFile(file: File): Promise<string> {
  // Read file as base64
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Extract base64 part (remove data:image/...;base64, prefix)
      const base64Data = result.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

  // Generate unique request ID
  const requestId = `img-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // Create promise for response
  const resultPromise = new Promise<string>((resolve, reject) => {
    pendingImageRequests.set(requestId, { resolve, reject });

    // Timeout after 30 seconds
    setTimeout(() => {
      if (pendingImageRequests.has(requestId)) {
        pendingImageRequests.delete(requestId);
        reject(new Error('Image save timeout'));
      }
    }, 30000);
  });

  // Send to extension to save
  vscode.postMessage({
    type: 'saveImage',
    requestId,
    fileName: file.name,
    mimeType: file.type,
    base64Data: base64,
  });

  return resultPromise;
}

// Resolve relative image paths to webview URIs for display
async function resolveFileUrl(url: string): Promise<string> {
  // If it's already a data URL or absolute URL, return as-is
  if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://') || url.startsWith('vscode-webview://')) {
    return url;
  }

  // Check if we have it cached
  if (imageUriMap.has(url)) {
    return imageUriMap.get(url)!;
  }

  // Ask extension to resolve the path
  const requestId = `resolve-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const resultPromise = new Promise<string>((resolve) => {
    pendingResolveRequests.set(requestId, resolve);

    // Timeout - just return original URL
    setTimeout(() => {
      if (pendingResolveRequests.has(requestId)) {
        pendingResolveRequests.delete(requestId);
        resolve(url);
      }
    }, 5000);
  });

  vscode.postMessage({
    type: 'resolveImagePath',
    requestId,
    relativePath: url,
  });

  const resolvedUrl = await resultPromise;
  imageUriMap.set(url, resolvedUrl);
  return resolvedUrl;
}

// Fix tables with empty header rows by promoting first data row to header
function fixEmptyTableHeaders(markdown: string): string {
  // Match table pattern: header row, separator row (with multiple | chars), data rows
  // Separator row: | --- | --- | or |:---:|---:| etc.
  const tableRegex = /(\|[^\n]*\|)\n(\|(?:[\s\-:]+\|)+)\n((?:\|[^\n]*\|\n?)+)/g;

  return markdown.replace(tableRegex, (match, headerRow, separatorRow, dataRows) => {
    // Check if header row is empty (only whitespace and pipes)
    const headerCells = headerRow.split('|').slice(1, -1);
    const isHeaderEmpty = headerCells.every((cell: string) => cell.trim() === '');

    if (isHeaderEmpty) {
      // Split data rows into lines and filter out empty rows
      const dataLines = dataRows.trim().split('\n').filter((line: string) => {
        const cells = line.split('|').slice(1, -1);
        return cells.some((cell: string) => cell.trim() !== '');
      });

      if (dataLines.length > 0) {
        // Use first non-empty data row as header
        const newHeader = dataLines[0];
        const remainingData = dataLines.slice(1).join('\n');

        if (remainingData) {
          return `${newHeader}\n${separatorRow}\n${remainingData}\n`;
        } else {
          // Only one data row, it becomes the header with no data
          return `${newHeader}\n${separatorRow}\n`;
        }
      }
    }

    return match;
  });
}

function Editor() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [isReady, setIsReady] = useState(false);

  // Performance: Track content to avoid redundant operations
  const lastSavedContent = useRef<string>('');
  const lastReceivedContent = useRef<string>('');
  const isUpdatingFromExtension = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const pendingSave = useRef(false);

  // Create the editor instance with custom schema and file handlers
  const editor = useCreateBlockNote({
    schema,
    uploadFile,
    resolveFileUrl,
  });

  // Custom slash menu items with reorganized groups and ordering
  const getCustomSlashMenuItems = useMemo(() => {
    return () => {
      const defaultItems = getDefaultReactSlashMenuItems(editor);

      // Define group order (groups appear in this order)
      const groupOrder = ['Headings', 'Subheadings', 'Basic blocks', 'Advanced'];

      // Reassign items to correct groups
      const modifiedItems = defaultItems.map((item) => {
        const title = item.title;
        const originalGroup = item.group || '';

        // H1-H3 go to "Headings"
        if (title === 'Heading 1' || title === 'Heading 2' || title === 'Heading 3') {
          return { ...item, group: 'Headings' };
        }

        // H4-H6 (Subheadings) stay in "Subheadings"
        if (title === 'Heading 4' || title === 'Heading 5' || title === 'Heading 6' ||
            originalGroup === 'Subheadings') {
          return { ...item, group: 'Subheadings' };
        }

        // Table, Image, and Emoji go to "Advanced"
        if (title === 'Table' || title === 'Image' || title === 'Emoji' ||
            originalGroup === 'Emoji') {
          return { ...item, group: 'Advanced' };
        }

        return item;
      });

      // Sort items by group order
      return modifiedItems.sort((a, b) => {
        const aIndex = groupOrder.indexOf(a.group || '');
        const bIndex = groupOrder.indexOf(b.group || '');
        // Items not in groupOrder go to the end
        const aOrder = aIndex === -1 ? 999 : aIndex;
        const bOrder = bIndex === -1 ? 999 : bIndex;
        return aOrder - bOrder;
      });
    };
  }, [editor]);

  // Perform the actual save operation
  const performSave = useCallback(async () => {
    if (isUpdatingFromExtension.current) {
      pendingSave.current = false;
      return;
    }

    try {
      let markdown = await editor.blocksToMarkdownLossy(editor.document);

      // Fix tables with empty headers (promote first data row to header)
      markdown = fixEmptyTableHeaders(markdown);

      // Skip if content unchanged
      if (markdown === lastSavedContent.current) {
        pendingSave.current = false;
        return;
      }

      lastSavedContent.current = markdown;
      vscode.postMessage({
        type: 'update',
        content: markdown,
      });
    } catch (e) {
      console.error('Failed to convert blocks to markdown:', e);
    } finally {
      pendingSave.current = false;
    }
  }, [editor]);

  // Debounced save - just marks that a save is needed
  const scheduleSave = useCallback(() => {
    // Don't schedule if we're receiving content from extension
    if (isUpdatingFromExtension.current) {
      return;
    }

    // Clear any pending save timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Mark that we have a pending save and schedule it
    pendingSave.current = true;
    saveTimeoutRef.current = setTimeout(performSave, 500);
  }, [performSave]);

  // Handle incoming messages from VS Code extension
  useEffect(() => {
    const handleMessage = async (event: MessageEvent<IncomingMessage>) => {
      const message = event.data;

      switch (message.type) {
        case 'setContent': {
          // Skip if content is same as what we last received (prevents loops)
          if (message.content === lastReceivedContent.current) {
            return;
          }

          // Skip if content matches what we just saved (our own edit coming back)
          if (message.content === lastSavedContent.current) {
            return;
          }

          lastReceivedContent.current = message.content;
          isUpdatingFromExtension.current = true;

          // Cancel any pending save since we're receiving new content
          if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            pendingSave.current = false;
          }

          try {
            const blocks = await editor.tryParseMarkdownToBlocks(message.content);
            editor.replaceBlocks(editor.document, blocks);

            // Update saved content to match what we just loaded
            lastSavedContent.current = message.content;

            if (!isReady) {
              setIsReady(true);
            }
          } catch (e) {
            console.error('Failed to parse markdown:', e);
          } finally {
            // Allow saves again after content is fully updated
            setTimeout(() => {
              isUpdatingFromExtension.current = false;
            }, 50);
          }
          break;
        }

        case 'setTheme': {
          setTheme(message.theme);
          break;
        }

        case 'imageSaved': {
          const pending = pendingImageRequests.get(message.requestId);
          if (pending) {
            pendingImageRequests.delete(message.requestId);
            if (message.relativePath && message.webviewUri) {
              // Cache the mapping for future resolves
              imageUriMap.set(message.relativePath, message.webviewUri);
              // Return relative path (will be stored in markdown)
              pending.resolve(message.relativePath);
            } else {
              pending.reject(new Error(message.error || 'Failed to save image'));
            }
          }
          break;
        }

        case 'resolveImage': {
          const pending = pendingResolveRequests.get(message.requestId);
          if (pending) {
            pendingResolveRequests.delete(message.requestId);
            pending(message.webviewUri || '');
          }
          break;
        }

        default: {
          console.warn('Unknown message type:', (message as { type: string }).type);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    vscode.postMessage({ type: 'ready' });

    return () => {
      window.removeEventListener('message', handleMessage);
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [editor, isReady]);

  return (
    <BlockNoteView
      editor={editor}
      onChange={scheduleSave}
      theme={theme}
      formattingToolbar={false}
      slashMenu={false}
    >
      {/* Custom Formatting Toolbar - removes color/highlight/underline buttons */}
      <FormattingToolbarController
        formattingToolbar={() => (
          <FormattingToolbar>
            <BlockTypeSelect key="blockTypeSelect" />

            <BasicTextStyleButton basicTextStyle="bold" key="boldStyleButton" />
            <BasicTextStyleButton basicTextStyle="italic" key="italicStyleButton" />
            <BasicTextStyleButton basicTextStyle="strike" key="strikeStyleButton" />
            <BasicTextStyleButton basicTextStyle="code" key="codeStyleButton" />

            <NestBlockButton key="nestBlockButton" />
            <UnnestBlockButton key="unnestBlockButton" />

            <CreateLinkButton key="createLinkButton" />
          </FormattingToolbar>
        )}
      />

      {/* Custom Slash Menu - reorganizes groups */}
      <SuggestionMenuController
        triggerCharacter="/"
        getItems={async (query) =>
          filterSuggestionItems(getCustomSlashMenuItems(), query)
        }
      />
    </BlockNoteView>
  );
}

// Mount the app
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<Editor />);
}
