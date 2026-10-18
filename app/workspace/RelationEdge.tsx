"use client";

import { useState } from "react";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from "@xyflow/react";

export function RelationEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, label }: EdgeProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(label || "关联"));
  const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 18 });

  const commit = () => {
    const next = draft.trim() || "关联";
    setEditing(false);
    setDraft(next);
    window.dispatchEvent(new CustomEvent("inspo:edge-label", { detail: { id, label: next } }));
  };

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div className="relation-edge-label nodrag nopan" style={{ transform: `translate(-50%, calc(-100% - 8px)) translate(${labelX}px, ${labelY}px)` }}>
          {editing ? (
            <input
              autoFocus
              value={draft}
              maxLength={80}
              aria-label="编辑连线说明"
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commit}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") commit();
                if (event.key === "Escape") { setDraft(String(label || "关联")); setEditing(false); }
              }}
            />
          ) : (
            <button title="点击修改连线说明" onClick={() => { setDraft(String(label || "关联")); setEditing(true); }}>{String(label || "关联")}</button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
