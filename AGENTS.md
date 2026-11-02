# Project instructions — Invoice Extractor

Portfolio project for AI engineering roles, run as if it were in production: extract structured
data from invoices and receipts (PDF or photo), check it with deterministic rules, route between
a cheap and a strong model, and send what still fails to human review. `CLAUDE.md` is a symlink
to this file.

The story it has to tell, backed by eval numbers: *Haiku extracts, rules check, Opus steps in
only when checks fail: X% of the Opus-only cost at Y% accuracy; human corrections become new
eval cases.*

## Stack

| Layer | Choice |
|---|---|
| App | Next.js 16 App Router, TypeScript, Tailwind v4, bun |
| LLM | Claude API: `claude-haiku-5-5` first, `claude-opus-5-5` on failed checks; structured output via Zod (`betaZodOutputFormat`) |
| Data | Supabase (Postgres + Storage + Auth), from the review queue phase on |
| Hosting | Vercel (`fra1`), deploy from GitHub Actions |

## Constraints

1. Validation is deterministic code in `src/lib/validate.ts`, never an LLM.
2. The prompt asks the model to copy numbers as printed, never to fix arithmetic: fixing it would
   hide extraction errors from the checks.
3. Every extraction reports cost and latency per attempt (`PRICES` in `src/lib/extract.ts`, USD per
   MTok: keep it in sync with Anthropic pricing).
4. The eval measures field accuracy against ground truth, no LLM judge.
5. No secrets in the repo: `ANTHROPIC_API_KEY` in `.env.local`, on Vercel per environment.

## Roadmap

- [x] 1. Scaffold, upload, extraction with Zod schema (`POST /api/extract`)
- [x] 2. Deterministic validation + unit tests
- [ ] 3. Golden set + eval runner (field accuracy, cost, latency)
- [x] 4. Routing Haiku → Opus → `needs_review` (code done; strategy comparison needs the eval)
- [ ] 5. Review UI; corrections → golden set (Supabase from here)
- [ ] 6. Prod: rate limit, cost logs, spend limit, Vercel deploy
- [ ] 7. Showcase: README with numbers table, diagram, GIF; link from the portfolio

## Commands

```bash
bun dev                     # app on :3000 (check the port in the log if others are running)
bun test                    # unit tests
bun run lint && bun run typecheck
curl -F file=@invoice.pdf localhost:3000/api/extract
```

## Git

Gitflow: work on `develop`, `feat/` and `fix/` branches from `develop`. Merges and releases to
`main` are decided by the owner. Commit author is `azanni098@gmail.com`: the app is hosted on the
owner's personal Vercel account (a dedicated one needs a phone number already in use), and Vercel
blocks deploys from other authors. Supabase is on the dedicated
`invoice-extractor@alessandrozanni.dev` account.

## Static analysis

SonarQube local instance (`~/projects/sonarqube`), key `invoice-extractor`: `bun run sonar`
(coverage lcov + `@sonar/scan`, needs `SONAR_TOKEN`). Scan before a release and after big
changes: new bugs and vulnerabilities get fixed, code smells get weighed.
