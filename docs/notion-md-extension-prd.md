# Notion-Style Markdown Editor for VS Code/Cursor

## Overview

A VS Code/Cursor extension that transforms markdown editing into a Notion-like visual experience — blocks, slash commands, drag-and-drop — while keeping files as plain `.md` for AI copilot and git compatibility.

## Problem

Editing markdown in an IDE feels like writing code, not writing content. You see raw syntax instead of formatted text. Meanwhile, Notion offers a beautiful block-based editing experience — but it's disconnected from your codebase.

## Solution

A Custom Editor extension that renders `.md` files as visual blocks, powered by BlockNote. Edit like Notion, save as markdown.

## Core Features

### Visual Block Editing

- Headings, paragraphs, lists, code blocks, callouts, dividers

- Clean typography and generous spacing

- Blocks feel like objects, not lines of text

### Slash Commands

- Type `/` to insert new block types

- `/heading`, `/code`, `/list`, `/callout`, `/divider`

### Drag-and-Drop Reordering

- Block handles on hover (`⋮⋮` grip)

- Drag blocks to reorder

- Smooth animations

### Real-Time Sync

- Edits in visual mode immediately update the `.md` file (debounced)

- External file changes (e.g., from AI copilot) refresh the visual view

- Two-way sync between visual editor ↔ source file

### Source Toggle

- Switch to raw markdown view when needed

- Useful for AI copilot interaction or manual edits

## Technical Architecture

### Extension Type

**VS Code Custom Editor API**

- Replaces default text editor with a webview for `.md` files

- Full control over UI and editing experience

- Registers for `*.md` file types

### Webview Stack

**React**

- Component model fits block-based UI

- Large ecosystem, good VS Code webview examples

**BlockNote**

- Open source Notion-style block editor

- Built on Tiptap/ProseMirror

- Provides: slash commands, drag-and-drop, block handles, clean UI

- Built-in Markdown ↔ JSON conversion

- GitHub: <https://github.com/TypeCellOS/BlockNote>

## Implementation Steps

### Phase 1: Extension Scaffold

1. Initialize VS Code extension project (`yo code`)

2. Set up Custom Editor provider for `.md` files

3. Create basic React webview that loads in the editor panel

4. Verify: opening a `.md` file shows the React webview

### Phase 2: BlockNote Integration

1. Add BlockNote to the webview

2. Render a hardcoded BlockNote editor (no file connection yet)

3. Verify: slash commands and drag-and-drop work in the webview

### Phase 3: Markdown Sync

1. Read `.md` file content from extension host

2. Convert markdown → BlockNote JSON using BlockNote's converter

3. Pass JSON to webview, render in BlockNote

4. On BlockNote changes, convert JSON → markdown

5. Send markdown back to extension host, write to file (debounced)

6. Verify: edits in visual mode persist to the `.md` file

### Phase 4: External Change Detection

1. Implement file watcher for the open `.md` file

2. On external change, re-read file, re-parse, update BlockNote

3. Verify: changes from Copilot or other sources appear in visual editor

### Phase 5: Source Toggle

1. Add toggle button/command to switch between visual and source view

2. Source view shows raw markdown in standard VS Code editor

3. Verify: can toggle between modes, changes sync correctly

### Phase 6: Polish

1. Style the webview (typography, spacing, colors)

2. Match Notion's visual feel

3. Add keyboard shortcuts

4. Handle edge cases (empty files, malformed markdown)

## Out of Scope (for MVP)

- Databases, tables, columns

- Custom block types

- Real-time collaboration

- Themes beyond light/dark

- Image uploads/embedding

- Export options

## Resources

- [VS Code Custom Editor API](https://code.visualstudio.com/api/extension-guides/custom-editors)

- [BlockNote Documentation](https://www.blocknotejs.org/docs)

- [BlockNote GitHub](https://github.com/TypeCellOS/BlockNote)

- [VS Code Webview API](https://code.visualstudio.com/api/extension-guides/webview)
