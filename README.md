# HindiMate

An agentic AI Hindi-learning companion. Built as a LangGraph-orchestrated tutoring
agent that dynamically chooses between retrieval, quiz-generation, explanation,
and difficulty-escalation tools based on session-level pedagogical state —
not a fixed retrieve-then-answer pipeline.

## Why this exists

Most free Hindi-learning tools are either gamified-but-shallow or expensive/
human-dependent. HindiMate aims for a free, always-available tutor that
explains grammar corrections with citations back to real grammar sources
(no hallucinated rules), and adapts its teaching strategy turn-by-turn based
on the learner's actual error patterns.

Full product requirements, architecture, and rationale: [`docs/PRD.md`](./docs/PRD.md)

## Structure

```
hindimate/
├── frontend/     Next.js (App Router) + TailwindCSS
├── backend/      FastAPI + LangGraph agent + RAG pipeline
└── docs/         PRD and architecture notes
```

## Status

🚧 Under active build. Following the sprint plan in the PRD.

## Stack

- **Frontend:** Next.js, TailwindCSS, Zustand, TanStack Query
- **Agent orchestration:** LangGraph
- **LLM inference:** Groq (LLaMA 3.1)
- **Retrieval:** Supabase/pgvector, Cohere Rerank v3
- **Auth + DB:** Supabase
- **Hosting:** Vercel (frontend), Render (backend) — free tiers throughout
