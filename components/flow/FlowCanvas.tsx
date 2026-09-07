"use client";
 
import { useCallback, useState } from "react";
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
 
// --- Custom node: a decision step with an editable prompt ---
function DecisionNode({ id, data }: { id: string; data: { prompt: string; onChange: (id: string, value: string) => void } }) {
  return (
    <div className="rounded-lg border-2 border-gray-300 bg-white shadow-md p-3 w-64">
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
 
  const updateNodePrompt = useCallback(
    (id: string, value: string) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, prompt: value } } : n))
      );
    },
    [setNodes]
  );
 
  // Inject the onChange handler into every node's data so the textarea can update state
  const nodesWithHandlers = nodes.map((n) => ({
    ...n,
    data: { ...n.data, onChange: updateNodePrompt },
  }));
  
  const runWorkflow = useCallback(async () => {
  const cleanEdges = edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
  }));
  const cleanNodes = nodes.map((n) => ({ id: n.id, data: { prompt: n.data.prompt } }));

  const res = await fetch("/api/run-workflow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nodes: cleanNodes, edges: cleanEdges }),
  });
  const { eventId } = await res.json();
  alert(`Workflow started! Event ID: ${eventId}\nCheck the Inngest dashboard at http://localhost:8288 to see execution.`);
  }, [nodes, edges]);

  const onConnect = useCallback(
    (connection: Connection) => {
      // Edge color/label depends on which handle (yes/no) it came from
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
 
  return (
    <div className="w-full h-screen relative">
      <button
        onClick={addNode}
        className="absolute top-4 left-4 z-10 bg-blue-600 text-white px-4 py-2 rounded-md shadow hover:bg-blue-700"
      >
        + Add Node
      </button>
      
      <button
        onClick={runWorkflow}
        className="absolute top-4 left-40 z-10 bg-green-600 text-white px-4 py-2 rounded-md shadow hover:bg-green-700"
    >
        ▶ Run Workflow
      </button>
    
      <ReactFlow
        nodes={nodesWithHandlers}
        edges={edges}
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
  );
}
 
