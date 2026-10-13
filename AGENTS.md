# AGENTS.md

## Project

- Static HTML/CSS website.
- Site language: id.

## Development

- Open `index.html` with Live Server or press F5 to preview locally.
- Edit HTML and CSS directly; no compilation step required.

## File structure

- HTML files: `index.html`, `pages/audit-log.html`, `pages/bank-soal.html`, `pages/dashboard-guru.html`, `pages/dashboard-siswa.html`, `pages/hasil.html`, `pages/instruksi.html`, `pages/login-guru.html`, `pages/manajemen-ujian.html`, `pages/pengaturan.html`, `pages/selesai.html`, `pages/ujian.html`
- CSS files: `css/style.css`
- Scripts: `js/auth.js`, `js/exam.js`, `js/layout.js`, `js/storage.js`, `js/utils.js`

## Source entry points

- `index.html` (187 lines) — loads scripts.

## Key Conventions

- Navigation uses anchor links to `#section-id` within `index.html`.
- Keep assets local; no external dependencies or CDN links unless strictly necessary.

## Comment style

- Never place comments on the first two lines of a source file; start with imports or declarations.
- Prefer concise section headings such as `// ── Constants ──` or a three-line banner for major sections so files remain easy to scan.
- Use JSDoc blocks only when an API, intent, edge case, or constraint needs explanation; do not restate the code.

## Boundaries

- Do not add build tools or `package.json` unless explicitly requested.
- Do not introduce JavaScript frameworks; the project is vanilla HTML/CSS.
