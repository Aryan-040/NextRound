# AI Interview Prep Kit

> Paste a job description. Get a personalised interview prep kit in minutes.

Given a job description, a company website URL, and the number of days until the interview, the system crawls the company's site, researches public interview-process discussions, then runs a sequential LLM pipeline to produce:

- **Company brief** — what the company does, sourced from their own pages
- **Role breakdown** — extracted requirements categorised as technical / behavioural / domain, each marked as must-have or nice-to-have
- **Question bank** — categorised questions (technical, behavioural, system-design, company-fit) linked to specific requirements
- **Flashcards** — front/back study cards linked to requirements
- **Day-by-day schedule** — difficulty-ordered study plan for however many days you have

Users can edit, reorder, add, delete, and regenerate any section inline without losing edits elsewhere. A Practice Mode provides confidence-tracked flashcard step-through. A CLI batch runner (`npm run evaluate`) executes the same pipeline programmatically for automated evaluation.

---

## Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript | RSC for fast initial kit loads; App Router enables a clean auth/app route-group split |
| Styling | Tailwind CSS | Utility-first, zero-runtime overhead; custom design tokens map directly to the spec colour palette |
| Drag and drop | `@dnd-kit/core` + `@dnd-kit/sortable` | Accessible, pointer/touch-first DnD without a heavy jQuery dependency |
| Backend | Express 4 + TypeScript + Node 18 | Lightweight HTTP layer; native `EventSource` (SSE) support without a framework abstraction |
| Database | MongoDB via Mongoose 8 | Document model fits the embedded Kit structure (questions, flashcards, schedule all in one document); avoids multi-collection joins for reads |
| Auth | `jsonwebtoken` + `bcryptjs` | Standard HS256 JWT with bcrypt cost-12 hashing; stateless — no session store required |
| LLM | Google Gemini 1.5 Flash (default) or Groq Llama 3.1 | Gemini Flash: generous free tier (15 RPM, 1M TPM/day), fast responses; Groq: higher RPM limits, useful as a fallback |
| Web scraping | Cheerio + Axios | Cheerio's jQuery-like API for link extraction and text stripping; Axios for typed HTTP with interceptors |
| HTML entities | `he` | Robust named and numeric HTML entity decoder (covers edge cases `DOMParser` misses in Node.js) |
| SSRF guard | `ipaddr.js` + `dns.promises` | Resolves hostnames and checks all returned IPs against blocked RFC 1918 / loopback / link-local ranges |
| Robots.txt | `robots-parser` | Standards-compliant robots.txt parsing; avoids re-implementing the spec |
| Input validation | `zod` | Schema-first, TypeScript-native validation with structured error output |
| Property-based tests | `fast-check` | TypeScript-native PBT library; excellent for the deterministic scheduler and coverage checker |
| Test runner | Vitest | ESM-native, fast, shares TypeScript config with the main codebase |
| Monorepo | npm workspaces | Zero-config shared package resolution; no extra tooling needed |
| Deployment | Vercel | Unified deployment platform for full-stack Next.js + Express API via serverless functions |

---

## Prerequisites

- **Node.js 18 or later** (the monorepo `engines` field enforces this)
- **MongoDB** — local (Community Edition) or [MongoDB Atlas](https://www.mongodb.com/atlas) free tier
- **Google Gemini API key** (free) — obtain at https://aistudio.google.com/app/apikey
  - Or a **Groq API key** — obtain at https://console.groq.com
- Optionally a **SerpApi key** if you prefer reliable research results over the free DuckDuckGo scraper

---

## Setup

### 1. Clone and install

```bash
git clone <repository-url>
cd <repository-root>
npm install
```

This installs dependencies for the frontend and backend workspaces in one step.

### 2. Configure environment variables

```bash
cp .env.example backend/.env
```

Edit `backend/.env` and fill in the required values:

```dotenv
MONGODB_URI=mongodb://localhost:27017/interview-prep-kit
JWT_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))">
LLM_PROVIDER=gemini
GEMINI_API_KEY=<your Gemini API key>
```

For the frontend, create `frontend/.env.local`:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:4000/api
```

### 3. Run in development

In two separate terminals:

```bash
# Terminal 1 — backend API (http://localhost:4000)
npm run dev:backend

# Terminal 2 — frontend (http://localhost:3000)
npm run dev:frontend
```

The backend validates all required environment variables at startup and exits with a descriptive error if any are missing — check the terminal output if the server does not start.

### 4. Production deployment

The application is designed to deploy as a unified full-stack application on **Vercel**:

- **Frontend**: Next.js App Router deployed as a standard Vercel Next.js project
- **Backend**: Express API deployed as Vercel serverless functions via `backend/api/index.ts`
- **Routing**: `vercel.json` routes `/api/*` requests to the backend serverless function, all other requests to the Next.js frontend

#### Vercel Configuration

The `vercel.json` at the project root defines:

```json
{
  "version": 2,
  "builds": [
    { "src": "backend/api/index.ts", "use": "@vercel/node" },
    { "src": "frontend/package.json", "use": "@vercel/next" }
  ],
  "routes": [
    { "src": "/api/(.*)", "dest": "backend/api/index.ts" },
    { "handle": "filesystem" },
    { "src": "/(.*)", "dest": "frontend/$1" }
  ],
  "env": {
    "NEXT_PUBLIC_API_URL": "/api"
  }
}
```

This unified deployment means:
- All API requests go to the same domain (no CORS issues)
- Single Vercel project for both frontend and backend
- Environment variables are managed through the Vercel dashboard

#### Environment Variables for Production

Configure these in the Vercel dashboard under **Settings → Environment Variables**:

**Required:**
```dotenv
MONGODB_URI=<your MongoDB Atlas connection string>
JWT_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))">
LLM_PROVIDER=gemini
GEMINI_API_KEY=<your Gemini API key>
NODE_ENV=production
```

**Optional:**
```dotenv
GROQ_API_KEY=<your Groq API key>  # if using LLM_PROVIDER=groq
SERPAPI_KEY=<your SerpApi key>    # if using RESEARCH_PROVIDER=serpapi
```

The frontend automatically uses `/api` as the API URL in production (configured via `vercel.json` env).

> **Note:** SSRF IP-range blocking (RFC 1918, loopback, link-local) is enabled only when `NODE_ENV=production`.

---

## Running the Batch CLI

The batch runner processes a JSON file of cases through the same pipeline the web application uses, then writes results to a JSON output file.

### Usage

```bash
npm run evaluate -- --input <input-path> --output <output-path>
```

**From the repository root** (after running `npm install` and configuring `backend/.env`):

```bash
npm run evaluate -- --input cases.json --output kits.json
```

### Input format

The input must be a JSON array of case objects:

```json
[
  {
    "id": "case-001",
    "jd": "We are looking for a senior software engineer with 5+ years of experience in TypeScript, Node.js, and distributed systems...",
    "company_url": "https://example.com",
    "days": 7
  }
]
```

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique case identifier (included in output for correlation) |
| `jd` | string | Job description text |
| `company_url` | string | Company website URL (absolute, HTTP or HTTPS) |
| `days` | integer ≥ 0 | Number of days until the interview |

### Output format

```json
{
  "version": "1.0",
  "generated_at": "2024-01-15T10:30:00.000Z",
  "kits": [
    {
      "id": "case-001",
      "status": "ok",
      "kit": { ... },
      "error": null
    }
  ]
}
```

Each kit entry has `status: "ok"` with the full kit object, or `status: "failed"` with a `{ code, message }` error object and `kit: null`.

> **Status semantics:** `"failed"` means the pipeline threw an unhandled exception or the case had invalid fields. Incomplete research (no hiring page found, empty passages) still results in `"ok"` with the affected kit fields set to `null` or empty arrays.

### Performance

The batch runner processes cases sequentially. Five cases complete within 15 minutes including rate-limit retries. Each rate-limit response triggers exponential backoff (up to 60 s per attempt, max 3 retries per case before recording `"failed"`).

---

## Architecture

### Shared Package Structure

The shared types, validators, and serializers that define the Kit schema are located in `backend/src/shared/`. While the project uses npm workspaces, the shared code is **inlined directly into the backend source tree** rather than maintained as a separate workspace package.

**Why inlined?** Vercel's serverless function build system cannot reliably resolve npm workspace dependencies (`@interview-prep/shared`) at runtime. By placing shared code directly in `backend/src/shared/`, it compiles as part of the standard backend TypeScript build and deploys without dependency resolution issues.

The frontend does not import these types — it interacts with the backend solely through REST/SSE APIs with runtime validation, keeping the frontend loosely coupled to backend data structures.

### Monorepo structure

```
/
├── frontend/               # Next.js 14 (App Router) — TypeScript
│   ├── app/
│   │   ├── (auth)/         # Login, register — unauthenticated layout
│   │   └── (app)/          # Authenticated layout with sidebar
│   │       ├── dashboard/
│   │       ├── create/
│   │       └── kits/[id]/
│   │           └── practice/
│   ├── components/
│   │   ├── ui/             # Button, Input, Badge, Spinner primitives
│   │   ├── builder/        # KitBuilder, QuestionCard, FlashcardCard, etc.
│   │   ├── practice/       # PracticeMode, FlashcardViewer, ConfidenceRater
│   │   ├── create/         # CreateForm, BatchUpload, ProgressTracker
│   │   └── layout/         # AppShell, Sidebar, AuthGuard
│   └── lib/
│       ├── api.ts           # Typed fetch wrappers (attaches JWT)
│       ├── auth.ts          # localStorage JWT helpers
│       └── sse.ts           # useSSEProgress hook (EventSource)
│
└── backend/                # Express 4 + TypeScript
    ├── api/
    │   └── index.ts        # Vercel serverless entry point
    └── src/
        ├── routes/          # auth.ts, kits.ts, practice.ts
        ├── middleware/      # authenticate, ssrfGuard, sanitise, errorHandler
        ├── services/        # crawler, researchAgent, extractionPipeline,
        │                    # coverageChecker, scheduler, llmClient
        ├── models/          # User, Kit, FlashcardProgress (Mongoose)
        ├── shared/          # Inlined shared types and validators
        │   ├── types.ts     # Kit, Requirement, Question, Flashcard, etc.
        │   ├── validator.ts # validateKit(obj) → Kit | ValidationError
        │   ├── serialiser.ts # serialiseKit(kit) → string
        │   └── index.ts     # Public API exports
        └── scripts/
            └── evaluate.ts  # CLI batch runner
```

### Request flow

```
Browser → Next.js (RSC / client component)
       → REST API  (Bearer JWT) → Express
                                 → CrawlerService → external websites
                                 → ResearchAgent  → search APIs
                                 → ExtractionPipeline → LLM
                                 → CoverageChecker (deterministic)
                                 → Scheduler (deterministic)
                                 → validateKit (backend/src/shared)
                                 → MongoDB (Mongoose)
       ← SSE stream (pipeline progress)
```

---

## LLM Provider

### Configuration

Set `LLM_PROVIDER` in `backend/.env` to `gemini` (default) or `groq`.

| Provider | Model | API key variable | Notes |
|---|---|---|---|
| `gemini` | `gemini-1.5-flash` (configurable via `GEMINI_MODEL`) | `GEMINI_API_KEY` | Default. Free tier: 15 RPM, 1M TPM/day |
| `groq` | `llama-3.1-70b-versatile` (configurable via `GROQ_MODEL`) | `GROQ_API_KEY` | Higher RPM limits; lower max context window |

The pipeline calls the LLM sequentially (one call at a time per pipeline run) to stay within free-tier rate limits. Each call is retried up to 3 times on JSON parse failure (with a correction instruction appended) and up to 5 times on a 429 rate-limit response (exponential backoff: 2 s → 4 s → 8 s → 16 s → 32 s, capped at 60 s).

### Prompt safety

All externally sourced content (job descriptions, crawled pages, research passages) is wrapped in `<external-content>` / `</external-content>` delimiters in every LLM prompt, with a system-level instruction stating that this content is data to be processed and must not be interpreted as instructions. This mitigates prompt-injection risks from adversarial web content.

---

## Retrieval Approach

### Company site crawling

The `CrawlerService` uses a scored BFS traversal:

1. **Fetch root URL** and parse all `<a href>` tags with Cheerio.
2. **Score each link** on a 0–10 scale using keyword matching:
   - Exact path segment match (e.g. `/about`, `/careers`) → +3 pts
   - Keyword in link text → +2 pts
   - Keyword in URL → +1 pt
   - Keywords: `about`, `careers`, `hiring`, `jobs`, `culture`, `engineering blog`
3. **Queue assignment**: links scoring ≥ 5 enter the high-priority queue; others the low-priority queue.
4. **BFS traversal**: high-priority queue is processed first; remaining capacity is filled from the low-priority queue. Configurable `maxDepth` (default 3) and `maxPages` (default 50) prevent runaway crawls.
5. **Safety and compliance**: `robots.txt` is fetched and cached per domain; disallowed URLs are skipped. SSRF guard blocks private/loopback IPs in production. Rate limiter: 2 requests/second per domain (token bucket). Retry on 429/5xx: exponential backoff 1 s → 2 s → 4 s → 8 s, up to 3 retries.
6. **Content filtering**: responses with `Content-Type` other than `text/html` or body > 5 MB are discarded without processing.
7. **Text extraction**: `<script>` and `<style>` blocks are removed, all remaining HTML tags are stripped, HTML entities are decoded with `he`, and whitespace is normalised before text is handed to the pipeline.

### Interview discussion research

`ResearchAgent` searches for public discussion of the company's interview process:

- **Query**: `"${companyName} interview process site:glassdoor.com OR site:reddit.com OR site:blind.com"`
- **DuckDuckGo** (default, no API key): scrapes Instant Answers endpoint — free but occasionally returns fewer results.
- **SerpApi** (set `RESEARCH_PROVIDER=serpapi`): reliable structured results via `SERPAPI_KEY`, 100 free searches/month.
- Extracts up to 5 relevant passages; applies the same HTML sanitisation as the crawler before passing text to the LLM.
- On zero results or source unreachable: records the absence and continues; the LLM generates questions from the job description and crawled content only.

---

## Pipeline

The extraction pipeline executes these named stages in sequence. Each LLM stage is a separate call with distinct, single-purpose instructions — never combined into one monolithic prompt.

```
1.  crawl                → CrawlerService              (no LLM)
2.  research             → ResearchAgent               (no LLM; search API)
3.  extract-requirements → LLM Call A                  → Requirement[]
4.  company-brief        → LLM Call B                  → CompanyBrief
5.  generate-questions   → LLM Calls C1–C4 per category → Question[]
6.  generate-flashcards  → LLM Call D                  → Flashcard[]
7.  coverage-check       → CoverageChecker             (deterministic — no LLM)
8.  gap-fill             → LLM Call E (if needed)      → additional Question[]
    ↑  repeat 7–8 up to 5 passes
9.  schedule             → Scheduler                   (deterministic — no LLM)
10. validate             → validateKit                 (shared package)
11. persist              → MongoDB
```

**Why separate LLM calls?** Each stage can be independently retried on rate-limit or JSON-parse failure without re-running the full pipeline. It also makes section regeneration (e.g. regenerating only the company brief) straightforward: re-run only Call B.

**SSE progress**: the frontend subscribes to `GET /api/kits/:id/progress`, which streams `StageEvent` objects as each stage starts, completes, or fails. This gives the user live progress without polling.

---

## Pinned State (User Edits During Regeneration)

Every `Question` and `Flashcard` carries a `pinned: boolean` field (default `false`). This field:

- Is set to `true` by the backend whenever a PATCH request edits a specific question or flashcard.
- Is set to `true` for any item the user manually adds via the Builder.
- Is **never** set back to `false` by any automated process — only deleting the item removes it from the pinned set.

When a question category is regenerated, the section regeneration service:

1. Partitions the category into `pinned` and `non-pinned` questions.
2. Runs the LLM question-generation call targeting `(maxPerCategory − pinnedCount)` new questions.
3. Assigns new sequential IDs to the generated questions.
4. Preserves all pinned questions in their original relative order; regenerated questions fill the remaining positions.
5. Re-runs the coverage checker and rebuilds the schedule with the updated question set.

The Builder renders a lock icon (`aria-label="Edited by you"`) on every pinned question and flashcard, making it visually clear which items will survive a regeneration.

---

## Schedule Algorithm

The `buildSchedule` pure function (no LLM, no I/O) allocates questions across days:

1. **Partition**: separate must-have-requirement questions from nice-to-have-requirement questions.
2. **Even-distribution check**: compute `evenSlots = ceil(mustCount / days) * days`. If `mustCount + niceCount ≤ evenSlots`, include both; otherwise include only must-have questions.
3. **Overflow**: if must-have questions alone exceed even-distribution capacity, include all must-have questions and log a warning — the schedule may exceed even distribution.
4. **Difficulty sort**: sort all active questions by `difficulty DESC` (3 first, then 2, then 1). Within the same difficulty level, sort by the question's position in the `role.requirements` array (requirements appearing earlier in the JD come first).
5. **Spaced repetition for long schedules**: if `days > question count`, repeat must-have questions in round-robin rotation until there is at least one question per day.
6. **Round-robin distribution**: assign questions to days via `day = index % daysAvailable`. This guarantees the difference between the highest and lowest per-day question count is at most 1.
7. **Minutes**: `day.minutes = 15 × day.question_ids.length` (15 minutes estimated per question).
8. **Focus**: each day's `focus` field is computed from the most-frequent `kind` among requirements linked to that day's questions.

---

## Key Design Decisions

### Embedded documents in MongoDB

Questions, flashcards, and the schedule are embedded in the Kit document rather than stored in separate collections. A single document fetch returns the entire kit — no joins needed. The trade-off is MongoDB's 16 MB document limit. In practice a kit with 200 questions at ~500 bytes each is ~100 KB, well within the limit.

### SSE instead of WebSockets for pipeline progress

Pipeline progress is strictly unidirectional (server → client). Server-Sent Events are simpler: standard HTTP, no upgrade handshake, works over HTTP/2 multiplexing. The trade-off is that SSE is unidirectional — if interactive pipeline control (e.g. cancel) were needed, WebSockets would be required.

### Coverage loop capped at 5 passes

The gap-fill loop runs a maximum of 5 passes before recording any remaining uncovered must-have requirements in `coverage.uncovered_requirement_ids`. This caps LLM API usage at predictable levels. In practice a well-prompted initial pass leaves fewer than 2 requirements uncovered, so 5 passes is a conservative ceiling.

### Deduplication by SHA-256 hash

A duplicate detection fingerprint is computed as `sha256(normalise(jobDescription) + '|' + normalise(companyUrl))` where `normalise` = lowercase + trim whitespace. The hash is stored as `dedupeKey` and indexed as a unique compound index on `(userId, dedupeKey)`. On collision, the API returns 409 with the existing kit's ID and creation date so the client can offer "Open existing" or "Create new".

### Scheduler spaced repetition (not SM-2)

When the user requests more days than there are questions, must-have questions are repeated in round-robin rotation. This is a simple approximation — not a true SM-2 interval algorithm. SM-2 would couple the schedule to prior practice ratings, complicating regeneration. The schedule is generated once; confidence-tracked Practice Mode handles adaptive repetition going forward.

### No JWT refresh tokens

Sessions expire after 24 hours; users re-authenticate. This is a deliberate scope reduction. A production system would implement refresh tokens.

---

## Known Limitations

- **Free LLM tier rate limits**: Gemini Flash free tier allows 15 requests per minute. Large batch runs may hit this limit and retry with exponential backoff, increasing total run time.
- **DuckDuckGo research reliability**: the DuckDuckGo scraper may return inconsistent results and does not always surface Glassdoor/Reddit passages. Use `RESEARCH_PROVIDER=serpapi` for more reliable research.
- **No auth provider integration**: authentication uses locally managed JWTs with no OAuth/OIDC provider. There is no "sign in with Google" or password reset flow.
- **No JWT refresh tokens**: users must re-authenticate after 24 hours.
- **Crawler limitations**: JavaScript-rendered pages (SPAs) are not crawled — the crawler fetches server-rendered HTML only (via Cheerio + Axios). Company sites built entirely on client-side rendering may not yield useful content.
- **robots.txt fetch failure is permissive**: if `robots.txt` cannot be fetched, all paths are treated as allowed. This is the standard default per the robots exclusion protocol.
- **No background job queue**: pipeline runs are attached to HTTP request lifecycle. If the server restarts mid-pipeline, in-progress kits will be stuck in `generating` status and must be retried manually.
- **Batch runner requires environment variables**: the CLI runner uses the same LLM and database credentials as the web server. Configure `backend/.env` before running `npm run evaluate`.
- **No rate limiting on API endpoints**: the backend does not rate-limit authentication or kit creation endpoints. A production deployment should add rate limiting at the proxy or middleware layer.
- **SSRF guard is production-only**: the IP-range blocking for private/loopback addresses is disabled when `NODE_ENV` is not `production`, allowing the crawler to reach localhost in development. Never run the development server against untrusted input in a shared environment.

---

## Running Tests

```bash
# Run all test suites
npm test

# Run only backend tests
npm test --workspace=backend
```

Tests are run with Vitest. The backend test suite covers:

| File | What is tested |
|---|---|
| `routes/__tests__/auth.test.ts` | JWT middleware (valid, expired, malformed, wrong scheme, query-param token); `POST /register` validation and duplicate handling; `POST /login` credential verification and anti-enumeration |
| `routes/__tests__/kits.test.ts` | `POST /api/kits` input validation, 409 deduplication, `forceCreate` bypass; `GET /:id` ownership (403 for non-owner); `PATCH /:id` pinning of edited questions/flashcards; `DELETE /:id` kit + FlashcardProgress cleanup; `DELETE /:id/flashcards/:id` and `DELETE /:id/questions/:id` single-item removal |
| `routes/__tests__/practice.test.ts` | `GET /practice/deck` ordering (least-confident first, unseen = 0, lexicographic tiebreak), `coveredIds` computation; `POST /practice/rate` mean recomputation, validation, 404 on missing flashcard, 403 on non-owner |
| `services/__tests__/coverageChecker.test.ts` | Deterministic coverage: all covered, partial, empty, nice-to-have exclusion; property-based (fast-check × 100) |
| `services/__tests__/scheduler.test.ts` | Exact day count, must-have inclusion, difficulty ordering, minutes invariant, spaced repetition; property-based (fast-check × 100) |
| `scripts/__tests__/evaluate.test.ts` | CLI batch runner: output shape, valid/invalid cases, missing args, non-existent file, non-array input |

---

## Practice Mode

### Deck Ordering (Confidence-Based Prioritisation)

Each time a practice session starts, the backend computes the deck order using `GET /api/kits/:id/practice/deck`:

1. Load all flashcard IDs from the kit.
2. Load all `FlashcardProgress` documents for `(userId, kitId)`.
3. Map each flashcard ID to its `meanConfidence` (arithmetic mean of all historical confidence ratings). Cards with no prior rating default to `0`.
4. Sort ascending by `meanConfidence` — cards the user found hardest (or never reviewed) come first.
5. Lexicographic tiebreak on flashcard ID for deterministic ordering.

Confidence levels: `1 = Again` (hardest), `2 = Hard`, `3 = Good`, `4 = Easy`.

The `coveredIds` field in the response lists flashcard IDs with `meanConfidence > 0` (seen at least once). The frontend uses this to show a "seen before" badge in the deck position indicator.

After every card is rated, a `SessionSummary` shows per-confidence-level counts and offers a "Practice Again" button that re-fetches a freshly ordered deck.

### Confidence History Persistence

Each `POST /practice/rate` call upserts a `FlashcardProgress` document, pushing `{ confidence, ratedAt }` onto the `ratings` array and updating the cached `meanConfidence`. This survives page refreshes and sessions.

---

## Duplicate Kit Handling

When the user submits a job description and company URL that matches an existing kit for their account, the API returns `409` with the existing kit's metadata. The frontend shows a `DuplicateKitModal` offering two actions:

- **Open existing kit** — navigates to the existing kit.
- **Create new kit** — re-submits with `forceCreate: true`, which bypasses the deduplication check and creates a fresh kit with a randomised `dedupeKey` suffix so the unique compound index is not violated.

---

## Requirements & Coverage UI

The kit builder page includes a collapsible **Requirements & Coverage** panel positioned above the Company Brief section. It shows:

- All extracted requirements grouped by **must-have** (with coverage status) and **nice-to-have**.
- For each requirement: its stable ID (e.g. `r1`), extracted text, kind badge (Technical / Behavioural / Domain), and priority label.
- A progress bar showing what percentage of must-have requirements have at least one covering question, and how many coverage passes were run.
- A "No question yet" warning badge on any must-have requirement that remains uncovered after all coverage passes.

The panel is collapsed by default to avoid visual clutter but is always available for inspection.

---

MIT

## License

MIT
