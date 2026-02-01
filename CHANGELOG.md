# Changelog

All notable changes to "Motiond" will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2024-XX-XX

### Added
- Initial release
- Visual block-based editing for Markdown files
- Slash commands (`/`) for inserting blocks
- Drag-and-drop block reordering
- Real-time sync between visual editor and source file
- Light and dark theme support (follows VS Code theme)
- Image upload with local storage (`./images/` folder)
- Automatic cleanup of unused images
- Syntax highlighting for code blocks (20+ languages)
- Support for:
  - Headings (H1-H6)
  - Paragraphs
  - Bullet lists (nested)
  - Numbered lists (nested)
  - Checklists
  - Code blocks with language selection
  - Tables
  - Blockquotes
  - Images
  - Links

### Known Limitations
- Text colors and highlights are not preserved (not supported in standard markdown)
- Multiple empty lines are normalized to single lines
- Image dimensions are not preserved in markdown
