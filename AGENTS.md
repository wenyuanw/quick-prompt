# Repository Guidelines

## Project Structure & Module Organization
- Source: `entrypoints/` (web extension entrypoints)
  - `background.ts`, `content/`, `popup/`, `options/`
- Shared code: `utils/` (e.g., `browser/`, `auth/`, `sync/`), `types/`
- Assets & static: `assets/`, `public/`, `docs/`
- Config: `wxt.config.ts`, `tailwind.config.js`, `tsconfig.json`
- Build output: `.output/` (e.g., `chrome-mv3/`, `firefox-mv2/`)
- Path aliases: use `@/` for project utils/types and `#imports` from WXT.

## Build, Test, and Development Commands
- `pnpm dev` — Start Chrome dev build with hot reload.
- `pnpm dev:firefox` — Start Firefox dev build.
- `pnpm build` / `pnpm build:firefox` — Production builds.
- `pnpm zip` — Zip last build for store upload.
- `pnpm compile` — Type-check with TypeScript.
- Load locally (Chrome): open `chrome://extensions` → Load unpacked → `.output/chrome-mv3/`.

## Coding Style & Naming Conventions
- Language: TypeScript + React (functional components).
- Indentation: 2 spaces; use double quotes for strings; semicolons permitted.
- Files: libraries `.ts`; components `.tsx`. Component files in PascalCase; exports in camelCase.
- Imports: prefer path aliases (e.g., `@/utils/...`, `~/assets/tailwind.css`); group std/external/local.
- No ESLint/Prettier in repo; keep diffs small and consistent with nearby code.

## Testing Guidelines
- No formal test runner yet. Before PRs: `pnpm compile` must pass.
- Manual QA: verify `/p` selector in pages (content), options CRUD, category/pin/sort, Notion sync toggles.
- Confirm both Chrome and Firefox builds launch without console errors.

## Commit & Pull Request Guidelines
- Commits: Conventional-like style; emojis allowed (e.g., `✨ feat: ...`, `fix: ...`). Keep them small and focused; reference issues (`#123`) when relevant.
- PRs: include clear description, rationale, steps to reproduce/verify, screenshots/GIFs for UI changes, and mention affected entrypoints.

## Security & Configuration Tips
- Never commit secrets. Copy `.env.example` → `.env` and set: `WXT_CHROME_APP_CLIENT_ID_PREFIX`, `WXT_WEB_APP_CLIENT_ID_PREFIX`, `WXT_FIREFOX_EXTENSION_ID`.
- OAuth scopes and IDs are assembled in `wxt.config.ts`; keep published IDs stable.

