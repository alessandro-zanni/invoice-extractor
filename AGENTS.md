# Project instructions — Invoice Extractor

Portfolio project for AI engineering roles, run as if it were in production: extract structured
data from invoices and receipts (PDF or photo), check it with deterministic rules, route between
a cheap and a strong model, and send what still fails to human review.

The story it has to tell, backed by eval numbers: *Haiku extracts, rules check, Opus steps in
only when checks fail: X% of the Opus-only cost at Y% accuracy; human corrections become new
eval cases.*

## Stack

| Layer | Choice |
|---|---|
| App | Next.js 16 App Router, TypeScript, Tailwind v4, bun |
| LLM | Claude API: `claude-haiku-5-5` first, `claude-opus-5-5` on failed checks; structured output via Zod (`betaZodOutputFormat`) |
| Data | Supabase (Postgres + Storage + Auth), org "Invoice Extractor" on the dedicated account, `eu-central-1`: staging `wymqwkotbpqpdwmyzxaw`, prod `ghoitleeytzxdxqcbxym`. Local stack on ports 5652x |
| Hosting | Vercel team AZ Projects, `fra1`, Git integration (each project builds only its branch), Vercel login on all deploys. Prod `main`: invoices.alessandrozanni.dev. Staging `develop`: staging-invoices.alessandrozanni.dev. DNS: CNAME on Cloudflare, DNS only |

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
- [x] 3. Golden set (synthetic 50, CORD 29, FATURA 30, SROIE 30 external) + eval runner, test-split
  numbers recorded below
- [x] 4. Routing Haiku → Opus → `needs_review` (code done; strategy comparison needs the eval)
- [x] 5. Review UI (login, upload, list, review page with flagged fields); corrections → golden set
  via `bun run golden:reviews`
- [x] 6. Prod: rate limit, cost logs, spend limit, Vercel deploy
- [ ] 7. Showcase: README with numbers table, diagram, GIF; link from the portfolio. README and demo
  GIF done 2026-11-03, GitHub default branch is `main`

## Commands

```bash
bun dev                     # app on :3000 (check the port in the log if others are running)
bun test                    # unit tests
bun run lint && bun run typecheck
curl -F file=@invoice.pdf localhost:3000/api/extract
bun run golden              # regenerate synthetic invoices (needs CHROME, default Brave)
bun run golden:sroie        # download SROIE into data/external (research-only, not committed)
SUPABASE_URL=… SUPABASE_SECRET_KEY=… bun run golden:reviews   # corrections → data/external/reviews
supabase start              # local stack; `bun run db:types` after a migration
scripts/cloud-setup.sh <ref> <vercel-project> <site-url>   # migrations, auth, advisors, Vercel env
bun run eval --strategy haiku|opus|routed --split dev|test|all [--limit N]
```

## Eval notes

- `data/golden/syn-*`: synthetic IT/ES invoices from a seeded generator, exact ground truth by
  construction. 1 in 3 is a degraded JPEG "photo"; 7 of 30 carry a printed error (total, subtotal,
  line, tax id) and must end in review. The generator asserts that clean ones pass validation and
  the others fail.
- Split: 20 dev, 10 test. Tune on dev only; the README numbers come from test.
- `syn-031`…`syn-050`: hard variants in rotation (multi-rate VAT, line discounts, two pages,
  photo rotated 90°, low-res photo), no printed errors. Regenerating keeps `syn-001`…`syn-030`
  identical: variants draw random numbers only for themselves. The generator deletes only `syn-*`.
- `data/golden/cord-*`: 29 real receipts from CORD v2 (CC BY 4.0), scored on `total` and `lines`
  only (`fields` in the case JSON), `expect_review: null`. Add-ons printed under an item are
  separate lines, in the ground truth and in the prompt.
- Ground truth for documents with printed errors is the printed value: the model must copy, not fix.
- Dev results (2026-11-03, synthetic dev, 33 docs): Haiku 87.9% docs fully right, 3 false alarms
  (low-res, rot90), $0.019; Opus 97.0%, 1 false alarm, $0.69; routed 97.0%, 0 false alarms,
  $0.14 (20% of Opus). Small n: one document is 3 points.
- `data/golden/fat-*`: 30 FATURA invoices (CC BY 4.0, English, 50 layouts), scored on total,
  currency, issue date, invoice number (no line items in its labels).
- `data/external/sroie/`: 30 SROIE receipts (research-only licence): `bun run golden:sroie`
  downloads them, gitignored, never committed. The runner reads `data/external/*` when present.
  Saved runs keep SROIE scores but redact what was read from the receipts (`invoice`, issue text).
- **Test split, first run (2026-11-03, 46 docs, never used for tuning):**

  | Strategy | Docs fully right | False alarms | Printed errors caught | Cost | p50 / p95 |
  |---|---|---|---|---|---|
  | Haiku only | 87.0% | 1/15 | 2/2 | $0.021 | 2.2 s / 5.0 s |
  | Opus only | 93.5% | 1/15 | 2/2 | $0.76 | 3.7 s / 5.3 s |
  | Routed | 89.1% | 0/15 | 2/2 | $0.28 (36% of Opus) | 4.3 s / 7.1 s |

  Routed vs Opus is 2 docs: one is Opus run-to-run variance (cord-001), one a silent Haiku error
  that breaks no check (sroie-009). Routing only catches errors that break the arithmetic.
- FATURA totals don't add up on the page (lines − discount ≠ total, no tax): validation rightly
  flags all of them, so routing sends 100% of FATURA to Opus. A dataset defect, not a model one.
- Known waste: routing escalates documents with printed errors to Opus, which can't fix them.
- Routing is only as good as validation precision: rules that don't fit a document type escalate
  everything. On FATURA 100% goes to Opus (document-level discounts have no field; some dates
  before 2000); on SROIE 50% (rounding, VAT-inclusive prices) after foreign tax ids became
  "not checkable" instead of "invalid" (was 90%).
- Runs land in `eval/runs/`. Cost per doc on dev (2026-11-03): Haiku $0.0004, Opus $0.015.

## App notes

- Accounts are created by the owner (Supabase dashboard → Authentication → Add user): signup is
  closed in `config.toml` and on both cloud projects, min password 10.
- `src/proxy.ts` puts everything behind login; `/api/*` answers 401 instead of redirecting.
- Files live in the private `documents` bucket under `<user_id>/<document_id>.<ext>`; RLS on the
  table and on storage restricts every user to their own rows and files (verified: another user
  gets 404).
- Uploads are processed in `src/lib/documents.ts`, shared by the form and `POST /api/extract`.
- Per-user limits in `src/lib/limits.ts` (20 uploads/hour, $1/day of extraction cost, checked on
  the user's own `documents` rows, 429 when hit); the Anthropic workspace limit ($20/month) caps
  everyone. Each extraction logs one JSON line (`"event":"extraction"`, cost and ms per attempt)
  to the Vercel runtime logs.
- A correction is the ground truth: checks re-run on it only to show what still doesn't add up.
- `supabase link` should point at staging when idle, so a stray `db push` never hits prod.
- Free plan: both Supabase projects (staging and prod) pause after ~7 days without traffic and the
  app can't sign in. Restore with `POST https://api.supabase.com/v1/projects/<ref>/restore`
  (`SUPABASE_ACCESS_TOKEN` from `.envrc`); check before a demo or an interview.
- Local UI checks: `supabase start`, then sign in as `test@local.test` (local stack only, created
  through the local admin API; recreate it after `supabase db reset`).
- Demo GIF (`docs/demo.gif`): Playwright MCP screenshots per step into `~/.playwright-mcp/gif/`
  (01 login … 05 list), then
  `ffmpeg -f concat -safe 0 -i list.txt -vf "fps=10,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer" -loop 0 docs/demo.gif`
  with `list.txt` holding `file …` / `duration …` pairs.

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
