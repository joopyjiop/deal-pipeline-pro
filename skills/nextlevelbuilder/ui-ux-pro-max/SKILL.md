---
name: ui-ux-pro-max
description: Use when designing or reviewing polished responsive interfaces for this React, Tailwind, and shadcn/ui application.
---

# UI/UX Pro Max guidance

Source repository: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill

Use this skill when a request changes the visual design, landing page, dashboard, or responsive behavior. Keep the existing React providers, Tailwind token system, shadcn/ui components, and global CSS foundation intact.

## Workflow

1. Identify the page goal, primary user action, responsive breakpoints, and the project's existing visual language.
2. Build a clear hierarchy: one dominant action, readable supporting copy, and purposeful secondary actions.
3. Prefer existing shadcn/ui primitives and project tokens before introducing new components or arbitrary colors.
4. Use a cohesive theme with deliberate typography, spacing, borders, surfaces, and states rather than a generic gradient template.
5. Design loading, empty, error, disabled, hover, focus, and success states—not only the happy path.
6. Check narrow mobile widths, keyboard focus, readable contrast, reduced-motion behavior, and long content.
7. Inspect the rendered preview before considering the work complete. A blank or unstyled preview is a failure to fix.

## Project constraints

- Preserve `src/main.tsx`, providers, route protection, and the global stylesheet imports.
- Do not invent Tailwind utilities or remove required `@tailwind` directives and theme variables.
- Keep authenticated product routes connected to the existing auth flow; do not stop at a decorative landing page.
- Prefer small, focused edits over replacing the application shell.
- Motion should clarify hierarchy and feedback. Respect `prefers-reduced-motion` and avoid animation that obscures data-entry or review work.
