# PRD Copilot Pro
<img width="3024" height="1724" alt="e0ea9ab4e7b2e7f6f939ea43738462a8" src="https://github.com/user-attachments/assets/6d1a342a-7708-459e-8f14-5a571311994b" />

<img width="3024" height="1724" alt="1e792d37f923606e75b78e16c9f16d3d" src="https://github.com/user-attachments/assets/4ddbd4df-e8cf-4de7-84bc-47a28c54de7c" />



PRD Copilot Pro is a PM-facing AI copilot that turns messy product input into a reviewed PRD draft, then captures human feedback as reusable writing skills.

The product path is intentionally agentic:

```text
Input → Normalizer → Planner → Generator → Evaluator → Human Review → Skill
```

It also keeps the original three-tier experiment mode for comparing bare prompting, structured prompting, and multi-agent collaboration.

## Highlights

- **Structured requirement intake**: normalize text or chat records into summary, user story, constraints, open questions, and confidence.
- **Planner as harness**: generate a writing plan and task-specific evaluation rule from an embedded PRD rubric skill.
- **Provider-independent agents**: use different providers per role; Claude for planning, GLM for PRD drafting, Kimi for evaluation.
- **Human-in-the-loop editing**: PMs can edit Planner outputs, answer Planner questions, revise PRD drafts, and override evaluation decisions.
- **LLM-as-judge evaluation**: score PRDs with weighted dimensions and hard gates for business value, acceptance criteria, and decision certainty.
- **Skill sedimentation**: summarize reusable PRD-writing lessons from human feedback instead of storing project-specific one-offs.
- **Experiment mode**: keep A/B/C generation comparison at `/experiment` for demos and model behavior analysis.

## Tech Stack

- Next.js 14 App Router
- TypeScript
- Tailwind CSS + shadcn/ui primitives
- Vercel AI SDK
- Anthropic-compatible relay for Claude
- SiliconFlow OpenAI-compatible API for GLM/Kimi
- Zustand for local session state
- Zod for runtime schemas

## Agent Roles

| Role | Responsibility | Default model |
|---|---|---|
| Normalizer | Turn raw text/chat into structured `RequirementDraft` | `claude-opus-4-6` |
| Planner | Produce writing plan and evaluation rule from rubric skill | `claude-opus-4-6` |
| Generator | Draft or revise PRD Markdown from Planner output and feedback | `Pro/zai-org/GLM-5.1` |
| Evaluator | Score the PRD with Planner's evaluation rule | `Pro/moonshotai/Kimi-K2.6` |

Model routing is centralized in [`src/config/models.ts`](src/config/models.ts).

## Getting Started

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

Create `.env.local` from `.env.example` and fill your own keys:

```bash
ANTHROPIC_BASE_URL=https://your-anthropic-compatible-endpoint/v1
ANTHROPIC_API_KEY=replace_with_your_anthropic_or_relay_key
ANTHROPIC_AUTH_TOKEN=replace_with_your_anthropic_or_relay_key_if_needed
SILICONFLOW_API_KEY=replace_with_your_siliconflow_key
```

`.env.local` is ignored by Git. Do not commit real API keys.

## Useful Commands

```bash
npm run dev
npm run build
npx tsc --noEmit
```

## Project Structure

```text
src/
├── app/                 # App Router pages and API routes
├── components/          # Dashboard, input, generation and UI components
├── config/              # Role-based model routing and pricing
├── lib/
│   ├── agents/          # Normalizer, Planner, Generator, Evaluator
│   ├── llm/             # Provider clients
│   ├── types/           # Zod schemas and shared types
│   └── utils/           # logging, fetch and diff helpers
└── store/               # Zustand session store

skills/                  # Reusable rubric/skill markdown files
demo-artifacts/          # Demo evidence, diagnostics and video scripts
```

## Demo Flow

1. Paste a product idea or chat record.
2. Normalize it into structured requirement data.
3. Run Planner to produce a writing plan and evaluation rule.
4. Generate a PRD draft and edit it inline.
5. Submit to Evaluator for score, hard gates, feedback and revision suggestions.
6. Approve, export, or send it back for revision.
7. Enter Skill sedimentation to extract reusable PRD-writing rules from human feedback.

## Notes

- The project is an MVP prototype built around a local, single-session workflow.
- Long LLM calls can vary by provider and relay latency.
- Demo artifacts are kept for reproducibility, but local raw screen captures are ignored.
