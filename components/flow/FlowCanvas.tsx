"use client";

import { useCallback, useState, useRef, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  Edge,
  Node,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

type RunStep = { nodeId: string; prompt: string; answer: "YES" | "NO" };
type RunStatus = { status: "running" | "done" | "error"; steps: RunStep[]; error?: string };

const STORAGE_KEY = "ai-decision-flow-graph";

function DecisionNode({
  id,
  data,
}: {
  id: string;
  data: { prompt: string; onChange: (id: string, value: string) => void; active?: boolean };
}) {
  return (
    <div
      className={`rounded-lg border-2 bg-white shadow-md p-3 w-64 transition-all ${
        data.active ? "border-blue-500 ring-4 ring-blue-200 animate-pulse" : "border-gray-300"
      }`}
    >
      <Handle type="target" position={Position.Top} />
      <div className="text-xs font-semibold text-gray-500 mb-1">Decision Node</div>
      <textarea
        className="w-full text-sm border rounded p-2 resize-none nodrag"
        rows={3}
        placeholder="Enter a yes/no question for the AI to answer..."
        value={data.prompt}
        onChange={(e) => data.onChange(id, e.target.value)}
      />
      <div className="flex justify-between mt-2 text-xs">
        <span className="text-green-600 font-medium">YES →</span>
        <span className="text-red-600 font-medium">NO →</span>
      </div>
      <Handle type="source" position={Position.Bottom} id="yes" style={{ left: "25%", background: "#16a34a" }} />
      <Handle type="source" position={Position.Bottom} id="no" style={{ left: "75%", background: "#dc2626" }} />
    </div>
  );
}

const nodeTypes = { decision: DecisionNode };

let nodeIdCounter = 1;

const initialNodes: Node[] = [
  {
    id: "1",
    type: "decision",
    position: { x: 250, y: 50 },
    data: { prompt: "Is this a support request?" },
  },
];

export default function FlowCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [logs, setLogs] = useState<RunStep[]>([]);
  const [runState, setRunState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const updateNodePrompt = useCallback(
    (id: string, value: string) => {
      setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, prompt: value } } : n)));
    },
    [setNodes]
  );

  const activeNodeId = logs.length > 0 ? logs[logs.length - 1].nodeId : null;
  const executedPairs = new Set(logs.map((s) => `${s.nodeId}:${s.answer === "YES" ? "yes" : "no"}`));

  const nodesWithHandlers = nodes.map((n) => ({
    ...n,
    data: { ...n.data, onChange: updateNodePrompt, active: n.id === activeNodeId && runState === "running" },
  }));

  const edgesWithExecutionStyle = edges.map((e) => {
    const taken = executedPairs.has(`${e.source}:${e.sourceHandle}`);
    return taken ? { ...e, animated: true, style: { ...e.style, strokeWidth: 4 } } : e;
  });

  const onConnect = useCallback(
    (connection: Connection) => {
      const isYes = connection.sourceHandle === "yes";
      const newEdge: Edge = {
        ...connection,
        id: `e${connection.source}-${connection.target}-${connection.sourceHandle}`,
        label: isYes ? "YES" : "NO",
        style: { stroke: isYes ? "#16a34a" : "#dc2626", strokeWidth: 2 },
        labelStyle: { fill: isYes ? "#16a34a" : "#dc2626", fontWeight: 700 },
        animated: false,
      };
      setEdges((eds) => addEdge(newEdge, eds));
    },
    [setEdges]
  );

  const addNode = useCallback(() => {
    nodeIdCounter += 1;
    const newNode: Node = {
      id: `${nodeIdCounter}`,
      type: "decision",
      position: { x: 250 + Math.random() * 200, y: 200 + nodeIdCounter * 100 },
      data: { prompt: "" },
    };
    setNodes((nds) => [...nds, newNode]);
  }, [setNodes]);

  const saveGraph = useCallback(() => {
    const cleanNodes = nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: { prompt: n.data.prompt } }));
    const cleanEdges = edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes: cleanNodes, edges: cleanEdges }));
    alert("Workflow saved locally.");
  }, [nodes, edges]);

  const loadGraph = useCallback(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      alert("No saved workflow found.");
      return;
    }
    const { nodes: savedNodes, edges: savedEdges } = JSON.parse(raw);
    setNodes(savedNodes);
    setEdges(
      savedEdges.map((e: { id: string; source: string; target: string; sourceHandle: "yes" | "no" }) => ({
        ...e,
        label: e.sourceHandle === "yes" ? "YES" : "NO",
        style: { stroke: e.sourceHandle === "yes" ? "#16a34a" : "#dc2626", strokeWidth: 2 },
        labelStyle: { fill: e.sourceHandle === "yes" ? "#16a34a" : "#dc2626", fontWeight: 700 },
      }))
    );
    setLogs([]);
    setRunState("idle");
  }, [setNodes, setEdges]);

  const exportJson = useCallback(() => {
    const cleanNodes = nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: { prompt: n.data.prompt } }));
    const cleanEdges = edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle }));
    const blob = new Blob([JSON.stringify({ nodes: cleanNodes, edges: cleanEdges }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "workflow.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [nodes, edges]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const runWorkflow = useCallback(async () => {
    setLogs([]);
    setErrorMsg(null);
    setRunState("running");

    const cleanEdges = edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle }));
    const cleanNodes = nodes.map((n) => ({ id: n.id, data: { prompt: n.data.prompt } }));

    const res = await fetch("/api/run-workflow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodes: cleanNodes, edges: cleanEdges }),
    });
    const { eventId } = await res.json();

    stopPolling();
    pollRef.current = setInterval(async () => {
      const statusRes = await fetch(`/api/run-status?eventId=${eventId}`);
      if (statusRes.status === 404) return;
      const data: RunStatus = await statusRes.json();
      setLogs(data.steps);
      if (data.status === "done") {
        setRunState("done");
        stopPolling();
      } else if (data.status === "error") {
        setRunState("error");
        setErrorMsg(data.error || "Unknown error");
        stopPolling();
      }
    }, 800);
  }, [nodes, edges, stopPolling]);

  return (
    <div className="w-full h-screen relative flex">
      <div className="flex-1 relative">
        <div className="absolute top-4 left-4 z-10 flex gap-2">
          <button onClick={addNode} className="bg-blue-600 text-white px-4 py-2 rounded-md shadow hover:bg-blue-700">
            + Add Node
          </button>
          <button
            onClick={runWorkflow}
            disabled={runState === "running"}
            className="bg-green-600 text-white px-4 py-2 rounded-md shadow hover:bg-green-700 disabled:opacity-50"
          >
            {runState === "running" ? "Running…" : "▶ Run Workflow"}
          </button>
          <button onClick={saveGraph} className="bg-gray-600 text-white px-4 py-2 rounded-md shadow hover:bg-gray-700">
            Save
          </button>
          <button onClick={loadGraph} className="bg-gray-600 text-white px-4 py-2 rounded-md shadow hover:bg-gray-700">
            Load
          </button>
          <button onClick={exportJson} className="bg-gray-600 text-white px-4 py-2 rounded-md shadow hover:bg-gray-700">
            Export JSON
          </button>
        </div>
        <ReactFlow
          nodes={nodesWithHandlers}
          edges={edgesWithExecutionStyle}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>

      <div className="w-80 border-l bg-gray-50 p-4 overflow-y-auto">
        <h2 className="font-semibold text-sm text-gray-700 mb-3">Execution Log</h2>
        {runState === "idle" && <p className="text-xs text-gray-400">Run the workflow to see step-by-step results here.</p>}
        {runState === "error" && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2 mb-2">Error: {errorMsg}</div>
        )}
        <ol className="space-y-2">
          {logs.map((step, i) => (
            <li key={i} className="text-xs bg-white border rounded p-2 shadow-sm">
              <div className="font-mono text-gray-400">Step {i + 1} · node {step.nodeId}</div>
              <div className="text-gray-700 mt-1">{step.prompt}</div>
              <div className={`mt-1 font-bold ${step.answer === "YES" ? "text-green-600" : "text-red-600"}`}>
                → {step.answer}
              </div>
            </li>
          ))}
        </ol>
        {runState === "done" && (
          <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded p-2 mt-3">
            Workflow finished — {logs.length} step{logs.length !== 1 ? "s" : ""} executed.
          </div>
        )}
      </div>
    </div>
  );
}