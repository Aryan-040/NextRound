# Implementation Plan: AI Interview Prep Kit

## Overview

Implement a full-stack monorepo web application (Next.js 14 + Express + MongoDB) that generates personalised interview preparation kits from a job description and company URL. The implementation follows the build order: shared package → backend foundation → deterministic core → services → routes → frontend → tests → docs.

---

## Tasks

- [x] 1. Monorepo scaffold and shared package
  - [x] 1.1 Create monorepo directory structure and root package.json
    - Create root `package.json` with workspaces: `["frontend", "backend", "packages/*"]`
    - Create `packages/shared/package.json` with name `@interview-prep/shared`, `main: "src/index.ts"`, and a `build` script
    - Create `frontend/package.json` with Next.js 14, React 18, Tailwind CSS, `@dnd-kit/core`, `@dnd-kit/sortable` dependencies
    - Create `backend/package.json` with Express, Mongoose, jsonwebtoken, bcryptjs, cheerio, zod, he, ipaddr.js, robots-parser, axios dependencies
    - Create `tsconfig.json` files for root, frontend, backend, and packages/shared with `strict: true` and path aliases
    - Create `.gitignore` ignoring `node_modules`, `.env`, `dist`, `.next`
    - _Requirements: 18.4_

  - [x] 1.2 Implement shared types and Kit schema
    - Create `packages/shared/src/types.ts` defining all interfaces: `Requirement`, `Question`, `Flashcard`, `DayEntry`, `Kit`, `KitDocument`, `RatingEntry`, `FlashcardProgressDocument`
    - Include `pinned: boolean` on `Question` and `Flashcard` interfaces (default `false`)
    - Include `dedupeKey: string` on `KitDocument`
    - Export all types from `packages/shared/src/index.ts`
    - _Requirements: 8.1–8.10, 11.2_

  - [x] 1.3 Implement kit schema validator
    - Create `packages/shared/src/validator.ts` implementing `validateKit(obj: unknown): Kit | ValidationError`
    - Validate all required fields from Appendix A: `source`, `company_brief`, `role`, `questions`, `flashcards`, `schedule`, `coverage`
    - Validate `difficulty` is integer 1–3; `minutes` is an integer; all `question_ids` in schedule reference existing question IDs; all `requirement_ids` in questions reference existing requirement IDs
    - Return structured `ValidationError` with `field` and `message` for every invalid field
    - _Requirements: 8.1–8.10, 19.1, 19.4, 19.5_

  - [x] 1.4 Implement kit serialiser
    - Create `packages/shared/src/serialiser.ts` implementing `serialiseKit(kit: Kit): string`
    - Serialise to JSON conforming to Appendix A field order; ensure deterministic key ordering
    - Export from `packages/shared/src/index.ts`
    - _Requirements: 19.2, 19.3_

- [x] 2. Backend foundation
  - [x] 2.1 Set up Express app skeleton and config validation
    - Create `backend/src/app.ts` with Express app, CORS (from `FRONTEND_URL`), JSON body parser, helmet, and error handler middleware
    - Create `backend/src/config.ts` with startup env validation — exit with non-zero code if required vars (`MONGODB_URI`, `JWT_SECRET`, `LLM_PROVIDER`, and provider-specific API key) are missing
    - Create `backend/src/server.ts` that connects to MongoDB then starts the Express server on `PORT`
    - Add `"start"` and `"dev"` scripts to `backend/package.json`
    - _Requirements: 18.1, 18.2_

  - [x] 2.2 Implement MongoDB connection and base error handling
    - Create `backend/src/db.ts` with Mongoose connect/disconnect helpers using `MONGODB_URI`
    - Create `backend/src/middleware/errorHandler.ts` that maps `HttpError` instances to status + `{ error, field? }` JSON responses; maps all other errors to 500 with sanitised message
    - Create `backend/src/errors.ts` defining `HttpError` class with `status`, `message`, `field?` properties
    - _Requirements: 16.1, 16.2_

- [x] 3. Auth routes and User model
  - [x] 3.1 Implement User Mongoose model
    - Create `backend/src/models/User.ts` with schema: `email` (unique, lowercase, trim), `passwordHash` (bcrypt, cost 12), timestamps
    - Add Mongoose indexes: unique on `email`
    - _Requirements: 1.1, 1.8_

  - [x] 3.2 Implement JWT authenticate middleware
    - Create `backend/src/middleware/authenticate.ts` verifying Bearer JWT with `JWT_SECRET` (HS256)
    - Attach `req.user = { userId, email }` on success; return 401 on missing/expired/malformed token
    - _Requirements: 1.4, 1.5_

  - [x] 3.3 Implement auth routes (register and login)
    - Create `backend/src/routes/auth.ts` with `POST /api/auth/register` and `POST /api/auth/login`
    - Register: validate email uniqueness, password 8–128 chars, bcrypt hash (cost 12), create User, return `{ token, user: { id, email } }`
    - Login: find by email, compare hash, return JWT (24h expiry); return 401 with generic message on failure (no field distinction between bad email vs bad password)
    - Register 400 on duplicate email, malformed email, or password outside range — include `field` in error response
    - Mount router on `app.ts`
    - _Requirements: 1.1, 1.2, 1.3, 1.8_

- [x] 4. Deterministic core modules
  - [x] 4.1 Implement CoverageChecker
    - Create `backend/src/services/coverageChecker.ts` implementing the `checkCoverage(requirements, questions): CoverageResult` pure function
    - Filter `must` requirements; compute set of covered IDs from `questions.flatMap(q => q.requirement_ids)`; return `uncoveredRequirementIds` and `coveredRequirementIds`
    - No I/O, no LLM calls — pure deterministic function
    - _Requirements: 9.1, 9.4_

  - [x] 4.2 Implement Scheduler
    - Create `backend/src/services/scheduler.ts` implementing `buildSchedule(questions, requirements, daysAvailable): Schedule` pure function
    - Implement all 7 steps from the design: partition must/nice, even-distribution slot check, overflow handling, sort by difficulty DESC then requirement position ASC, spaced repetition for days > questions, round-robin distribute, compute `minutes` and `focus` per day
    - Implement `deriveFocus` helper computing most frequent `kind` among linked requirements
    - No I/O, no LLM calls — pure deterministic function
    - _Requirements: 10.1–10.9_

  - [x] 4.3 Checkpoint — verify deterministic modules compile
    - Run `tsc --noEmit` in `backend/` and confirm CoverageChecker and Scheduler compile without errors
    - Ensure all types imported from `@interview-prep/shared` resolve correctly

- [x] 5. Security utilities
  - [x] 5.1 Implement SSRF guard
    - Create `backend/src/middleware/ssrfGuard.ts` implementing `isUrlSafe(url: string): Promise<boolean>`
    - Parse URL; reject non-http/https protocols; resolve hostname with `dns.lookup`; check each resolved IP against RFC 1918, loopback, link-local, and IPv6 equivalents using `ipaddr.js`
    - Guard is active only when `NODE_ENV === 'production'` (returns `true` otherwise)
    - Export as Express middleware for URL validation routes
    - _Requirements: 17.1_

  - [x] 5.2 Implement HTML sanitiser
    - Create `backend/src/middleware/sanitise.ts` implementing `sanitise(html: string): string`
    - Remove `<script>` and `<style>` elements with content; strip all remaining tags and attributes; decode HTML entities using `he`; normalise whitespace
    - _Requirements: 17.5_

- [x] 6. Crawler service
  - [x] 6.1 Implement link scoring and BFS traversal
    - Create `backend/src/services/crawler.ts` implementing `CrawlerService` with `crawl(companyUrl, options?)` method
    - Implement link scoring: exact path segment match = 3 pts (keywords: about, careers, hiring, jobs, culture, engineering blog), word in link text = 2 pts, word in URL = 1 pt; cap at 10; deduplicate links
    - Build two queues: high-priority (score ≥ 5) and low-priority; BFS processes high-priority first then fills from low-priority; respect `maxDepth` (default 3) and `maxPages` (default 50)
    - Call `isUrlSafe` before every outbound fetch; skip disallowed URLs
    - _Requirements: 5.1, 5.2, 5.4_

  - [x] 6.2 Implement crawler HTTP layer (rate-limiting, robots, content filtering)
    - Add `robots-parser` integration: fetch and cache `robots.txt` per domain; skip disallowed paths; treat fetch failure as all-allowed
    - Add token-bucket rate limiter: 2 req/s per domain
    - Add retry logic: 429/5xx → exponential backoff 1 s → 2 s → 4 s → 8 s, 3 retries
    - Validate `Content-Type` begins with `text/html`; reject if absent or wrong type
    - Reject response bodies > 5 MB
    - Apply `sanitise()` to extracted text before returning
    - _Requirements: 5.3, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11_

- [x] 7. Research agent
  - [x] 7.1 Implement ResearchAgent with DuckDuckGo fallback
    - Create `backend/src/services/researchAgent.ts` implementing `ResearchAgent` with `research(companyName, companyUrl): Promise<ResearchResult>`
    - Build search query: `"${companyName} interview process site:glassdoor.com OR site:reddit.com OR site:blind.com"`
    - Implement DuckDuckGo Instant Answers adapter when `RESEARCH_PROVIDER=duckduckgo` (no API key required)
    - Implement SerpApi adapter when `RESEARCH_PROVIDER=serpapi` using `SERPAPI_KEY`
    - Extract up to 5 relevant passages; apply `sanitise()` before returning; never pass raw HTML
    - On zero results set `found: false`; on source unreachable skip and continue with other sources
    - Apply exponential backoff on rate-limit responses
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [x] 8. LLM client abstraction
  - [x] 8.1 Implement LLMClient interface and retry logic
    - Create `backend/src/services/llmClient.ts` defining `LLMClient` interface: `complete(prompt: LLMPrompt): Promise<string>`
    - Implement JSON-parse retry: up to 3 attempts, appending `"Your previous response was not valid JSON…"` on failure
    - Implement rate-limit backoff: 2 s → 4 s → 8 s → 16 s → 32 s → 60 s, 5 retries
    - Create `backend/src/services/llmAdapters/gemini.ts` implementing `LLMClient` for Gemini 1.5 Flash using `GEMINI_API_KEY` and `GEMINI_MODEL`
    - Create `backend/src/services/llmAdapters/groq.ts` implementing `LLMClient` for Groq using `GROQ_API_KEY` and `GROQ_MODEL`
    - Export `createLLMClient()` factory that reads `LLM_PROVIDER` from config and returns the correct adapter
    - _Requirements: 7.6, 7.7_

- [x] 9. Extraction pipeline
  - [x] 9.1 Implement LLM calls A and B (requirement extraction and company brief)
    - Create `backend/src/services/extractionPipeline.ts` with the `runPipeline(options: PipelineOptions): Promise<Kit>` export
    - Implement Call A: requirement extraction with output schema `{ requirements: Requirement[] }`; detect priority signal words; assign stable IDs `r1`, `r2`, …; wrap JD in `<external-content>` tags
    - Implement Call B: company brief generation; handle no-crawl-data case with explicit "No public company information was found" message
    - Emit `StageEvent` via `onProgress` for `crawl`, `research`, `extract-requirements`, and `company-brief` stages
    - _Requirements: 7.1, 7.2, 7.3, 7.8, 7.9_

  - [x] 9.2 Implement LLM calls C1–C4 (question generation per category)
    - Implement four parallel-dispatched question generation calls (one per category: technical, behavioural, system-design, company-fit)
    - Compute category allocation: if hiring page found with dominant signal, pass `"Generate at least ${Math.ceil(targetTotal * 0.4)} questions for this category"` in that category's prompt
    - Enforce 2–5 questions per call in the prompt; assign stable IDs `q1`, `q2`, …
    - Emit `StageEvent` for each `generate-questions-*` stage
    - _Requirements: 7.1, 7.4, 7.5_

  - [x] 9.3 Implement LLM call D (flashcard generation) and coverage + gap-fill loop
    - Implement Call D: flashcard generation with output schema `{ flashcards: Flashcard[] }`; assign stable IDs `f1`, `f2`, …
    - Implement coverage loop: call `checkCoverage`, if uncovered IDs found run Call E (gap-fill with explicit uncovered IDs list), re-run coverage; loop up to 5 passes
    - Populate `coverage.uncovered_requirement_ids` and `coverage.passes` on the final kit
    - Emit `StageEvent` for `generate-flashcards`, `coverage-check`, and `gap-fill` stages
    - _Requirements: 7.1, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 9.4 Implement pipeline assembly, kit validation, and deduplication fingerprint
    - Wire all steps in the correct sequence: crawl → research → extract-req → company-brief → gen-questions → gen-flashcards → coverage-loop → schedule → validate → persist
    - Call `buildSchedule` with final questions and requirements
    - Call `validateKit` from shared package; if validation fails set status to `'failed'` and surface the error
    - Compute `dedupeKey` as `sha256(normalise(jobDescription) + '|' + normalise(companyUrl))` where `normalise` = lowercase + trim whitespace
    - Handle short JD (< 200 chars): set requirements to only explicitly supported ones; prefix `summary` and `role` fields with "Limited job description provided"
    - _Requirements: 7.9, 8.1, 9.6, 2.6, 16.3_

- [x] 10. Kit routes
  - [x] 10.1 Implement Kit Mongoose model
    - Create `backend/src/models/Kit.ts` with full Kit schema matching all Appendix A fields plus Mongoose-specific fields: `userId`, `status` (`pending | generating | ready | failed`), `pipelineError`, `dedupeKey`, timestamps
    - Add indexes: `{ userId: 1 }`, unique `{ userId: 1, dedupeKey: 1 }`
    - Include `pinned: boolean` (default `false`) on embedded Question and Flashcard sub-schemas
    - _Requirements: 8.1–8.10, 11.2_

  - [x] 10.2 Implement `POST /api/kits` (create kit) and `GET /api/kits` (list kits)
    - `POST /api/kits`: validate body with zod (`jobDescription` ≥ 50 chars trimmed, `companyUrl` valid HTTP/HTTPS URL, `daysAvailable` integer 1–60); compute `dedupeKey`; check for duplicate (409 with existing kit summary if found); create Kit doc with `status: 'pending'`; start pipeline async; return `{ kitId }`
    - `GET /api/kits`: return array of user's kits with summary fields (`_id`, `status`, `source.role`, `source.company`, `createdAt`)
    - Apply `authenticate` middleware to both routes
    - _Requirements: 2.1–2.6, 1.6_

  - [x] 10.3 Implement `GET /api/kits/:id`, `PATCH /api/kits/:id`, `DELETE /api/kits/:id`
    - `GET /api/kits/:id`: load full kit; verify ownership with `assertKitOwner`; return document
    - `PATCH /api/kits/:id`: merge partial Kit fields; set `pinned: true` on any edited question or flashcard; persist
    - `DELETE /api/kits/:id`: verify ownership; delete kit document and all associated `FlashcardProgress` documents
    - _Requirements: 1.6, 11.2, 13.3, 13.4_

  - [x] 10.4 Implement `GET /api/kits/:id/progress` (SSE endpoint)
    - Set headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
    - Subscribe to the in-memory event emitter for the given kit ID; write `data: <JSON>\n\n` for each `StageEvent`
    - Close stream when status reaches `'ready'` or `'failed'`; send final `StageEvent` summarising completion
    - Handle client disconnect by unsubscribing the listener
    - _Requirements: 2.5_

  - [x] 10.5 Implement `POST /api/kits/:id/regenerate`
    - Accept body `{ section: 'company-brief' | 'questions-technical' | 'questions-behavioural' | 'questions-system-design' | 'questions-company-fit' | 'schedule' }`
    - For question categories: partition into pinned/non-pinned; run the appropriate LLM call C_n targeting `(maxPerCategory - pinnedCount)` questions; assign new IDs from `max(existing ID number) + 1`; re-run coverage and schedule; preserve pinned questions in original relative order
    - For company-brief: re-run Call B; leave all other sections unchanged
    - For schedule: re-run `buildSchedule` with current questions; leave all other sections unchanged
    - On regeneration failure: restore previous section content exactly; return error response
    - Stream progress via the kit's SSE progress channel
    - _Requirements: 14.1–14.6_

- [x] 11. Practice routes
  - [x] 11.1 Implement FlashcardProgress model and practice routes
    - Create `backend/src/models/FlashcardProgress.ts` with schema: `userId`, `kitId`, `flashcardId`, `ratings: [{ confidence, ratedAt }]`, `meanConfidence` (cached), timestamps
    - Add indexes: unique `{ userId, kitId, flashcardId }`, `{ userId, kitId, meanConfidence }` for deck ordering
    - Create `backend/src/routes/practice.ts` with:
      - `GET /api/kits/:id/practice/deck`: join flashcard IDs from kit with `FlashcardProgress`; order by `meanConfidence ASC` (unseen cards = 0 first, then by flashcard ID as tiebreaker); return ordered ID array
      - `POST /api/kits/:id/practice/rate`: upsert `FlashcardProgress`; push new `RatingEntry`; recompute `meanConfidence` as arithmetic mean of all `confidence` values; return `{ ok: true }`
    - _Requirements: 15.3, 15.6_

- [x] 12. Batch runner
  - [x] 12.1 Implement `evaluate.ts` CLI and wire npm script
    - Create `backend/src/scripts/evaluate.ts` implementing the batch runner as specified in the design
    - Validate input file: must be readable JSON array; exit non-zero with stderr message on failure
    - For each case: validate required fields (`id`, `jd`, `company_url`, `days`) — on missing/wrong-type field record `status: 'failed'` with `INVALID_CASE` code and continue
    - Call `runPipeline` (same function used by web server) for each case; record `ok` or `failed` result
    - Write output file: `{ version: "1.0", generated_at: "<ISO 8601>", kits: [...] }`
    - Add `"evaluate": "ts-node src/scripts/evaluate.ts"` to `backend/package.json` scripts
    - Add `"evaluate": "npm run evaluate --prefix backend --"` to root `package.json` scripts so `npm run evaluate -- --input … --output …` works from repo root
    - _Requirements: 4.1–4.12_

- [x] 13. Frontend scaffold
  - [x] 13.1 Set up Next.js 14 App Router and Tailwind with design tokens
    - Initialise Next.js 14 in `frontend/` with TypeScript and App Router
    - Configure `tailwind.config.ts` with custom design tokens:
      - Colors: `bg-base` (#1E2130), `bg-surface` (#272B3B), `bg-raised` (#313649), `text-primary` (#F0EDE6), `text-secondary` (#9BA3BF), `accent` (#5B8EF0), `accent-dim` (#2A4A8A), `success` (#4ADE80), `warning` (#FBBF24), `danger` (#F87171)
      - Font families: `sans: ['DM Sans', 'sans-serif']`, `mono: ['JetBrains Mono', 'monospace']`
    - Add Google Fonts import for DM Sans (weights 400, 700, 800) and JetBrains Mono in `app/layout.tsx`
    - Create `app/globals.css` with base resets using the token colors
    - _Requirements: 12.1_

  - [x] 13.2 Create app layout structure and route groups
    - Create `app/(auth)/layout.tsx` — unauthenticated layout (centred card)
    - Create `app/(app)/layout.tsx` — authenticated layout with `AppShell` (fixed 260px sidebar + fluid main)
    - Create `components/layout/AppShell.tsx`, `components/layout/Sidebar.tsx` with `SidebarLogo`, `KitSectionNav`, `UserMenu`
    - Create `components/ui/` primitives: `Button`, `Input`, `Badge`, `Spinner` using Tailwind tokens
    - Create `frontend/types/index.ts` re-exporting from `@interview-prep/shared`
    - _Requirements: 12.3_

- [x] 14. Frontend auth
  - [x] 14.1 Implement auth pages, JWT storage, and API client
    - Create `lib/auth.ts` with `getToken()`, `setToken(token)`, `removeToken()` helpers (localStorage)
    - Create `lib/api.ts` with typed `apiFetch` wrapper that attaches Bearer token from storage; handles 401 by clearing token and redirecting to login
    - Create `components/layout/AuthGuard.tsx` — client component that redirects unauthenticated users to `/login`
    - Create `app/(auth)/login/page.tsx` and `app/(auth)/register/page.tsx` with `AuthForm` component: email + password fields, submit, field-level error display
    - Implement JWT removal on logout (in `UserMenu`)
    - _Requirements: 1.4, 1.5, 1.7_

- [x] 15. Frontend landing page
  - [x] 15.1 Implement landing hero page
    - Create `app/page.tsx` (public route, redirects to `/dashboard` if authenticated)
    - Implement typographic hero: `"Know the company.\nOwn the room."` in DM Sans 800, tracking -0.02em, on `bg-base`
    - Subtitle in DM Sans 400, `text-secondary`: "Paste a job description. Get a personalised prep kit in minutes."
    - Single `accent` CTA button "Start preparing →" linking to `/register`
    - Apply orchestrated entrance: headline fades up over 400ms on page load (CSS `@keyframes` via Tailwind `animate-` utility or inline `style`)
    - No other animations, illustrations, or feature grids
    - _Requirements: 12.1, 12.3_

- [x] 16. Frontend dashboard
  - [x] 16.1 Implement dashboard kit list page
    - Create `app/(app)/dashboard/page.tsx` fetching user's kits via `GET /api/kits` (RSC)
    - Create `components/builder/KitList.tsx` and `KitRow.tsx`: show role title, company, creation date, status badge; "Open" link and delete button per row
    - Delete shows confirmation dialog before calling `DELETE /api/kits/:id`
    - Show `EmptyState` component ("No kits yet — start preparing") when list is empty
    - _Requirements: 12.3, 12.4_

- [x] 17. Frontend create page
  - [x] 17.1 Implement single-kit creation form with SSE progress tracker
    - Create `app/(app)/create/page.tsx`
    - Create `components/create/CreateForm.tsx` with three fields: `JobDescriptionTextarea` (≥ 50 chars validation), `CompanyUrlInput` (URL validation), `DaysInput` (1–60 integer validation); field-level error messages adjacent to each field
    - On submit: `POST /api/kits`; on 409 show `DuplicateKitModal` with "Open existing" and "Create new" actions
    - Create `lib/sse.ts` — `useSSEProgress(kitId)` hook: opens `EventSource` to `/api/kits/:id/progress`; returns `{ stages, status, error }`
    - Create `components/create/ProgressTracker.tsx` with `StageList` showing each pipeline stage name and visual state (pending / running spinner / done ✓ / failed ✗)
    - On pipeline completion redirect to `/kits/:id`
    - _Requirements: 2.1–2.6_

  - [x] 17.2 Implement batch upload UI
    - Create `components/create/BatchUpload.tsx` with `FileDropZone` (JSON files only)
    - Parse and validate uploaded JSON against batch input schema; show descriptive error on invalid file
    - Process each case sequentially; show `BatchProgressTable` with per-case status rows updating in real-time
    - On completion persist kits and show success/failure summary
    - _Requirements: 3.1–3.5_

- [x] 18. Frontend kit builder
  - [x] 18.1 Implement KitPage layout and CompanyBriefSection
    - Create `app/(app)/kits/[id]/page.tsx` as RSC that fetches kit and renders `KitProgressOverlay` (if `status === 'generating'`) or the builder sections
    - Create `components/builder/CompanyBriefSection.tsx`: `EditableText` components for `summary` and `what_they_do` (click-to-edit, Save button); `RegenerateButton` triggering `POST /regenerate` with `section: 'company-brief'`
    - `KitProgressOverlay`: uses `useSSEProgress` hook; renders `StageList` overlay with all stages
    - _Requirements: 12.3, 14.1, 14.4, 14.5, 14.6_

  - [x] 18.2 Implement QuestionsSection with drag-and-drop and inline editing
    - Create `components/builder/QuestionsSection.tsx` with `CategoryTabs` (technical | behavioural | system-design | company-fit)
    - Implement `QuestionList` using `@dnd-kit/core` `DndContext` and `@dnd-kit/sortable` `SortableContext`; reorder triggers `PATCH /api/kits/:id` persisting new order immediately
    - Implement `SortableQuestionCard` with:
      - `PinnedIndicator`: lock icon (`aria-label="Edited by you"`) shown when `pinned === true`
      - `EditablePrompt`: click-to-edit single-line (Enter to confirm)
      - `EditableAnswerOutline`: click-to-edit multiline (Save button)
      - `CategoryDropdown`: move to other category; persisted via PATCH
      - `DeleteButton`: confirm before delete
    - `AddQuestionButton` inserts empty pinned question at top of category
    - `RegenerateButton` scoped to active category
    - All edits set `pinned: true` via PATCH
    - _Requirements: 11.1–11.4, 12.1, 12.2, 12.3, 13.1, 13.3, 14.1–14.6_

  - [x] 18.3 Implement FlashcardsSection, ScheduleSection
    - Create `components/builder/FlashcardsSection.tsx`:
      - `FlashcardCard` with `PinnedIndicator`, `EditableFront`, `EditableBack`, `DeleteButton`
      - `AddFlashcardButton` appends new pinned flashcard
      - All edits set `pinned: true`
    - Create `components/builder/ScheduleSection.tsx`:
      - `DayList` with `DayCard` per entry (day number, focus, minutes, question count)
      - `RegenerateButton` for schedule section
    - _Requirements: 11.1–11.4, 13.2, 13.3, 14.1_

- [x] 19. Frontend practice mode
  - [x] 19.1 Implement PracticeMode state machine and components
    - Create `app/(app)/kits/[id]/practice/page.tsx`
    - Implement state machine: `IDLE → LOADING_DECK → SHOWING_FRONT → SHOWING_BACK → SESSION_SUMMARY | EMPTY_DECK | DECK_ERROR`
    - Create `components/practice/FlashcardViewer.tsx`: show `CardFront`; `RevealButton` → show `CardBack`
    - Create `components/practice/ConfidenceRater.tsx`: four buttons "Again" (1), "Hard" (2), "Good" (3), "Easy" (4); on click `POST /practice/rate` then advance card or go to `SESSION_SUMMARY`
    - Create `components/practice/ProgressBar.tsx` showing rated / total
    - Create `components/practice/SessionSummary.tsx` showing count per confidence level and "Practice again" button
    - `DeckOrderIndicator` shows n of total and covered/not-seen badge
    - Show empty state when deck is empty; show `DECK_ERROR` with retry on fetch failure
    - _Requirements: 15.1–15.8_

- [x] 20. Tests
  - [x] 20.1 Set up Vitest and fast-check in shared and backend packages
    - Install `vitest`, `@vitest/coverage-v8`, `fast-check` in `packages/shared` and `backend`
    - Create `vitest.config.ts` in each package
    - Add `"test": "vitest --run"` scripts to `packages/shared/package.json` and `backend/package.json`
    - Add `"test": "npm run test --workspaces"` to root `package.json` so `npm test` runs all suites
    - _Requirements: 20.1_

  - [x] 20.2 Write CoverageChecker unit tests
    - Create `backend/src/services/__tests__/coverageChecker.test.ts`
    - Test: all must-have requirements covered → `uncoveredRequirementIds` is empty
    - Test: one must-have requirement uncovered → that ID appears in `uncoveredRequirementIds`
    - Test: nice-to-have requirements are not included in coverage computation
    - Test: empty requirements array → both output arrays empty
    - _Requirements: 20.4, 20.5_

  - [x] 20.3 Write CoverageChecker property test (Property 6)
    - In same `coverageChecker.test.ts` file
    - **Property 6: Coverage checker correctness**
    - Use `fc.array(arbitraryRequirement())` and `fc.array(arbitraryQuestion())` arbitraries
    - Assert `uncoveredRequirementIds` = must-have IDs not in any `question.requirement_ids` — no more, no fewer
    - Tag: `// Feature: ai-interview-prep-kit, Property 6: Coverage checker correctness`
    - _Requirements: 9.1, 9.4_

  - [x] 20.4 Write Scheduler unit tests
    - Create `backend/src/services/__tests__/scheduler.test.ts`
    - Test: `daysAvailable = 1` → exactly 1 day entry with all must-have questions
    - Test: `daysAvailable = 60` with fewer than 60 questions → schedule spans 60 days with repeated must-have entries
    - Test: higher-difficulty questions appear in earlier day entries
    - Test: `minutes = 15 * question_ids.length` for every day
    - _Requirements: 20.2, 20.3_

  - [x] 20.5 Write Scheduler property tests (Properties 7, 8, 9, 10, 11)
    - In same `scheduler.test.ts` file
    - **Property 7: Schedule day count** — `buildSchedule` with D ∈ [1,60] produces exactly D day entries
      - Tag: `// Feature: ai-interview-prep-kit, Property 7`
    - **Property 8: Schedule includes all must-have questions** — every must-have question appears in at least one day
      - Tag: `// Feature: ai-interview-prep-kit, Property 8`
    - **Property 9: Schedule difficulty ordering** — mean difficulty of earlier days ≥ mean difficulty of later days (when at least two difficulty levels present)
      - Tag: `// Feature: ai-interview-prep-kit, Property 9`
    - **Property 10: Schedule minutes invariant** — `day.minutes === 15 * day.question_ids.length` for all days
      - Tag: `// Feature: ai-interview-prep-kit, Property 10`
    - **Property 11: Schedule even distribution** — max minus min per-day question count ≤ 1
      - Tag: `// Feature: ai-interview-prep-kit, Property 11`
    - Each property: `numRuns: 100` with `fc.integer({ min: 1, max: 60 })`, `fc.array(arbitraryQuestion())`, `fc.array(arbitraryRequirement())` arbitraries
    - _Requirements: 10.2, 10.3, 10.7, 10.8, 10.9_

  - [x] 20.6 Write kit schema validator unit tests
    - Create `packages/shared/src/__tests__/validator.test.ts`
    - Test: valid kit object passes without errors
    - Test: kit missing `questions` array → error identifying "questions"
    - Test: kit with `difficulty = 4` → error identifying the field
    - Test: kit with `minutes = 1.5` → error identifying the field
    - Test: kit with `question_ids` in schedule referencing non-existent question ID → error
    - _Requirements: 20.6, 20.7_

  - [x] 20.7 Write kit serialiser property test (Property 13)
    - Create `packages/shared/src/__tests__/serialiser.test.ts`
    - **Property 13: Kit serialisation round-trip** — `validateKit(JSON.parse(serialiseKit(kit)))` then re-serialise produces identical string
    - Use `fc.record(...)` arbitrary generating valid Kit objects
    - `numRuns: 100`; tag: `// Feature: ai-interview-prep-kit, Property 13`
    - _Requirements: 19.3_

  - [x] 20.8 Write auth unit tests
    - Create `backend/src/routes/__tests__/auth.test.ts`
    - Test: login with wrong password → 401 with generic message
    - Test: login with non-existent email → 401 with same generic message (not distinguishable from wrong password)
    - Test: valid JWT → request proceeds through `authenticate` middleware
    - Test: expired JWT → 401
    - Test: register with duplicate email → 400 with `field: 'email'`
    - Test: register with password < 8 chars → 400 with `field: 'password'`
    - _Requirements: 1.1–1.8_

  - [x] 20.9 Write batch runner integration test
    - Create `backend/src/scripts/__tests__/evaluate.test.ts`
    - Write a two-case input JSON file to a temp path; import and call `main()` directly (not via shell); read output file; assert output shape: `{ version, generated_at, kits: [{ id, status, kit | null, error | null }] }`
    - Test: one valid case produces `status: 'ok'` with a kit conforming to Appendix A schema
    - Test: one case with missing `jd` field produces `status: 'failed'` with `error.code === 'INVALID_CASE'`
    - Use mock LLM adapter returning pre-recorded responses; mock crawler and research agent
    - _Requirements: 4.1–4.12_

  - [x] 20.10 Final checkpoint — all tests pass
    - Run `npm test` from repo root; confirm all unit and property tests pass
    - Run `tsc --noEmit` in `backend/`, `frontend/`, and `packages/shared/`; confirm zero type errors
    - Ensure all tests pass, ask the user if questions arise.

- [x] 21. README and .env.example
  - [x] 21.1 Create .env.example and complete README
    - Create `.env.example` at repo root listing all environment variables from the design with descriptive comments and non-secret placeholders
    - Create `README.md` covering: project overview, tech stack (with justifications), setup instructions for local and deployed environments, exact commands to install dependencies and run the batch entry point, LLM provider and model used, retrieval sources used, high-level architecture, retrieval approach and link scoring strategy, pipeline sequencing, pinned/generated/edited state representation, schedule allocation algorithm, key design decisions and trade-offs (embedded docs, SSE vs WebSockets, coverage loop cap, deduplication by hash, scheduler spaced repetition), known limitations
    - Verify `npm run evaluate -- --input cases.json --output kits.json` is documented and functional from the repo root
    - _Requirements: 18.3, 18.4, 18.5_

---

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP
- All tasks reference specific requirements for traceability
- The `pinned` field is critical — it must be in both the TypeScript types (task 1.2) and the Mongoose model (task 10.1)
- The `npm run evaluate` root script (task 12.1) must delegate to `backend/` via `--prefix` or workspace syntax so it works from a clean clone
- Property tests use `fast-check` with `numRuns: 100` minimum and are tagged with the design property number
- The SSRF guard (task 5.1) is only active in `production` mode per the design — unit tests can run without DNS mocking
- All LLM prompts must wrap external content in `<external-content>` delimiters (task 9.1)
- Drag-and-drop uses `@dnd-kit/core` + `@dnd-kit/sortable` exclusively — not the HTML5 drag API

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "1.4"] },
    { "id": 3, "tasks": ["2.1"] },
    { "id": 4, "tasks": ["2.2", "3.1"] },
    { "id": 5, "tasks": ["3.2", "3.3"] },
    { "id": 6, "tasks": ["4.1", "4.2"] },
    { "id": 7, "tasks": ["4.3"] },
    { "id": 8, "tasks": ["5.1", "5.2"] },
    { "id": 9, "tasks": ["6.1"] },
    { "id": 10, "tasks": ["6.2", "7.1"] },
    { "id": 11, "tasks": ["8.1"] },
    { "id": 12, "tasks": ["9.1"] },
    { "id": 13, "tasks": ["9.2"] },
    { "id": 14, "tasks": ["9.3"] },
    { "id": 15, "tasks": ["9.4", "10.1"] },
    { "id": 16, "tasks": ["10.2"] },
    { "id": 17, "tasks": ["10.3", "10.4", "10.5"] },
    { "id": 18, "tasks": ["11.1"] },
    { "id": 19, "tasks": ["12.1"] },
    { "id": 20, "tasks": ["13.1"] },
    { "id": 21, "tasks": ["13.2"] },
    { "id": 22, "tasks": ["14.1"] },
    { "id": 23, "tasks": ["15.1"] },
    { "id": 24, "tasks": ["16.1"] },
    { "id": 25, "tasks": ["17.1"] },
    { "id": 26, "tasks": ["17.2", "18.1"] },
    { "id": 27, "tasks": ["18.2"] },
    { "id": 28, "tasks": ["18.3", "19.1"] },
    { "id": 29, "tasks": ["20.1"] },
    { "id": 30, "tasks": ["20.2", "20.4", "20.6", "20.7", "20.8"] },
    { "id": 31, "tasks": ["20.3", "20.5", "20.9"] },
    { "id": 32, "tasks": ["20.10"] },
    { "id": 33, "tasks": ["21.1"] }
  ]
}
```
