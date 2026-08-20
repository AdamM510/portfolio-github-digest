# portfolio-github-digest

A small, real, working example of the kind of job I take on Upwork/Fiverr:
**"API integration sprint" — wire two SaaS products together via their public
APIs and turn raw data into something a human actually wants to read.**

This tool pulls a GitHub org or user's public repo activity and cross-references
it against the **npm registry** to answer a question neither API can answer on
its own: *"of everything this account maintains, what's actually being used in
the wild, and how much?"* It runs with **zero credentials** — clone it, run
one command, get a report.

```
npm install
npm run digest -- expressjs --days 30 --out sample-output
```

That produced the [`sample-output/digest.md`](sample-output/digest.md) and
[`sample-output/digest.json`](sample-output/digest.json) checked into this repo
— real numbers pulled from the live GitHub and npm APIs on 2026-08-20, not
invented figures.

## Why this pairing of APIs

| API | What it gives us | Auth needed |
|---|---|---|
| [GitHub REST API](https://docs.github.com/en/rest) | Repos, stars, forks, open issues, and — via the Search API — recently opened issues/PRs across an entire org | None for public data |
| [npm registry](https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md) + [npm downloads API](https://github.com/npm/registry/blob/master/docs/download-counts.md) | Whether a repo is actually published as a package, its latest version, and real weekly download counts | None |

Individually these are just two data dumps. Joined on repo name, they answer
the question a maintainer or a hiring manager actually cares about: **GitHub
activity tells you what's being *worked on*; npm downloads tell you what's
being *used*.** A repo with heavy recent commit activity but zero downloads is
a different story than a quiet repo with 100M downloads/week — and this tool
puts both numbers in the same table so you don't have to check two sites by
hand.

This is also a clean demonstration of the actual mechanics of an integration
job: paginating a REST API, respecting (and gracefully surviving) rate limits,
joining two independently-shaped datasets on a shared key, and rendering the
result as something readable rather than a raw JSON dump.

## Real example output

Run against the [`expressjs`](https://github.com/expressjs) GitHub organization
(50 public repos) with a 30-day activity window:

| Metric | Value |
|---|---|
| Total repos | 50 |
| Total stars | 130,599 |
| Total forks | 33,646 |
| Total open issues | 1,233 |
| New issues (30d) | 18 |
| New PRs (30d) | 82 |
| Repos published to npm | 42 of 50 |
| Combined npm weekly downloads across all of them | 497,753,936 |

Top npm packages by weekly downloads (real figures, pulled live):

| Package | Weekly downloads |
|---|---|
| [body-parser](https://www.npmjs.com/package/body-parser) | 114,831,433 |
| [serve-static](https://www.npmjs.com/package/serve-static) | 113,976,861 |
| [express](https://www.npmjs.com/package/express) | 109,066,653 |
| [cors](https://www.npmjs.com/package/cors) | 62,959,419 |
| [compression](https://www.npmjs.com/package/compression) | 33,878,662 |

Full report, including the most-active-repos table and every recent issue/PR
with a link and author, is in [`sample-output/digest.md`](sample-output/digest.md).
The structured version consumers can feed into another tool is
[`sample-output/digest.json`](sample-output/digest.json).

## How to run it

Requires Node.js 18.17+ (uses the built-in `fetch`, no HTTP library dependency).

```bash
npm install
npm run digest -- <org-or-username>
```

Options:

```bash
npm run digest -- expressjs                          # last 7 days, writes to ./output
npm run digest -- expressjs --days 30                 # last 30 days
npm run digest -- expressjs --out sample-output        # custom output directory
npm run digest -- sindresorhus --limit 40              # only cross-reference the top 40 repos by stars against npm
```

Other scripts:

```bash
npm test        # run the unit test suite (vitest, no network calls)
npm run build   # compile TypeScript to dist/
npm run typecheck
```

### Optional: raise the GitHub rate limit

By default this makes fully unauthenticated requests, which GitHub caps at
**60 requests/hour** for REST endpoints and a separate, stricter limit for the
Search API. That's enough for a single digest run against most orgs: this tool
makes one account lookup, one repo-list call per 100 repos (paginated), and
one search call for issues/PRs — 3 GitHub API calls for an org the size of
`expressjs` (50 repos). The npm lookups run against a completely separate API
and don't count against GitHub's limit at all.

If you want headroom for repeated runs, set `GITHUB_TOKEN` to any personal
access token — no scopes are required for public data:

```bash
GITHUB_TOKEN=ghp_xxx npm run digest -- expressjs
```

This raises the limit to 5,000 requests/hour. It is entirely optional; the
tool works with zero configuration and zero credentials.

## Error handling / production-readiness notes

This is the part that actually matters for client trust, so it's worth being
explicit about what's handled and how:

- **Rate limits**: every GitHub response is checked for `x-ratelimit-remaining`.
  On a 403/429 with `remaining: 0`, the tool throws a clear message telling
  you when the limit resets and how to raise it with a token — instead of
  crashing on an opaque "403 Forbidden" or a JSON-parse error on an HTML error
  page.
- **Missing accounts**: a 404 from GitHub (typo'd org/user name) is caught and
  reported as "account not found," not a stack trace.
- **Pagination**: the repo listing follows GitHub's 100-per-page pagination
  until a short page signals the end, with a hard safety cap so a malformed
  response can't spin forever.
- **Per-package failures don't abort the run**: if a single npm registry
  lookup fails (network blip, unexpected response shape), that one repo is
  marked "not published" and the digest continues — one flaky package lookup
  shouldn't blow up 49 other repos' worth of work.
- **Concurrency is capped**, not unbounded: npm registry lookups run 6 at a
  time (`mapWithConcurrency` in `src/utils.ts`) rather than firing 50+
  simultaneous requests at a public API that didn't ask for that.

## Architecture

```
src/
  githubClient.ts     GitHub REST API I/O + rate-limit/404/network error handling
                       + pure mapRepo/mapAccount/mapSearchIssue functions (unit tested)
  npmClient.ts         npm registry + npm downloads API I/O, capped concurrency
  digestBuilder.ts      pure fn: RawAccountData -> DigestData (window filtering,
                       sorting, aggregation) — fully unit tested, no network
  reportRenderer.ts     pure fn: DigestData -> Markdown report — fully unit tested
  types.ts             shared shapes for the whole pipeline
  utils.ts             formatNumber/formatDate/daysAgo/mapWithConcurrency
  cli.ts               argument parsing + orchestration + writing digest.json/.md
```

The fetch layer (`githubClient.ts`, `npmClient.ts`) is deliberately kept thin
and separate from the transformation logic (`digestBuilder.ts`,
`reportRenderer.ts`). Everything from `RawAccountData` onward is a plain,
JSON-serializable object with no network dependency — which is exactly what
makes it possible to test the interesting logic (window filtering, sorting,
aggregation, report formatting) against fixture JSON instead of live HTTP
calls.

## Tests

```bash
npm test
```

24 tests, three files, all against fixture data — no live network calls in
the test suite:

- `test/githubClient.test.ts` — the pure `mapAccount`/`mapRepo`/`mapSearchIssue`
  functions against real (trimmed) JSON captured from live GitHub API calls
  against the `expressjs` org.
- `test/digestBuilder.test.ts` — window filtering, archived-repo exclusion,
  most-active sorting, npm attachment, and totals aggregation against a
  synthetic fixture built to exercise edge cases deterministically.
- `test/reportRenderer.test.ts` — Markdown rendering, number formatting, and
  empty-state messaging.

## What I'd extend this into for a real client engagement

- A scheduled run (cron / GitHub Actions) posting the digest to Slack or email
- Historical trend tracking (stars/downloads over time, not just a snapshot)
- Support for GitLab/Bitbucket as a third source
- A lightweight web dashboard instead of Markdown/JSON files

None of that is built here on purpose — this repo is scoped to demonstrate
the core integration skill cleanly, not to be a SaaS product.

---

Built by [Adam Mann](https://github.com/) as a portfolio piece. MIT licensed —
use it, fork it, adapt it.
