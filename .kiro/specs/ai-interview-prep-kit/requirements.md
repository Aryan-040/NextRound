# Requirements Document

## Introduction

The AI Interview Prep Kit is a full-stack web application that transforms a job description and company URL into a personalised, structured interview preparation kit. Given a job description, a company website, and the number of days until the interview, the system crawls the company site, researches public interview process discussions, then runs a sequential LLM pipeline to produce a company brief, role breakdown, categorised question bank, flashcards, and a day-by-day study schedule. Users can reshape any part of the kit inline, regenerate individual sections without losing edits, and practise against flashcards with confidence tracking. A mandatory batch entry point (`npm run evaluate`) enables automated pipeline evaluation against unseen job descriptions.

---

## Glossary

- **System**: The AI Interview Prep Kit application as a whole.
- **AuthService**: The authentication subsystem responsible for registration, login, session management, and access control.
- **Crawler**: The subsystem that fetches and parses external web pages from a given company URL, following links to discover about and hiring content.
- **ResearchAgent**: The subsystem that searches for public discussion of a company's interview process using external search APIs or scraping.
- **ExtractionPipeline**: The sequential LLM pipeline that extracts requirements from job descriptions and generates kit content step by step.
- **CoverageChecker**: The deterministic code module that compares generated questions against extracted requirements to find uncovered must-have requirements.
- **Scheduler**: The deterministic code module that allocates requirements and questions across the requested number of days.
- **KitStore**: The persistence layer that stores, retrieves, and updates kits in MongoDB.
- **Builder**: The frontend interface through which users view, edit, reorder, and regenerate kit sections.
- **PracticeMode**: The frontend flashcard practice interface with confidence tracking.
- **BatchRunner**: The CLI entry point (`npm run evaluate`) that processes a JSON file of cases and writes kit output to a JSON file.
- **Kit**: The structured interview preparation artifact conforming to the schema in Appendix A of the assignment.
- **Requirement**: A single extracted item from a job description, typed as `technical`, `behavioural`, or `domain`, and prioritised as `must` or `nice`.
- **Question**: A single generated interview question linked to one or more requirement IDs.
- **Flashcard**: A front/back study card linked to one or more requirement IDs.
- **Schedule**: A day-by-day study plan that distributes questions across the number of days the user specified.
- **Coverage**: The set of must-have requirement IDs that have no associated question after the final coverage pass.
- **PinnedState**: The flag on a question or flashcard indicating it was written or last edited by the user, protecting it from being overwritten by section regeneration.
- **JWT**: JSON Web Token used to authenticate API requests.

---

## Requirements

### Requirement 1: User Registration and Login

**User Story:** As a job seeker, I want to register and log in securely, so that my kits are private and only I can access them.

#### Acceptance Criteria

1. WHEN a visitor submits a registration form with a unique email address and a password between 8 and 128 characters inclusive, THE AuthService SHALL create a new user account and return a signed JWT with an expiry of no more than 24 hours.
2. WHEN a visitor submits a login form with a valid email and correct password, THE AuthService SHALL verify the credentials and return a signed JWT with an expiry of no more than 24 hours.
3. IF a login attempt is made with an email that does not exist or an incorrect password, THEN THE AuthService SHALL return a 401 response with a generic error message that does not distinguish between the two cases.
4. IF a valid JWT is present in the Authorization header of a request to a protected API route, THEN THE AuthService SHALL permit the request to proceed.
5. IF a request to a protected API route carries an expired or malformed JWT, THEN THE AuthService SHALL return a 401 response and THE Builder SHALL redirect the user to the login page.
6. THE AuthService SHALL enforce that a user can only read, create, update, and delete their own kits, returning 403 for any cross-user access attempt.
7. WHEN a user logs out, THE Builder SHALL remove the JWT from client-side storage, causing any subsequent protected request to return a 401 requiring re-authentication.
8. IF a visitor submits a registration form with an email address already registered, a malformed email address, or a password outside the 8–128 character range, THEN THE AuthService SHALL return a 400 response with a descriptive error identifying which field failed validation, and SHALL NOT create a new account.

---

### Requirement 2: Single Kit Creation via Form Input

**User Story:** As a job seeker, I want to paste a job description and provide a company URL and days count, so that the system can generate a personalised prep kit for me.

#### Acceptance Criteria

1. THE Builder SHALL present a creation form with three fields: a multiline textarea for the job description (minimum 50 characters), a text field for the company website URL, and a numeric field for the number of days until the interview (integer between 1 and 60 inclusive).
2. IF the user submits the form with the company URL field containing a value that is not a well-formed absolute HTTP or HTTPS URL (i.e. the URL cannot be parsed by the WHATWG URL API or its scheme is neither "http" nor "https"), THEN THE System SHALL display a field-level validation error adjacent to the URL field and SHALL NOT initiate kit generation.
3. IF the user submits the form with the days field containing a non-integer value, a value less than 1, or a value greater than 60, THEN THE System SHALL display a field-level validation error adjacent to the days field and SHALL NOT initiate kit generation.
4. IF the user submits the form with the job description textarea containing fewer than 50 characters after trimming leading and trailing whitespace, THEN THE System SHALL display a field-level validation error adjacent to the textarea and SHALL NOT initiate kit generation.
5. WHEN the user submits a valid creation form, THE System SHALL initiate the kit generation pipeline and display a progress indicator listing each named pipeline stage (crawl, research, extract, generate-questions, build-flashcards, coverage-check, schedule) and updating the visual state of each stage label as that stage completes or fails.
6. IF the same authenticated user submits a creation form with a job description and company URL that, after normalisation (lowercasing the URL host and trimming whitespace from the job description), are identical to those of an existing kit belonging to that user, THEN THE System SHALL display a modal notice identifying the duplicate kit by its role title and creation date, and SHALL offer two actions: "Open existing kit" and "Create new kit".

---

### Requirement 3: Batch Kit Creation via File Upload

**User Story:** As a recruiter or power user, I want to upload a file of job description and company pairs, so that I can generate multiple kits in one operation.

#### Acceptance Criteria

1. THE Builder SHALL provide a file upload control that accepts JSON files conforming to the batch input schema (an array of objects each with `id`, `jd`, `company_url`, and `days` fields).
2. IF the uploaded file cannot be parsed as valid JSON or does not match the required schema, THEN THE System SHALL display a descriptive validation error and SHALL NOT begin processing.
3. WHEN a valid batch file is uploaded, THE System SHALL process each case through the full retrieval and generation pipeline sequentially, displaying per-case progress and status in the interface.
4. IF one case in a batch fails to produce a kit, THE System SHALL record the failure with an error code and message, and SHALL continue processing the remaining cases without aborting.
5. WHEN all cases in a batch have been processed, THE System SHALL persist each successfully generated kit under the authenticated user's account and display a summary of successes and failures.

---

### Requirement 4: CLI Batch Entry Point

**User Story:** As an evaluator, I want to run the pipeline over a file of cases from the command line, so that I can evaluate kits programmatically without using the browser interface.

#### Acceptance Criteria

1. THE BatchRunner SHALL be invocable via the exact command `npm run evaluate -- --input <path> --output <path>` from the repository root.
2. WHEN the BatchRunner is invoked, THE BatchRunner SHALL read the input file as a JSON array of case objects, where each object contains a string `id`, a string `jd`, a string `company_url`, and a non-negative integer `days`.
3. THE BatchRunner SHALL execute the same retrieval, extraction, generation, coverage-checking, and scheduling code used by the web application, not a separate implementation.
4. WHEN a case is processed successfully, THE BatchRunner SHALL record a result entry with `status: "ok"`, `kit` set to the full kit object conforming to Appendix A, and `error: null`.
5. IF a case cannot produce a kit at all, THE BatchRunner SHALL record a result entry with `status: "failed"`, `kit: null`, and `error` set to an object containing a `code` string of 1–64 characters and a `message` string of 1–512 characters.
6. A case whose research yielded incomplete data (e.g. no hiring page found, no job description parseable) SHALL be recorded as `status: "ok"` with the affected kit fields set to `null` or an empty array as defined in Appendix A, not as `status: "failed"`; `status: "failed"` is reserved exclusively for cases where the pipeline throws an unhandled exception or produces no kit object.
7. WHEN all cases are processed, THE BatchRunner SHALL write a single JSON output file in the shape: `{ "version": "1.0", "generated_at": "<ISO 8601 timestamp>", "kits": [ ... ] }`.
8. THE BatchRunner SHALL complete processing of five sequential cases within 15 minutes, where each rate-limit response triggers a retry after a delay of 5 to 60 seconds, with a maximum of 3 retries per case before recording that case as `status: "failed"`.
9. THE BatchRunner SHALL read all credentials from environment variables documented in `.env.example` and SHALL require no setup beyond running the install command specified in the repository README.
10. THE BatchRunner SHALL NOT assume a particular hostname for company URLs and SHALL follow relative links, enabling use with locally served company sites.
11. IF the input file path does not exist, cannot be read, or does not contain a valid JSON array, THEN THE BatchRunner SHALL exit with a non-zero exit code and write an error message indicating the file path and the reason for rejection to stderr, without writing an output file.
12. IF a case object is missing any of the required fields (`id`, `jd`, `company_url`, `days`) or any field is of the wrong type, THEN THE BatchRunner SHALL skip that case, record a result entry with `status: "failed"` and an `error` indicating which field failed validation, and continue processing the remaining cases.

---

### Requirement 5: Company Site Crawling

**User Story:** As a user generating a kit, I want the system to crawl the company's website to find their about and hiring pages, so that the kit reflects what the company actually does and how they hire.

#### Acceptance Criteria

1. WHEN a company URL is provided, THE Crawler SHALL fetch the page at that URL, parse all anchor links, score each link on a 0–10 scale by relevance to "about", "careers", "hiring", "jobs", "culture", and "engineering blog" concepts, and place links scoring 5 or above into a high-priority fetch queue.
2. THE Crawler SHALL follow links discovered on crawled pages up to a configurable depth between 1 and 10 hops (default: 3), to find hiring and about content not linked directly from the homepage.
3. THE Crawler SHALL respect `robots.txt` for the domain being crawled and SHALL NOT fetch URLs that `robots.txt` disallows; IF the robots.txt file cannot be fetched, THE Crawler SHALL treat all paths as allowed.
4. THE Crawler SHALL NOT use a hard-coded list of URL paths (e.g. `/careers`, `/jobs`) as the sole discovery mechanism; link scoring and traversal MUST drive discovery.
5. THE Crawler SHALL rate-limit outbound requests to a maximum of 2 requests per second per domain.
6. IF THE Crawler receives a 429 or 5xx HTTP response, THEN THE Crawler SHALL retry the request up to 3 times using exponential backoff starting at 1 second, doubling each retry, capped at 8 seconds per attempt, before marking that URL as failed and continuing.
7. WHEN THE Crawler receives an HTTP response with a `Content-Type` header that does not begin with `text/html`, THE Crawler SHALL discard the response body, record the URL and content type, and SHALL NOT pass the content to further processing.
8. IF THE Crawler receives an HTTP response whose body size exceeds 5 MB, THE Crawler SHALL discard the body, record the URL and size, and SHALL NOT pass the content to further processing.
9. IF the company URL returns a 404 response, connection timeout (after 10 seconds), or DNS failure, THEN THE Crawler SHALL record the failure reason, set `company_brief.sources` to an empty array, and allow kit generation to continue with an honest note in the company brief.
10. IF no about or hiring page is discovered after crawling a maximum of 50 pages, THEN THE Crawler SHALL record this outcome and THE ExtractionPipeline SHALL produce a company brief that explicitly states no about or hiring content was found.
11. WHEN THE Crawler has extracted text from a fetched page, THE Crawler SHALL strip all HTML tags and their attributes, remove all `<script>` and `<style>` element content, and decode then remove all HTML character references before passing the text to the ExtractionPipeline.

---

### Requirement 6: Public Interview Discussion Research

**User Story:** As a user generating a kit, I want the system to find public discussion about the company's interview process, so that the questions reflect how that company actually interviews.

#### Acceptance Criteria

1. WHEN a company name is identified from the crawled site, THE ResearchAgent SHALL query at least one public source (e.g. a search engine API, Glassdoor, Blind, Reddit) for discussions of that company's interview process.
2. THE ResearchAgent SHALL extract relevant passages about interview format, stages, and commonly asked topics from the search results.
3. IF no public discussion is found, THE ResearchAgent SHALL record this outcome and THE ExtractionPipeline SHALL note the absence in the generated questions rather than fabricating interview format details.
4. THE ResearchAgent SHALL rate-limit requests and SHALL back off with exponential delay on receiving rate-limit responses.
5. IF a public discussion source cannot be reached, THE ResearchAgent SHALL skip that source and continue with other sources rather than failing the whole research step.
6. THE ResearchAgent SHALL treat all fetched content as untrusted and SHALL NOT pass raw HTML to the LLM; only cleaned plain text excerpts SHALL be included in LLM prompts.

---

### Requirement 7: Sequential LLM Extraction and Generation Pipeline

**User Story:** As a user generating a kit, I want the system to produce questions and content that are genuinely derived from the specific job description and company research, so that my kit is personalised and not generic.

#### Acceptance Criteria

1. THE ExtractionPipeline SHALL execute the following named steps in sequence, each as a separate LLM call with distinct instructions: (a) requirement extraction, (b) company brief generation, (c) question generation per requirement and category, (d) flashcard generation, (e) coverage check, (f) gap-filling question generation.
2. THE ExtractionPipeline SHALL NOT combine all steps into a single LLM prompt that returns the entire kit at once.
3. WHEN extracting requirements from the job description, THE ExtractionPipeline SHALL assign each requirement a stable `id` (e.g. `r1`, `r2`), a `text`, a `kind` of `technical`, `behavioural`, or `domain`, and a `priority` of `must` if the posting uses words like "required", "must have", or "essential", `nice` if the posting uses words like "bonus", "preferred", or "nice to have", and `nice` by default when no signal words are present.
4. WHEN generating questions, THE ExtractionPipeline SHALL generate questions separately for each category (`technical`, `behavioural`, `system-design`, `company-fit`) in individual LLM calls, producing a minimum of 2 and a maximum of 5 questions per category per call.
5. WHEN a hiring page has been found by the Crawler, THE ExtractionPipeline SHALL allocate at least 40% of the total generated questions to the category most strongly signalled by the hiring page content (e.g. `system-design` if the hiring page describes a system design round).
6. IF THE ExtractionPipeline receives an LLM response for a given step that cannot be parsed as valid JSON, THEN THE ExtractionPipeline SHALL retry that step up to 3 times, appending a correction instruction to the prompt, before recording the step as failed.
7. IF the LLM provider returns a rate-limit response, THE ExtractionPipeline SHALL wait using exponential backoff starting at 2 seconds, doubling each retry, capped at 60 seconds per attempt, and retry up to 5 times before marking the step as failed.
8. THE ExtractionPipeline SHALL never pass raw untrusted web content directly to the LLM as instructions; all scraped content SHALL be wrapped in `<external-content>` and `</external-content>` delimiters in LLM prompts.
9. WHEN the job description contains fewer than 200 characters, THE ExtractionPipeline SHALL set the `requirements` list to contain only requirements explicitly supported by the text, and SHALL populate the `company_brief.summary` and `role` fields with language noting "Limited job description provided".

---

### Requirement 8: Kit Structure Conformance

**User Story:** As an evaluator, I want every generated kit to have exactly the fields specified in Appendix A, so that automated scoring can compare kits consistently.

#### Acceptance Criteria

1. THE System SHALL validate every generated kit against the Appendix A schema before persisting it, and SHALL reject kits that are missing required fields or use incorrect field names.
2. THE Kit's `source` object SHALL contain `company`, `company_url`, `role`, `location`, `jd_chars`, `researched_at`, and `pages_used` fields with the correct types.
3. THE Kit's `company_brief` object SHALL contain `summary`, `what_they_do`, and `sources` fields.
4. THE Kit's `role` object SHALL contain `title`, `seniority`, `responsibilities`, and `requirements` fields; each requirement SHALL have `id`, `text`, `kind`, and `priority` fields.
5. THE Kit's `questions` array SHALL contain objects each with `id`, `requirement_ids`, `category`, `prompt`, `answer_outline`, and `difficulty` fields; `difficulty` SHALL be an integer between 1 and 3 inclusive.
6. THE Kit's `flashcards` array SHALL contain objects each with `id`, `front`, `back`, and `requirement_ids` fields.
7. THE Kit's `schedule` object SHALL contain `days_available` and `days` fields; each day entry SHALL have `day`, `focus`, `question_ids`, and `minutes` fields; `minutes` SHALL be an integer.
8. THE Kit's `coverage` object SHALL contain `uncovered_requirement_ids` and `passes` fields.
9. Every `question_ids` entry in the `schedule.days` array SHALL reference a question `id` that exists in the kit's `questions` array.
10. Every requirement `id` referenced in a question's `requirement_ids` SHALL exist in the kit's `role.requirements` array.

---

### Requirement 9: Coverage Check and Gap-Filling Loop

**User Story:** As a user, I want every must-have requirement in the job description to have at least one question covering it, so that I don't arrive at the interview unprepared for a stated requirement.

#### Acceptance Criteria

1. AFTER the first question generation pass, THE CoverageChecker SHALL compute the set of must-have requirement IDs not contained in the union of all `requirement_ids` arrays across all generated questions, using deterministic set arithmetic in application code, not delegated to the LLM.
2. IF the CoverageChecker finds one or more uncovered must-have requirement IDs, THE ExtractionPipeline SHALL generate at least one new question targeting each uncovered requirement ID and add those questions to the questions array.
3. THE CoverageChecker SHALL re-run after each gap-filling pass; THE ExtractionPipeline SHALL continue looping until the set of uncovered must-have requirement IDs is empty or 5 passes have been completed, whichever comes first.
4. WHEN the loop terminates, THE Kit's `coverage.uncovered_requirement_ids` SHALL list the IDs of any must-have requirements that remain uncovered after the final pass.
5. WHEN the loop terminates, THE Kit's `coverage.passes` SHALL record the total number of coverage-check passes executed, where the first pass after initial question generation counts as pass 1.
6. THE System SHALL persist the kit regardless of whether `coverage.uncovered_requirement_ids` is empty, with all uncovered IDs recorded as specified.

---

### Requirement 10: Schedule Allocation

**User Story:** As a user, I want the study schedule to distribute all must-have requirements across exactly the number of days I specified, with harder topics earlier, so that my preparation is structured and front-loaded.

#### Acceptance Criteria

1. THE Scheduler SHALL allocate questions to days using deterministic arithmetic in application code, not by delegating the allocation to the LLM.
2. THE Scheduler SHALL produce a schedule with exactly as many day entries as the `days` value the user specified, with no day entries added or omitted.
3. THE Scheduler SHALL include every must-have requirement's associated questions in the schedule.
4. IF the total number of questions (must-have and nice-to-have combined) does not exceed the even-distribution slot count (calculated as `ceil(must_have_question_count / days) * days`), THEN THE Scheduler SHALL also include nice-to-have requirement questions.
5. IF the total number of questions exceeds the even-distribution slot count, THE Scheduler SHALL exclude nice-to-have requirement questions entirely to ensure must-have questions fit within the schedule.
6. IF the number of must-have questions alone exceeds the maximum even-distribution slot count for the given number of days, THE Scheduler SHALL include all must-have questions regardless and log a warning that the schedule exceeds even distribution.
7. THE Scheduler SHALL sort all questions by descending difficulty (difficulty 3 first, then 2, then 1) before assigning them to days sequentially, so that higher-difficulty questions are assigned to earlier days; within the same difficulty level, questions SHALL be ordered by their position in the `role.requirements` array.
8. THE Scheduler SHALL set each day's `minutes` field to the integer sum of 15 multiplied by the number of questions assigned to that day.
9. THE Scheduler SHALL distribute questions across days such that the difference between the highest and lowest per-day question count is at most 1.

---

### Requirement 11: Kit Builder — Inline Editing

**User Story:** As a user, I want to edit any question, answer outline, flashcard, or brief text directly in the interface, so that I can personalise the kit to my situation.

#### Acceptance Criteria

1. THE Builder SHALL allow the user to click on any question prompt, answer outline text, flashcard front, flashcard back, or company brief paragraph to enter an inline editing mode without navigating to a separate page.
2. WHEN the user confirms an edit to a question or flashcard, THE System SHALL mark that item with `PinnedState: true` and SHALL persist the updated content to the KitStore.
3. WHEN the user is editing a field, THE Builder SHALL not submit or save the edit on every keystroke; edits SHALL be submitted only on explicit confirmation (pressing Enter for single-line fields, or clicking a Save button for multiline fields).
4. THE Builder SHALL display a visible indicator on questions and flashcards that carry `PinnedState: true`, distinguishing them from generated items.

---

### Requirement 12: Kit Builder — Reorder and Category Reassignment

**User Story:** As a user, I want to reorder questions and move them between categories, so that I can organise the kit in a way that makes sense for how I learn.

#### Acceptance Criteria

1. THE Builder SHALL support drag-and-drop reordering of questions within a category.
2. THE Builder SHALL provide a mechanism (e.g. a dropdown on a question card) for the user to move a question from its current category to any other valid category (`technical`, `behavioural`, `system-design`, `company-fit`).
3. WHEN the user reorders or reassigns a question, THE System SHALL persist the new order and category to the KitStore immediately.

---

### Requirement 13: Kit Builder — Add and Delete Items

**User Story:** As a user, I want to add custom questions or flashcards and delete unwanted ones, so that the kit fully matches my preparation needs.

#### Acceptance Criteria

1. THE Builder SHALL provide an "Add question" control within each question category that inserts a new empty question above the other questions in that category with `PinnedState: true`.
2. THE Builder SHALL provide an "Add flashcard" control that appends a new empty flashcard to the flashcards section with `PinnedState: true`.
3. THE Builder SHALL provide a delete control on each question and flashcard that removes it from the kit after the user confirms the deletion.
4. WHEN a question is deleted, THE System SHALL remove it from the KitStore and SHALL update the schedule to remove references to its `id`.

---

### Requirement 14: Kit Builder — Section Regeneration

**User Story:** As a user, I want to regenerate a single section of the kit (e.g. the company brief or one question category) without losing edits I have made elsewhere, so that I can improve a weak section without starting over.

#### Acceptance Criteria

1. WHEN the user activates the "Regenerate" action on the company brief, a question category, or the schedule, THE System SHALL regenerate only that named section using the pipeline step responsible for that section.
2. WHEN a section is regenerated, THE System SHALL leave all items in every other section of the kit unchanged.
3. WHEN a question category is regenerated, THE System SHALL retain every question in that category that carries `PinnedState: true` in its original relative order among other pinned questions; regenerated questions SHALL fill the remaining positions in the category.
4. WHEN regeneration of a section is in progress, THE Builder SHALL display a loading indicator scoped to that section and SHALL disable the Regenerate action for that section until the regeneration completes or fails.
5. WHEN regeneration of a section completes successfully, THE Builder SHALL replace the section content with the newly generated content and remove the loading indicator.
6. IF section regeneration fails, THE Builder SHALL display an error message scoped to that section and SHALL restore the exact section content that was present when regeneration was initiated.

---

### Requirement 15: Practice Mode — Flashcard Step-Through

**User Story:** As a user, I want to step through my flashcards one at a time and record my confidence, so that I can track what I know and focus on weak areas.

#### Acceptance Criteria

1. WHEN the user enters Practice Mode, THE PracticeMode SHALL display the front face of the first flashcard in the ordered deck; the back face SHALL NOT be visible until the user explicitly activates a "Reveal answer" control.
2. WHEN the user activates the "Reveal answer" control, THE PracticeMode SHALL display the back face of the current flashcard and SHALL present four confidence rating buttons labelled "Again" (value 1), "Hard" (value 2), "Good" (value 3), and "Easy" (value 4).
3. WHEN the user selects a confidence rating button, THE System SHALL record the integer confidence value and the UTC timestamp of the rating against the flashcard's `id` in the KitStore, and SHALL advance to the next flashcard in the deck.
4. THE PracticeMode SHALL display a session progress indicator showing the count of cards rated so far in the current session and the total count of cards in the deck.
5. WHEN all cards in the current session deck have been rated, THE PracticeMode SHALL display a session-end summary showing the count of cards rated at each confidence level (1–4) and the total card count.
6. WHEN the user begins a new practice session, THE PracticeMode SHALL order the deck by ascending mean confidence rating across all prior sessions, so that cards with the lowest historical mean appear first; cards that have never been rated SHALL be treated as having a mean confidence of 0 and SHALL appear before all rated cards.
7. THE PracticeMode SHALL display for each card in the deck whether it has been rated at least once ("covered") or has never been rated ("not seen"), using a visible indicator on the card or in the deck list.
8. IF the flashcard deck for the kit contains zero cards, THE PracticeMode SHALL display an empty-state message indicating there are no flashcards to practise and SHALL NOT render a card or rating controls.

---

### Requirement 16: Edge Case and Failure Handling

**User Story:** As a user, I want the system to handle bad inputs and external failures gracefully, so that my session is not lost when something goes wrong.

#### Acceptance Criteria

1. IF the company URL is syntactically invalid, resolves to a private or loopback IP address (in production), or times out after 10 seconds, THEN THE System SHALL record the failure and continue kit generation with an honest note in the company brief, rather than aborting.
2. IF the LLM provider returns a malformed JSON response after 3 retries, THEN THE ExtractionPipeline SHALL skip the failed step, record the error in the kit metadata, and continue with the remaining steps.
3. IF the job description is fewer than 200 characters, THEN THE ExtractionPipeline SHALL proceed and produce a kit that explicitly notes the limited input, without inventing requirements not supported by the text.
4. IF no public discussion of the company's interview process is found, THE ResearchAgent SHALL record the absence in the kit metadata and THE ExtractionPipeline SHALL generate questions based solely on the job description and any crawled company content.
5. IF the user requests a schedule of 1 day, THE Scheduler SHALL produce a schedule with exactly 1 day entry containing all must-have requirement questions up to a reasonable time limit, noting any omissions.
6. IF the user requests a schedule of 60 days, THE Scheduler SHALL distribute questions across all 60 days, repeating must-have requirement questions as spaced-repetition entries if the question count is lower than the day count.

---

### Requirement 17: Security — URL Validation and Content Sanitisation

**User Story:** As a system operator, I want all external URLs to be validated and all fetched content to be sanitised, so that the application cannot be abused to reach internal services or be manipulated by prompt injection in scraped content.

#### Acceptance Criteria

1. WHEN a user-supplied or crawler-discovered URL is submitted for fetching, THE System SHALL parse the URL and resolve its hostname to an IP address, and IF the resolved IP address falls within any of the following ranges — RFC 1918 private ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16), the loopback range (127.0.0.0/8), or the link-local range (169.254.0.0/16) — THEN THE System SHALL reject the request, return an error indicating the URL targets a disallowed address, and SHALL NOT initiate a network connection. This validation SHALL apply whenever the `NODE_ENV` environment variable is set to `production`.
2. THE System SHALL restrict external HTTP requests to `GET` method only and SHALL follow a maximum of 5 redirects per request.
3. WHEN THE Crawler receives an HTTP response, THE Crawler SHALL reject the response body if the `Content-Type` header is present and does not begin with `text/html`, or if the response body size exceeds 5 MB, and SHALL NOT pass the content to further processing. IF the `Content-Type` header is absent, THEN THE Crawler SHALL also reject the response body and SHALL NOT pass the content to further processing.
4. THE ExtractionPipeline SHALL wrap all content sourced from external pages inside the literal delimiters `<external-content>` and `</external-content>` in every LLM prompt, and SHALL include a system-level instruction stating that text enclosed within those delimiters is user-supplied data to be processed and must not be interpreted as instructions.
5. THE System SHALL sanitise all text extracted from external pages by removing HTML tags (including all attributes), script blocks, style blocks, and by decoding then removing all HTML character references (both named and numeric entities) before including the text in any LLM prompt or database record, such that no HTML markup or encoded equivalent remains after sanitisation.

---

### Requirement 18: Deployment and Environment Configuration

**User Story:** As an evaluator, I want the application to be publicly accessible and configured through documented environment variables, so that I can verify it and run the batch pipeline from a clean clone.

#### Acceptance Criteria

1. THE System SHALL be deployed such that the frontend and backend are both reachable at public URLs.
2. THE System SHALL read all secrets and configuration (database URL, LLM API key, JWT secret, etc.) from environment variables.
3. THE System SHALL provide a `.env.example` file at the repository root listing every required environment variable with a descriptive comment and a non-secret placeholder value.
4. THE BatchRunner SHALL run successfully from a clean clone of the repository after the documented install step (`npm install` or equivalent) and environment variable configuration, without any additional manual setup.
5. THE System SHALL document the LLM provider and model used, and the retrieval sources used, in the repository README.

---

### Requirement 19: Parser and Serialiser Round-Trip for Kit Schema

**User Story:** As a developer, I want the kit schema parser and serialiser to be verified for correctness, so that kit data is not silently corrupted when saved to or loaded from the database.

#### Acceptance Criteria

1. THE System SHALL implement a Kit schema validator that parses a plain JavaScript object and returns either a validated Kit or a structured error listing all invalid fields.
2. THE System SHALL implement a Kit serialiser that serialises a validated Kit to a JSON string conforming to the Appendix A schema.
3. FOR ALL valid Kit objects, parsing a serialised Kit and re-serialising it SHALL produce a JSON string equal to the original serialised string (round-trip property).
4. WHEN the validator receives an object with a missing required field, THE validator SHALL return an error identifying the missing field name.
5. WHEN the validator receives an object with a `difficulty` value outside the range 1–3 or a `minutes` value that is not an integer, THE validator SHALL return an error identifying the invalid field.

---

### Requirement 20: Automated Tests for Critical Paths

**User Story:** As a developer, I want automated tests covering the schedule allocator, coverage checker, and kit schema validator, so that regressions in these deterministic modules are caught immediately.

#### Acceptance Criteria

1. THE System SHALL include a test suite runnable via `npm test` (or equivalent) that covers the Scheduler, CoverageChecker, and kit schema validator.
2. THE Scheduler tests SHALL verify that the output schedule contains exactly the requested number of days for inputs ranging from 1 to 60 days.
3. THE Scheduler tests SHALL verify that higher-difficulty questions appear in earlier days than lower-difficulty questions.
4. THE CoverageChecker tests SHALL verify that a set of questions covering all must-have requirements produces an empty `uncovered_requirement_ids` list.
5. THE CoverageChecker tests SHALL verify that a set of questions missing coverage for a must-have requirement correctly identifies that requirement ID in `uncovered_requirement_ids`.
6. THE kit schema validator tests SHALL verify that valid kit objects pass validation without errors.
7. THE kit schema validator tests SHALL verify that kit objects with missing or incorrectly typed fields are rejected with descriptive errors.
