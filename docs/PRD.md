# Product Requirements Document
## HindiMate — An Agentic AI Hindi Learning Companion

**Version:** 2.0 (Agentic Architecture)
**Owner:** Nirmal V G
**Status:** Draft for build
**Document type:** Engineering-grade PRD (architecture, scope, and delivery plan)

---

## 0. What changed from v1, and why it matters

v1 was a RAG chatbot: one retrieve → generate pass per message, no memory of intent across turns, no autonomy over what to do next. This version makes HindiMate an actual **agent** — a system that plans, decides which tool to invoke, acts, observes the result, and revises its plan, across a multi-turn session with persistent state. That distinction is the entire point of this rewrite, so it's worth being precise about it before anything else:

| | v1 (RAG chatbot) | v2 (Agent) |
|---|---|---|
| Control flow | Fixed: retrieve → generate → respond | Dynamic: LLM decides the next node at each step |
| State | Stateless per message | Session-level graph state carried across turns |
| Tools | Retrieval only | Retrieval, dictionary lookup, spaced-repetition scheduler, quiz generator, progress writer, difficulty adjuster — LLM chooses which to call |
| Planning | None | Explicit plan/goal per session, revised as the user responds |
| Framework | Plain FastAPI endpoint | LangGraph state machine |

This also directly closes the gap you and I already identified: JARVIS has real multi-agent orchestration experience that's never been labeled with a standard framework, and Samskriti is RAG but not agentic. HindiMate v2 becomes your **LangGraph portfolio piece** — the third leg of a three-project story (RAG discipline → agentic orchestration → applied tutoring product) that a technical interviewer can actually map to named frameworks on your resume.

Everything about staying free/zero-cost from v1 still holds. Agentic does not mean expensive — it means more LLM calls per turn (each node decision costs a call), which is exactly why the model choice below matters more here than it did in v1.

---

## 1. Vision & Problem Statement

**Vision:** A free, always-on Hindi tutor that behaves like a real tutor would — deciding in the moment whether to explain, quiz, correct, escalate difficulty, or pull in a dictionary lookup — rather than executing the same fixed retrieve-then-answer script for every message.

**Problem:** Static or RAG-only tutors respond well to isolated questions but can't hold a teaching *strategy* across a session. A real tutor notices you keep messing up postpositions and decides, unprompted, to drill that specific pattern next. That decision-making loop — not just grounded answers — is what's missing from every free Hindi-learning tool on the market, and it's what an agentic architecture is actually for.

**Differentiation / moat:**
- Session-level pedagogical planning: the agent tracks a goal ("reduce postposition errors") and revises its next action based on how the user performs, not just what they last typed.
- Tool-using tutor: dictionary lookups, spaced-repetition scheduling, and quiz generation are real tool calls the LLM invokes, not hardcoded UI buttons — visible and inspectable in the agent trace.
- Grounded like Samskriti: retrieval is one of the agent's tools, so answers stay citation-backed even though the control flow around it is now dynamic.

---

## 2. Success Metrics — MVP-realistic, phased

| Phase | Metric | Target |
|---|---|---|
| **MVP (Week 8)** | Agent picks the *correct* next action (retrieve / quiz / explain / escalate) on a hand-labeled eval set | ≥ 80% agreement with human-labeled "correct" action |
| MVP | RAG-tool groundedness (RAGAS faithfulness, when retrieval is invoked) | ≥ 0.85 |
| MVP | End-to-end latency per turn (P95), including multi-node agent reasoning | < 4s on Groq |
| MVP | Tool-call success rate (no malformed calls, no infinite loops) | ≥ 98% across eval sessions |
| **Public beta (Month 3)** | Active users | 200–500 |
| Public beta | Multi-turn session completion (user finishes a full tutoring loop: assess → drill → recheck) | ≥ 40% |
| Public beta | Infra cost | ≤ $10/month |
| **Growth (Month 6)** | Active users | 2,000–5,000 MAU, contingent on beta retention data |

The agent-specific metrics (action-selection accuracy, tool-call success rate, loop termination) are the ones that matter most here — they're what prove this is a working agent and not a chatbot wearing an agent's vocabulary.

---

## 3. Personas & User Stories

| Persona | Goal | Agentic flow difference from v1 |
|---|---|---|
| **Beginner Learner** | Learn survival Hindi | Agent assesses starting level in the first exchange, then *plans* a lesson sequence rather than serving a fixed lesson list |
| **Intermediate Student** | Fix specific grammar gaps | Agent notices repeated errors in `error_tags`, autonomously decides to inject a targeted drill mid-session instead of waiting to be asked |
| **Self-Directed Learner** | Build a personal curriculum | Agent maintains a session goal object, revises it turn-by-turn, and explains its own reasoning when asked ("why did you just quiz me on that?") |

---

## 4. Agent Architecture — LangGraph State Machine

This is the core of the product. The agent is a graph of nodes; the LLM (via a routing/decision node) chooses which node to visit next based on current state, rather than the backend hardcoding the sequence.

```
                          ┌─────────────────┐
                          │   assess_input   │  ← parses user message,
                          │                   │    updates session state
                          └────────┬─────────┘
                                   │
                          ┌────────▼─────────┐
                          │   decide_action    │  ← LLM routing node:
                          │  (the "agent" step) │    picks next node based
                          └──┬───┬───┬───┬────┘    on state + goal
                 ┌───────────┘   │   │   └───────────┐
                 ▼                ▼   ▼                ▼
          ┌────────────┐  ┌───────────┐  ┌──────────┐  ┌──────────────┐
          │  retrieve   │  │   quiz     │  │ explain  │  │  escalate /   │
          │  (RAG tool) │  │ generator  │  │ (direct  │  │  adjust       │
          │             │  │   tool     │  │  answer) │  │  difficulty   │
          └──────┬──────┘  └─────┬─────┘  └────┬─────┘  └──────┬───────┘
                 └────────────────┴──────────────┴───────────────┘
                                   │
                          ┌────────▼─────────┐
                          │  update_progress   │  ← writes error_tags,
                          │      (tool)         │    streak, session goal
                          └────────┬─────────┘
                                   │
                          ┌────────▼─────────┐
                          │  respond_stream    │  → SSE back to client
                          └───────────────────┘
                                   │
                         (loop back to assess_input
                          on next user message, with
                          carried-forward session state)
```

**Nodes and their tools:**

| Node | Type | Tool(s) it wraps |
|---|---|---|
| `assess_input` | Parser | Lightweight LLM call: extract intent, detect errors in user's Hindi text |
| `decide_action` | Router (the actual "agent" decision point) | No tool — pure LLM reasoning over current `AgentState` |
| `retrieve` | Tool node | Hybrid BM25 + pgvector retrieval, Cohere Rerank v3 (same as v1's RAG pipeline, now invoked *conditionally*) |
| `quiz` | Tool node | Generates practice sentences targeting the user's weakest `error_tags` |
| `explain` | Tool node | Direct grounded explanation (reuses retrieved context if available) |
| `escalate` | Tool node | Adjusts difficulty tier, updates session goal |
| `update_progress` | Tool node | Writes to `user_progress`, `error_tags`, `session_state` tables |
| `respond_stream` | Output | Streams the final response via SSE, with citations if `retrieve` was used |

**Why this framework and not a hand-rolled loop:** LangGraph gives you built-in state persistence, conditional edges, and cycle handling (with loop-guard limits) — exactly the primitives an agent needs, and exactly the vocabulary that maps cleanly onto your resume ("built a LangGraph-orchestrated tutoring agent" is a concrete, verifiable claim; "used an LLM in a loop" is not).

**Loop safety (non-negotiable for an MVP agent):** cap `decide_action` iterations per turn (e.g., max 3 tool calls before forced `respond_stream`), and log every routing decision for the eval harness in §6. An agent that can loop indefinitely on a free-tier rate limit is a cost and reliability risk, not just a UX one.

---

## 5. Functional Requirements

### 5.1 Frontend — Next.js (App Router) + TailwindCSS

- **Pages:** `/` (marketplace), `/chat` (primary agent interface — this is now the main surface, more than static lesson pages), `/profile`, `/settings`
- **Components:**
  - `AgentChatWindow` — streams responses via SSE; renders which node/tool produced each part of the response (e.g., a small "quizzed you on this because..." tag) — this trace visibility is a differentiator, keep it
  - `CitationChip` — unchanged from v1, shown when `retrieve` was used
  - `AgentTraceDrawer` — optional collapsible panel showing the graph path taken for a response (great for demos/portfolio screenshots, cheap to build since LangGraph already exposes this)
  - `ProgressRing` — unchanged from v1
- **State:** Zustand (UI) + React Query (server state)

### 5.2 Backend — FastAPI + LangGraph (Python 3.11)

- **Agent Service** — hosts the LangGraph graph described in §4; this replaces v1's separate "AI Service" and "RAG Service" — RAG is now one tool inside the agent, not a standalone service.
- **Auth Service** — Supabase Auth, unchanged from v1.
- **Lesson Service** — CRUD for seed lesson content, unchanged, now used as retrieval source material rather than a rigid sequence.
- **Tool implementations** live as plain Python functions registered with LangGraph's tool-calling interface — `retrieve_grammar()`, `generate_quiz()`, `update_error_tags()`, etc.

**Endpoints:**

```
POST /auth/signup / /auth/login     (Supabase Auth, unchanged)
GET  /lessons, /lessons/{slug}       (unchanged, now seed content for retrieval)
POST /agent/message                  {userId, sessionId, message} -> SSE stream
                                      of the agent's full turn (may include
                                      multiple tool-call events before final text)
GET  /agent/trace/{sessionId}        returns the node path for the last N turns
                                      (powers AgentTraceDrawer)
GET  /stats/me                       per-user dashboard
```

`/agent/message` replaces v1's `/chat` — same shape from the client's point of view (send a message, get a stream back), but the server-side handling is now graph traversal instead of a single pipeline call.

### 5.3 Model & tool-calling requirements

This is the part that determines whether "free" actually holds:

- **LLM:** Groq-hosted LLaMA 3.1 (70B for `decide_action` and `assess_input` — these need real reasoning; 8B is acceptable for `quiz`/`explain` generation to save on rate-limit budget). Confirm current free-tier model availability and rate limits on Groq's docs at build time, since their free-tier lineup changes.
- **Tool-calling support:** Groq's OpenAI-compatible function-calling API supports this directly — no need for a separate framework-level tool-call parser.
- **Why multi-node LLM calls stay free-tier viable:** each turn now costs 2–4 LLM calls (assess, decide, one tool's generation, and occasionally a second decide-loop) instead of v1's single call. Groq's free tier has generous token throughput but real requests-per-minute caps — this is the actual constraint to test early (Sprint 2, not Sprint 7), not a hypothetical.
- **Fallback plan:** have a second free-tier provider (e.g., a smaller self-hosted model via Ollama on your own machine for local dev/testing, or together.ai's free tier) ready as a fallback path before public beta — an agent that fails silently mid-loop when it hits a rate limit is a worse failure mode than a chatbot that just returns an error.

---

## 6. Evaluation — more than RAGAS now, and it's more important than in v1

v1's RAGAS harness (faithfulness, relevancy, context precision) still applies to the `retrieve` tool specifically. But an agent needs a second evaluation layer that v1 didn't:

- **Action-selection eval:** a hand-labeled set of ~50 multi-turn conversations, each annotated with the "correct" next action at each turn (retrieve / quiz / explain / escalate). Run the agent's `decide_action` node against these and measure agreement with the human label. This is the eval that actually proves the agentic claim — without it, "AI Agent" is just a label on a chatbot.
- **Loop/termination eval:** confirm the agent never exceeds the tool-call cap and always reaches `respond_stream` within a bounded number of steps across the eval set.
- **Tool-call correctness:** for each tool invocation, check the arguments passed are well-formed (e.g., `generate_quiz` called with valid `error_tags`, not hallucinated ones).

Build this harness in Sprint 4, same position as v1 — it's still the single highest-leverage artifact in the project, just with a second dimension added.

---

## 7. Data Model

| Table | Key fields | Notes |
|---|---|---|
| `users` | id, email, display_name, created_at | Supabase Auth-backed |
| `lessons` | slug, title, difficulty, order, content_id | Now retrieval source material |
| `lesson_content` | id, lesson_id, body_md, media_url | |
| `sessions` | id, user_id, started_at, goal_state (jsonb) | **New** — persists the agent's session-level plan/goal across turns |
| `agent_turns` | id, session_id, node_path (jsonb array), tool_calls (jsonb), response_text, created_at | **New** — logs the graph path per turn, powers `AgentTraceDrawer` and the eval harness |
| `user_progress` | user_id, lesson_slug, completed_at, streak_count | Unchanged |
| `error_tags` | user_id, grammar_rule_id, occurred_at | Now actively read by `decide_action`, not just logged |
| `rag_chunks` | id, vector, text, source_id, rule_tag | Unchanged, now a tool's data source rather than a fixed pipeline step |

The two new tables (`sessions`, `agent_turns`) are what make this genuinely agentic rather than RAG-with-extra-steps — they're what give the system persistent, inspectable state.

---

## 8. Security & Privacy — agent-specific additions to v1's baseline

Everything in v1 (Supabase Auth, TLS by default, client-side voice, moderation pass) still applies. Additional concerns specific to tool-calling agents:

- **Tool-call validation:** never execute a tool call with unvalidated arguments — e.g., if `decide_action` hallucinates a malformed `escalate` call, validate against a schema before it touches `user_progress`. This is the agent-specific equivalent of input sanitization.
- **No open-ended tool access:** the agent's toolset is fixed and small (retrieval, quiz, progress-write) — do not add a general code-execution or web-search tool to a free-tier language tutor; it multiplies both cost and attack surface for no product benefit.
- **Rate-limit-aware degradation:** if a tool call fails (e.g., Groq rate limit mid-loop), the agent should degrade to a direct answer rather than retry indefinitely — log the failure, don't loop on it.

---

## 9. Deployment Pipeline

Unchanged from v1 in spirit — no Kubernetes, no Terraform, no multi-region:

1. **CI:** GitHub Actions — lint, unit tests (including a smoke test that runs a fixed conversation through the graph and checks it terminates).
2. **CD:** Vercel (frontend) + Render/Railway (FastAPI + LangGraph service).
3. **Monitoring:** Vercel Analytics + Render logs + a simple dashboard query over `agent_turns` for node-path distribution (which nodes fire most often — useful debugging signal, effectively free since you're already logging it for eval).

---

## 10. Delivery Plan — Realistic Sprints

| Sprint | Duration | Deliverable |
|---|---|---|
| Sprint 0 | 2–3 days | Repo scaffold, Supabase project, Next.js + FastAPI skeleton, CI |
| Sprint 1 | 1 week | Lesson data model + marketplace UI (static content) |
| Sprint 2 | 1.5 weeks | LangGraph skeleton: `assess_input → decide_action → respond_stream` with only the `explain` tool wired up — validate the loop and Groq rate limits work end-to-end *before* adding more tools |
| Sprint 3 | 1 week | Add `retrieve` tool (reuse v1's RAG pipeline), `quiz` tool, `update_progress` tool |
| Sprint 4 | 1 week | **Evaluation harness** — action-selection eval + RAGAS-for-retrieval + loop-termination checks. Do not skip. |
| Sprint 5 | 1 week | `/agent/message` + `/agent/trace` endpoints, `AgentChatWindow` + `AgentTraceDrawer` UI |
| Sprint 6 | 1 week | Auth, progress tracking, `escalate` tool, session-goal persistence |
| Sprint 7 | 3–4 days | Voice input, mobile polish |
| Sprint 8 | ongoing | Public beta: build-in-public posts, collect real multi-turn session data |
| Phase 2 (post-beta) | — | Fallback-provider failover, admin analytics dashboard, expanded toolset only if a concrete gap shows up in beta data |
| Phase 3 (growth-gated) | — | Fine-tuning, multi-region infra — same gating as v1, unchanged |

Total to public beta: **~8 weeks** solo — two weeks longer than v1's plan, entirely because of Sprint 2 (proving the graph loop is stable) and Sprint 4's extra eval dimension. That's the real cost of "agentic" and it's worth paying deliberately, not accidentally discovering in production.

---

## 11. Risks & Open Questions

| Risk | Mitigation |
|---|---|
| `decide_action` picks the wrong tool often enough to feel broken | This is exactly why Sprint 4's eval harness exists — treat sub-80% action-selection agreement as a blocker, not a launch-with-caveats issue |
| Multi-call-per-turn cost hits Groq free-tier RPM limits under real usage | Load-test rate limits in Sprint 2, not Sprint 8; keep the fallback provider integration ready before beta |
| Agent loops or stalls (never reaches `respond_stream`) | Hard iteration cap + timeout, tested explicitly in the CI smoke test |
| Scope creep — "agent" becomes an excuse to keep adding tools | Freeze the toolset at 4 tools (`retrieve`, `quiz`, `explain`, `escalate`) for MVP; anything else is Phase 2 |
| Same hand-authored-grammar-content bottleneck as v1 | Unchanged mitigation: start with the 10 highest-frequency beginner errors, expand from real beta questions |

---

## 12. Future Enhancements (explicitly post-MVP)

- Additional tools: pronunciation scoring (would need server-side audio processing — a real cost/privacy tradeoff to make deliberately, not by default)
- Multi-agent split (a separate "assessor" agent and "tutor" agent communicating, rather than one graph) — interesting but only worth it if a single graph demonstrably can't hold the complexity
- Adaptive curriculum model trained on aggregated `agent_turns` + `error_tags` data
- LoRA fine-tuning once there's real conversation volume to fine-tune against

---

## 13. Portfolio Framing Note

This version's honest, verifiable claim is: *"Built an agentic Hindi-tutoring system using LangGraph — a state-machine agent that dynamically selects between retrieval, quiz-generation, and difficulty-escalation tools based on session-level pedagogical state, with an evaluation harness measuring both retrieval groundedness and action-selection accuracy."* That sentence is checkable against the repo, the eval numbers, and the `agent_turns` trace log — which is exactly the level of specificity that separates a real agentic-systems claim from a resume buzzword. Lead with the action-selection eval score in any write-up; it's the number that proves this is an agent and not a chatbot with a new name.
