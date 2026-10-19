@'

\# Rules for this repo

\- Read SPEC.md before every task. It is the source of truth for product, stack, security and design.

\- Work in small phases. Finish one phase fully before stopping. Never leave stubs, TODOs, mock data or fake buttons.

\- Do NOT write tests or test configs.

\- After each phase run `npx tsc --noEmit` and `next build` (when applicable) and fix all errors before finishing. Do not run anything else unless asked.

\- Never read, print or commit secrets. Use .env.example only.

\- Keep code compatible with Vercel serverless and Supabase.

\- At the end of each phase, list the files created and what the next phase depends on.

'@ | Set-Content -Path AGENTS.md -Encoding utf8

