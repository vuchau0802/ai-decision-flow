import { inngest } from "./client";
import OpenAI from "openai";

type FlowNode = { id: string; data: { prompt: string } };
type FlowEdge = { id: string; source: string; target: string; sourceHandle: "yes" | "no" };

function findRootNode(nodes: FlowNode[], edges: FlowEdge[]): FlowNode | undefined {
  // The root is whichever node never appears as a target of any edge.
  const targets = new Set(edges.map((e) => e.target));
  return nodes.find((n) => !targets.has(n.id));
}

async function askYesNo(prompt: string): Promise<"YES" | "NO"> {
  const response = await fetch(`${process.env.OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "openrouter/free",
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You answer decision questions with exactly one word: YES or NO. Never explain. If unsure, answer NO.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  const data = await response.json();
  console.log("DEBUG raw response:", JSON.stringify(data));

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

    const executionOrder: { nodeId: string; prompt: string; answer: "YES" | "NO" }[] = [];

    let currentNode = findRootNode(nodes, edges);
    let guard = 0; // safety cap so a malformed graph (a cycle) can't run forever

    while (currentNode && guard < 50) {
      guard++;
      const node = currentNode;

      // Each node's LLM call is its own Inngest step — this gives each decision
      // its own retry boundary, its own entry in the Inngest dashboard, and means
      // if step 3 fails, steps 1-2 are not re-run when Inngest retries.
      const answer = await step.run(`node-${node.id}`, async () => {
        return askYesNo(node.data.prompt);
      });

      executionOrder.push({ nodeId: node.id, prompt: node.data.prompt, answer });

      const handle = answer === "YES" ? "yes" : "no";
      const nextEdge = edges.find((e) => e.source === node.id && e.sourceHandle === handle);
      currentNode = nextEdge ? nodes.find((n) => n.id === nextEdge.target) : undefined;
    }

    return { executionOrder };
  }
);