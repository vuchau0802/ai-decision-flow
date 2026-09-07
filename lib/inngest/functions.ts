import { inngest } from "./client";
import { initRun, appendStep, finishRun, failRun } from "./runStore";

type FlowNode = { id: string; data: { prompt: string } };
type FlowEdge = { id: string; source: string; target: string; sourceHandle: "yes" | "no" };

function findRootNode(nodes: FlowNode[], edges: FlowEdge[]): FlowNode | undefined {
  const targets = new Set(edges.map((e) => e.target));
  return nodes.find((n) => !targets.has(n.id));
}

async function askYesNo(prompt: string): Promise<"YES" | "NO"> {
  const response = await fetch(`${process.env.OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "openrouter/free",
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You answer decision questions with exactly one word: YES or NO. " +
            "Never explain your reasoning. Never add punctuation or extra words. " +
            "If you are genuinely unsure, answer NO.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`OpenRouter error ${response.status}: ${JSON.stringify(data)}`);
  }

  const text = (data.choices?.[0]?.message?.content || "").trim().toUpperCase();
  return text.includes("YES") ? "YES" : "NO";
}

export const runWorkflow = inngest.createFunction(
  { id: "run-decision-workflow", triggers: { event: "workflow/run" } },
  async ({ event, step }) => {
    const { nodes, edges } = event.data as { nodes: FlowNode[]; edges: FlowEdge[] };
    const eventId = event.id as string;

    initRun(eventId);

    const executionOrder: { nodeId: string; prompt: string; answer: "YES" | "NO" }[] = [];

    let currentNode = findRootNode(nodes, edges);
    let guard = 0;

    try {
      while (currentNode && guard < 50) {
        guard++;
        const node = currentNode;

        const answer = await step.run(`node-${node.id}`, async () => {
          return askYesNo(node.data.prompt);
        });

        const record = { nodeId: node.id, prompt: node.data.prompt, answer };
        executionOrder.push(record);
        appendStep(eventId, record);

        const handle = answer === "YES" ? "yes" : "no";
        const nextEdge = edges.find((e) => e.source === node.id && e.sourceHandle === handle);
        currentNode = nextEdge ? nodes.find((n) => n.id === nextEdge.target) : undefined;
      }

      finishRun(eventId);
      return { executionOrder };
    } catch (err) {
      failRun(eventId, err instanceof Error ? err.message : String(err));
      throw err;
    }
  }
);