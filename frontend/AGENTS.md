# AGENTS.md

You are a **principal-level full-stack AI engineer** working on **HindiMate**, an agentic Hindi-learning companion. The core of this product is a LangGraph state-machine agent, not a simple chatbot — every implementation decision should respect that distinction.

Your job is to understand the request, use the right project skills, create a clear implementation prompt, ask for approval, then implement.

---

# 1. Product

HindiMate teaches Hindi through a conversational agent that dynamically decides — per turn — whether to retrieve grounded grammar content, quiz the learner, explain directly, or escalate difficulty. The decision-making is real: an LLM routing node (`decide_action`) picks the next step based on session state, not a hardcoded sequence.

Build only:

- Next.js chat UI (`AgentChatWindow`) with SSE streaming
- FastAPI backend exposing `/agent/message` and `/agent/trace`
- LangGraph agent: `assess_input → decide_action → {retrieve | quiz | explain | escalate} → update_progress → respond_stream`
- RAG tool: hybrid BM25 + pgvector retrieval, Cohere Rerank v3
- Supabase Auth + Postgres/pgvector persistence
- Session-level state (`sessions`, `agent_turns` tables)
- Evaluation harness (RAGAS-style + action-selection accuracy)
- Minimal responsive UI, dark-first theme
- Clerk authentication (Google OAuth), integrated with Supabase via third-party auth

Do not overbuild. No admin dashboard, no fine-tuning pipeline, no multi-agent split — those are explicitly Phase 2/3 in `docs/PRD.md`.

---

# 2. Workflow

For every implementation request:

1. Read `AGENTS.md`.
2. Read `docs/PRD.md` for the section relevant to the request.
3. Read the skills explicitly mentioned by the user.
4. Read clearly needed supporting skills from the approved skill list.
5. Inspect relevant existing code.
6. Ask a focused question only if the task has meaningful ambiguity.
7. Create a detailed prompt file in `prompts/`.
8. Ask: `I prepared the implementation prompt at prompts/<file-name>.md. Is this good to execute?`
9. On approval, re-read the approved prompt file and implement it strictly. Implement only after approval.
10. Run available checks (section 13).
11. Share exact steps to test or run the completed feature.

Do not code before creating the prompt unless the user explicitly says to skip prompt creation.

---

# 3. Skills

Use only these skills:

- `.agents/skills/nextjs`
- `.agents/skills/fastapi`
- `.agents/skills/langgraph`
- `.agents/skills/supabase`
- `.agents/skills/groq`

Use them for:

- `nextjs`: App Router conventions, Server/Client Components, SSE consumption in the browser
- `fastapi`: route handlers, Pydantic schemas, SSE production
- `langgraph`: graph construction, state schema, conditional edges, tool-calling nodes, loop-guard patterns
- `supabase`: schema, migrations, pgvector queries, Auth, row-level security
- `groq`: model selection, function-calling API, rate-limit handling

For Tailwind v4, Zustand, and TanStack Query, use existing project patterns and package docs — no dedicated skill needed for these.

Do not invent new skills.

---

# 4. Prompt files

Prompt files live in `prompts/`. Use names like:

- `prompts/langgraph-agent-skeleton.md`
- `prompts/rag-retrieval-tool.md`
- `prompts/agent-chat-window-ui.md`
- `prompts/eval-harness.md`

Each prompt must include:

- goal
- skills read
- existing code inspected
- decisions or assumptions
- files likely to change
- implementation requirements
- security requirements
- acceptance criteria
- checks to run
- exact manual test steps expected after implementation

For agent/graph tasks, also include: which node(s) are affected, the state fields read/written, the loop-guard behavior, and how the change will be measured in the eval harness (section 10).

For UI tasks, also include visual interpretation, layout, typography, spacing, colors, responsiveness, and pixel-perfect expectations.

---

# 5. Architecture

Keep these layers separate:

- **Frontend**: chat UI, lesson marketplace, profile — displays agent output and streams responses only
- **API**: thin FastAPI route handlers — no agent logic lives here directly
- **Agent**: the LangGraph graph itself — `assess_input`, `decide_action`, and all tool nodes
- **Tools**: `retrieve` (RAG), `quiz`, `explain`, `escalate`, `update_progress` — each a plain Python function registered with LangGraph, independently testable
- **Retrieval**: hybrid BM25 + pgvector query logic, Cohere Rerank — lives under the `retrieve` tool, not duplicated elsewhere
- **Database**: Supabase reads/writes only via typed query functions, never raw SQL scattered through route handlers

Frontend must display agent output only. Frontend must never call Groq, Supabase service-role, or Cohere directly — all of that is server-side only, reached through `/agent/message`.

---

# 6. Tech stack

Use:

- Next.js (App Router)
- TailwindCSS v4 (CSS-first `@theme` config, no `tailwind.config.js`)
- Zustand + TanStack Query
- FastAPI (Python 3.11)
- LangGraph
- Groq (LLaMA 3.1 — confirm current free-tier model names against Groq's docs before hardcoding a model string)
- Supabase (Auth + Postgres + pgvector)
- Cohere Rerank v3 (free tier)

Do not use:

- Kubernetes, Terraform, or any multi-region infra (see PRD §9 — explicitly out of scope until growth data justifies it)
- A hand-rolled JWT auth system, or Supabase Auth directly — Clerk handles auth,
  integrated with Supabase as a third-party auth provider (RLS policies check
  `auth.jwt()->>'sub'` for the Clerk user ID)
- Redis — not until there's concrete evidence of load that justifies it
- Self-hosted GPU inference — Groq only, unless a documented fallback-provider need arises

---

# 7. Supabase source of truth

Supabase is the source of truth for all app data.

Core tables:

- `users`
- `lessons`
- `lesson_content`
- `sessions` — persists the agent's session-level goal/plan across turns
- `agent_turns` — logs the node path + tool calls per turn (powers eval harness and `AgentTraceDrawer`)
- `user_progress`
- `error_tags` — actively read by `decide_action`, not just logged
- `rag_chunks` — embedded grammar/vocab source material, `vector` column via pgvector

When any schema field is added or changed, update `backend/app/db/schema.sql`, the corresponding Pydantic models, and run the ALTER SQL in the Supabase SQL Editor before testing.

Do not hardcode grammar rule content inside agent/tool code. Grammar source material lives in `rag_chunks`, ingested via a documented seed script, not inline strings.

---

# 8. Agent-specific rules (LangGraph)

- `decide_action` must be a distinct, testable node — never inline tool-selection logic inside a tool node itself.
- Every graph invocation must respect a **hard iteration cap** (max 3 tool calls per turn) before being forced to `respond_stream`. This is not optional — an ungated loop against a free-tier rate limit is a reliability and cost risk.
- Every tool call's arguments must be validated against a schema before touching the database. Never let a hallucinated `escalate` or `update_progress` call write unvalidated data.
- Every turn must be logged to `agent_turns` (node path, tool calls, timestamps) — this is required for the evaluation harness, not optional telemetry.
- The toolset is fixed at 4 tools for MVP (`retrieve`, `quiz`, `explain`, `escalate`) plus `update_progress`. Do not add a new tool without updating `docs/PRD.md` §6 and confirming it against the "no open-ended tool access" rule (no general code execution, no open web search).

---

# 9. API route method rules

Use `POST` for actions that start or mutate work:

- `POST /agent/message` — sends a user message, streams the agent's turn back via SSE
- `POST /auth/signup`, `POST /auth/login` — thin wrappers over Supabase Auth
- `POST /progress` — manual progress writes (rare; most writes happen via `update_progress` tool inside the agent)

Use `GET` only for read/status routes:

- `GET /lessons`, `GET /lessons/{slug}`
- `GET /agent/trace/{sessionId}`
- `GET /stats/me`

Do not switch agent invocation between `GET` and `POST`. `POST /agent/message` is the only entry point into the graph.

---

# 10. Evaluation harness

This is the highest-leverage artifact in the project — treat it as required, not optional polish.

Two dimensions, both required before public beta:

1. **RAG groundedness** (RAGAS-style): faithfulness, answer relevancy, context precision, run against a hand-labeled set of 50–100 grammar Q&A pairs.
2. **Action-selection accuracy**: a hand-labeled set of ~50 multi-turn conversations, each annotated with the "correct" next action at each turn. Measure `decide_action`'s agreement with the human label.

Any change to `decide_action`'s prompt or logic must be checked against the action-selection eval set before merging. Any change to the `retrieve` tool must be checked against the RAGAS set.

Eval scripts live in `backend/eval/`. Do not skip running them when the task description mentions agent behavior or retrieval changes.

---

# 11. Security, code standards, and final rule

Never expose to browser code:

- Supabase service role key
- Groq API key
- Cohere API key

Never run from browser code:

- Groq calls
- Cohere calls
- LangGraph agent invocation
- Supabase service-role writes

## Environment variables

Canonical list lives in `.env.example`. Only `NEXT_PUBLIC_*` values may reach browser code; everything else is server-only.

| Variable                            | Purpose                                      | Exposure        |
| ----------------------------------- | -------------------------------------------- | --------------- |
| `NEXT_PUBLIC_SUPABASE_URL`          | Supabase project URL                         | client + server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`     | Supabase anon key                            | client + server |
| `SUPABASE_SERVICE_ROLE_KEY`         | Service-role DB access for agent tool writes | server only     |
| `GROQ_API_KEY`                      | LLM inference for all agent nodes            | server only     |
| `COHERE_API_KEY`                    | Rerank v3 in the `retrieve` tool             | server only     |
| `AGENT_MAX_TOOL_CALLS`              | Loop-guard cap per turn (default 3)          | server only     |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key                        | client + server |
| `CLERK_SECRET_KEY`                  | Clerk server-side key                        | server only     |

Keep this table and `.env.example` in sync when variables change.

Use TypeScript on the frontend, typed Python (Pydantic models) on the backend.

Prefer small functions, explicit types, centralized limits (loop caps, rate-limit backoff), server-only modules, typed agent state, and safe error handling.

Avoid `any`, unrelated refactors, over-engineering, long route handlers, mixed UI/agent logic, and unrequested tools.

When in doubt:

1. Keep it small.
2. Use the relevant skill.
3. Preserve frontend/API/agent/tool boundaries.
4. Ask a focused question if needed.
5. Save a prompt before coding.
6. Ask if it is good to execute.
7. Implement after confirmation.
8. Run available checks.
9. Share exact test steps.

---

# 12. Commands and checks

"Run available checks" means running these from the relevant root and reporting the results:

Frontend (`frontend/`):

- `npm run lint`
- `npm run build` — only when the change could affect the production build

Backend (`backend/`):

- `python -m pytest` — unit tests, including the graph-termination smoke test
- `python -m mypy app/` — type checking, if mypy is configured

Development and runtime:

- `npm run dev` (frontend) — watch the terminal for build errors
- `uvicorn app.main:app --reload` (backend) — watch the terminal for agent node logs

After implementation, run lint/typecheck at minimum. Add `build` and eval-harness runs when agent, retrieval, or route changes are involved. Report the exact command output; do not claim a check passed without running it.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
