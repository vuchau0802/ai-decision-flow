# AI Decision Flow

A visual workflow builder where each node is an AI decision step that answers YES or NO, built with React Flow for the canvas and Inngest for durable step-by-step execution.

## What this is

You build a tree of decision nodes on a visual canvas — each node holds a yes/no question. Connect nodes with two distinct edge types (YES and NO), then run the whole workflow: each node's question is sent to an LLM, which must answer with exactly one word, and execution branches down the YES or NO path depending on the answer. Execution runs through Inngest, so each node is a durable, independently-retryable step, not just a function call that dies if one part fails.

## Architecture

- **`components/flow/FlowCanvas.tsx`** — the React Flow canvas: node rendering, editable prompts, YES/NO edge creation, the run/save/load/export controls, and the live execution log panel.
- **`lib/inngest/client.ts`** — the Inngest client instance.
- **`lib/inngest/functions.ts`** — the actual workflow engine: given a graph (nodes + edges), it finds the root node, calls the LLM for a YES/NO answer via `step.run()`, follows the matching edge, and repeats until it reaches a node with no outgoing edge on that branch.
- **`lib/inngest/runStore.ts`** — an in-memory store tracking live run progress, keyed by event ID, so the frontend can poll for step-by-step updates while Inngest executes in the background.
- **`app/api/inngest/route.ts`** — the required Inngest serve handler; this is what lets the local Inngest dev server discover and invoke `runWorkflow`.
- **`app/api/run-workflow/route.ts`** — triggers a run by sending a `workflow/run` event to Inngest.
- **`app/api/run-status/route.ts`** — polled by the frontend every 800ms to get live step results while a run is in progress.

## How to run it

**Requires:** Node.js 20+, and an [OpenRouter](https://openrouter.ai) account (free, no card) with the two privacy toggles enabled at `openrouter.ai/settings/privacy`.

1. Install dependencies:
```bash
npm install
```

2. Copy the example environment file and fill in your real OpenRouter key:
```bash
cp .env.local.example .env.local
```

3. Start the Next.js app:
```bash
npm run dev
```

4. In a **second terminal**, start the Inngest dev server:
```bash
npx inngest-cli@latest dev
```

5. Open `http://localhost:3000` to build and run workflows. Open `http://localhost:8288` to see raw Inngest execution traces (each node as a separate step, retries, timing).

## How to use it

The page opens with a single sample node ("Is this a support request?"). From there:

- **Add a node** — click **+ Add Node**; a new empty decision node appears below the existing ones.
- **Edit a prompt** — click into any node's textarea and type the yes/no question you want that step to ask.
- **Connect nodes** — drag from a node's bottom handle to another node's top. Each node has two source handles: **YES** (green, left) and **NO** (red, right) — the edge you draw determines which branch the workflow takes. So to route, "node A on YES goes to node B", draw from A's green handle to B's top.
- **Delete a node or edge** — select it and press `Backspace`/`Delete` (React Flow's default edit behavior).
- **Run the workflow** — click **Run Workflow**. Execution starts from the root node (one with no incoming edge) and follows the YES/NO answer at each step until a node has no outgoing edge on that branch. The button is disabled while a run is in progress and switches to "Running…".
- **Follow progress** — the **Execution Log** panel on the right streams each step (node, prompt, answer) via polling. The node currently executing pulses blue; edges that were actually traversed turn thicker and animate.
- **Save / Load** — persists the graph to `localStorage` (key `ai-decision-flow-graph`). **Export JSON** downloads the graph as `workflow.json` (there's no re-import button — loading back is via Save/Load only).
- **Canvas chrome** — the bottom-left **Controls** panel gives zoom, fit-to-view, and lock; the **MiniMap** shows the full graph at a glance.

For best results keep the graph a tree (each node reached by at most one path) — a cycle will still run, up to the 50-step guard.

## Environment variables

| Variable | Description |
|----------|-------------|
| `OPENROUTER_API_KEY` | Your OpenRouter API key |
| `OPENAI_BASE_URL` | `https://openrouter.ai/api/v1` |
| `OPENAI_MODEL` | `openrouter/free` (a free-tier router across multiple models) |
| `INNGEST_DEV` | `http://localhost:8288` — points the client at the local dev server instead of Inngest Cloud |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | Only required for deploying to Inngest Cloud; left blank for local dev |

## Features by phase

**Phase 1 — Setup:** Next.js (App Router, TypeScript, Tailwind), React Flow, Inngest, OpenAI SDK-compatible client, Shadcn, environment config.

**Phase 2 — Foundations:** Interactive canvas, add/connect nodes, editable prompt text per node, two distinct edge types (YES = green, NO = red), graph state held in React Flow's own hooks.

**Phase 3 — Core execution:** Each node maps to its own Inngest step (`step.run("node-<id>", ...)`), the LLM is instructed to answer with exactly one word, execution follows the matching YES/NO edge, and a safety guard (`guard < 50`) prevents an infinite loop if a graph accidentally contains a cycle.

**Phase 4 — Polish** (3 chosen):
- **Execution logs panel** — a live sidebar showing each step's node, prompt, and answer as it happens, via polling `app/api/run-status`.
- **Visual execution state** — the currently-executing node gets a pulsing blue highlight; edges that were actually traversed (not just any edge) become thicker and animated.
- **Save/load workflows** — via `localStorage`, plus a bonus JSON export button for taking a graph out of the browser entirely.

## A real debugging story worth keeping

Every LLM call initially failed with `401 Missing Authentication header`, even though the correct OpenRouter key was clearly present in `.env.local`. The actual cause: a Windows **OS-level environment variable** named `OPENAI_API_KEY` (set previously, for an unrelated project, via `setx`) was silently overriding the `.env.local` value — Node's `dotenv` deliberately does not override variables that already exist in the OS environment. The fix was to use a dedicated variable name (`OPENROUTER_API_KEY`) that couldn't collide with any pre-existing OS-level variable. Lesson: an env var "not working" in one project can be caused by state left over from a completely different project on the same machine — always check `[System.Environment]::GetEnvironmentVariable(name, "User")` when a value that's clearly correct in `.env.local` doesn't seem to be reaching the code.