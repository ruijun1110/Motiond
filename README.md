# Notion Markdown Editor

A VS Code extension that transforms markdown editing into a Notion-like visual experience — blocks, slash commands, drag-and-drop — while keeping files as plain `.md` for AI copilot and git compatibility.

## Features

- **Visual Block Editing** - Edit markdown as visual blocks, not raw text
- **Slash Commands** - Type `/` to insert headings, lists, code blocks, tables, and more
- **Drag-and-Drop** - Reorder blocks by dragging
- **Real-Time Sync** - Edits sync between visual editor and source file
- **Theme Support** - Respects VS Code light/dark theme
- **Image Support** - Upload images to local `./images/` folder with automatic cleanup

## Installation

1. Clone this repository
2. Run `npm install`
3. Run `npm run build`
4. Press `F5` in VS Code to launch Extension Development Host
5. Open any `.md` file and select "Notion Markdown Editor" from the editor options

## Usage

- Open any `.md` file
- Click "Open with..." or use the command palette to select "Notion Markdown Editor"
- Use `/` to access slash commands
- Drag blocks using the handle on the left
- Changes auto-save to the markdown file

## Development

```bash
# Install dependencies
npm install

# Build (with minification)
npm run build

# Watch mode (auto-rebuild on changes)
npm run watch

# Lint
npm run lint
```

## Technical Stack

- **Editor**: [BlockNote](https://blocknotejs.org/) - Block-based rich text editor
- **UI Framework**: React 18
- **Build Tool**: esbuild
- **VS Code API**: Custom Editor Provider

## Known Limitations

- Text colors and highlights are not preserved (not supported in standard markdown)
- Multiple empty lines are normalized to single lines
- Image dimensions are not preserved in markdown

## License

MIT
