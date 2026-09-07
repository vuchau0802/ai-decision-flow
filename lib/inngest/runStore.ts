export type RunStep = { nodeId: string; prompt: string; answer: "YES" | "NO" };

export type RunStatus = {
  status: "running" | "done" | "error";
  steps: RunStep[];
  error?: string;
};

// In-memory only — fine for local dev where Next.js and Inngest share one process.
// A production deployment would need a real store (DB, Redis) since serverless
// instances don't share memory across requests.
const store = new Map<string, RunStatus>();

export function initRun(eventId: string) {
  store.set(eventId, { status: "running", steps: [] });
}

export function appendStep(eventId: string, step: RunStep) {
  const run = store.get(eventId);
  if (run) run.steps.push(step);
}

export function finishRun(eventId: string) {
  const run = store.get(eventId);
  if (run) run.status = "done";
}

export function failRun(eventId: string, error: string) {
  const run = store.get(eventId);
  if (run) {
    run.status = "error";
    run.error = error;
  }
}

export function getRun(eventId: string): RunStatus | undefined {
  return store.get(eventId);
}