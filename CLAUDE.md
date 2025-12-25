# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Quick Prompt is a browser extension for managing and quickly inserting prompts into any webpage input field. Built with WXT (Web Extension Tools) framework, React 19, and Tailwind CSS v4.

## Development Commands

```bash
pnpm install          # Install dependencies
pnpm dev              # Development mode (Chrome)
pnpm dev:firefox      # Development mode (Firefox)
pnpm build            # Production build (Chrome)
pnpm build:firefox    # Production build (Firefox)
pnpm compile          # TypeScript type checking
pnpm zip              # Create distribution zip (Chrome)
pnpm zip:firefox      # Create distribution zip (Firefox)
```

## Architecture

### Entry Points (`entrypoints/`)

- **background.ts** - Service worker handling extension lifecycle, context menus, keyboard shortcuts, and message routing between components
- **content/index.tsx** - Content script injected into all pages; detects `/p` trigger in input fields and shows the prompt selector
- **popup/** - Extension popup UI (React app)
- **options/** - Full management page for prompts and categories (React app with react-router-dom)

### Utilities (`utils/`)

- **types.ts** - Core TypeScript interfaces: `PromptItem`, `Category`, `EditableElement`
- **constants.ts** - Storage keys (`BROWSER_STORAGE_KEY`, `CATEGORIES_STORAGE_KEY`) and default data
- **categoryUtils.ts** - Category management and migration logic
- **i18n.ts** - Internationalization helper using browser's i18n API
- **browser/** - Modular background script handlers (shortcuts, context menus, notifications, storage, messages)
- **sync/notionSync.ts** - Notion database synchronization
- **auth/googleAuth.ts** - Google OAuth integration

### Content Script Components (`entrypoints/content/components/`)

- **PromptSelector.tsx** - Floating prompt picker UI with search and category filtering
- **VariableInput.tsx** - Modal for filling `{{variable}}` placeholders in prompts

### Options Page Components (`entrypoints/options/components/`)

- **PromptManager.tsx** / **PromptList.tsx** / **PromptForm.tsx** - CRUD for prompts with drag-and-drop sorting (@dnd-kit)
- **CategoryManager.tsx** / **CategoryList.tsx** / **CategoryForm.tsx** - Category management
- **NotionIntegration.tsx** - Notion sync configuration

## Key Patterns

### Storage
Uses `browser.storage.local` via WXT's `storage` helper. Main keys:
- `userPrompts` - Array of `PromptItem`
- `userCategories` - Array of `Category`

### Variable System
Prompts support `{{variableName}}` syntax. Variables are extracted at runtime by `variableParser.ts` and users fill them via a modal before insertion.

### Input Detection
Content script listens for `/p` typed in any `<input>`, `<textarea>`, or `contenteditable` element to trigger the prompt selector.

### Internationalization
Locales in `public/_locales/{en,zh}/messages.json`. Use `t('key')` from `utils/i18n.ts`.

## Build Output

- Chrome: `.output/chrome-mv3/`
- Firefox: `.output/firefox-mv2/`
