"use client";

import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import type { CanvasNode } from "./model";

const labels = { image: "图片", web: "网页", text: "文字", analysis: "AI 分析", element: "确认元素", group: "灵感簇" };

export function CardNode({ id, data, selected }: NodeProps<CanvasNode>) {
  const action = (name: string) => window.dispatchEvent(new CustomEvent("inspo:node-action", { detail: { id, action: name } }));
  if (data.kind === "group") return (
    <section className={"canvas-card card-group " + (selected ? "is-selected" : "")}>
      <NodeResizer minWidth={300} minHeight={220} isVisible={selected} />
      <div className="group-label"><span>灵感簇</span><strong>{data.title}</strong><small>{String(data.body ?? "双击名称可修改")}</small></div>
      <button className="node-menu" aria-label="灵感簇操作" onClick={(event) => { event.stopPropagation(); action("menu"); }}>•••</button>
    </section>
  );
  return (
    <article className={"canvas-card card-" + data.kind + (selected ? " is-selected" : "")}>
      <NodeResizer minWidth={180} minHeight={100} isVisible={selected} />
      <Handle type="target" position={Position.Left} className="node-handle" />
      <header className="card-head"><span className="card-kind">{labels[data.kind]}</span><button className="node-menu" aria-label="卡片操作" onClick={(event) => { event.stopPropagation(); action("menu"); }}>•••</button></header>
      {data.imageUrl && <div className="card-image" style={{ backgroundImage: "url(" + data.imageUrl + ")" }}><span className="source-chip">原始素材</span></div>}
      <div className="card-content">
        {data.kind === "analysis" && <div className="analysis-origin">↳ 跟随参考 · {data.sourceTitle}</div>}
        <h3>{data.title}</h3>
        {data.sourceUrl && <a href={data.sourceUrl} target="_blank" rel="noreferrer">{safeHost(data.sourceUrl)} ↗</a>}
        {data.body && <p>{data.body}</p>}
        {!!data.principles?.length && <details><summary>设计原则</summary><ul>{data.principles.map((item) => <li key={item}>{item}</li>)}</ul></details>}
        {!!data.colors?.length && <div className="color-row">{data.colors.map((color) => <span key={color} title={color} style={{ background: color }} />)}</div>}
        {!!data.tags?.length && <div className="tag-row">{data.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
        {data.status === "processing" && <div className="analysis-progress"><i /><span>真实模型正在拆解…</span></div>}
        {data.status === "failed" && <button className="inline-error" onClick={() => action("analyze")}>{data.error || "分析失败"} · 重试</button>}
      </div>
      <Handle type="source" position={Position.Right} className="node-handle" />
    </article>
  );
}

function safeHost(value: string) { try { return new URL(value).hostname; } catch { return value; } }
