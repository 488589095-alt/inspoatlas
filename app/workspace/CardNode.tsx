"use client";

import { useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import type { CanvasNode } from "./model";

const labels = {
  image: "图片",
  web: "网页",
  text: "文字",
  analysis: "AI 拆解",
  element: "确认元素",
  group: "分组",
};

const sourceKinds = new Set(["image", "web", "text"]);

export function CardNode({ id, data, selected }: NodeProps<CanvasNode>) {
  const action = (name: string, event?: ReactMouseEvent) => {
    window.dispatchEvent(new CustomEvent("inspo:node-action", {
      detail: { id, action: name, x: event?.clientX, y: event?.clientY },
    }));
  };

  if (data.kind === "group") {
    return (
      <section className={"canvas-card card-group " + (selected ? "is-selected " : "") + (data.preview ? "is-preview" : "")}>
        <NodeResizer minWidth={320} minHeight={220} isVisible={selected} />
        <div className="group-label">
          <span>分组</span>
          <InlineTitle id={id} value={data.title} className="group-title" />
          <small>{String(data.body ?? "拖动分组可一起移动内部卡片")}</small>
        </div>
        <button className="node-menu nodrag" aria-label="分组操作" onClick={(event) => { event.stopPropagation(); action("menu", event); }}>•••</button>
      </section>
    );
  }

  const isSource = sourceKinds.has(data.kind);
  const hasAnalysis = Boolean(data.analysisSummary || data.analysisId || data.status === "processing" || data.analysisError);

  return (
    <article className={"canvas-card card-" + data.kind + (selected ? " is-selected" : "") + (data.preview ? " is-preview" : "")}>
      <NodeResizer minWidth={200} minHeight={130} isVisible={selected} />
      <div className="card-surface">
        <Handle type="target" position={Position.Left} className="node-handle" />
        <header className="card-head">
          <span className="card-kind">{labels[data.kind]}</span>
          <button className="node-menu nodrag" aria-label="卡片操作" onClick={(event) => { event.stopPropagation(); action("menu", event); }}>•••</button>
        </header>
        {data.imageUrl && (
          <div className="card-image">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={data.imageUrl} alt={data.title} draggable={false} />
            <span className="source-chip">{data.kind === "web" ? "网页截图" : "原始素材"}</span>
          </div>
        )}
        {data.kind === "web" && !data.imageUrl && (
          <div className="web-placeholder">
            <span>网页预览</span>
            <small>使用浏览器插件采集可保存完整截图</small>
          </div>
        )}
        <div className="card-content">
          <InlineTitle id={id} value={data.title} />
          {data.sourceUrl && <a href={data.sourceUrl} target="_blank" rel="noreferrer" className="nodrag">{safeHost(data.sourceUrl)} ↗</a>}
          {data.body && <p>{data.body}</p>}
          {!!data.colors?.length && <div className="color-row">{data.colors.slice(0, 7).map((color) => <span key={color} title={color} style={{ background: color }} />)}</div>}
          {!!data.tags?.length && <div className="tag-row">{data.tags.slice(0, 8).map((tag) => <span key={tag}>{tag}</span>)}</div>}
        </div>
        {isSource && (
          <button
            className={"analysis-toggle nodrag " + (data.status === "processing" ? "is-busy" : "")}
            onClick={(event) => { event.stopPropagation(); action(hasAnalysis ? "toggle-analysis" : "analyze"); }}
          >
            <span>{data.status === "processing" ? "◌" : "✦"}</span>
            <b>{analysisStatusText(data.status, hasAnalysis)}</b>
            <small>{data.analysisExpanded ? "收起" : hasAnalysis ? "展开" : "开始"}</small>
          </button>
        )}
        <Handle type="source" position={Position.Right} className="node-handle" />
      </div>

      {isSource && data.analysisExpanded && (
        <section className="analysis-drawer nodrag nowheel" onClick={(event) => event.stopPropagation()}>
          <header>
            <div><small>AI 拆解 · 来自</small><strong>{data.title}</strong></div>
            <button onClick={() => action("toggle-analysis")} aria-label="收起分析">×</button>
          </header>
          {data.status === "processing" ? (
            <div className="analysis-loading"><i /><span>正在拆解视觉风格、版式和组件…</span></div>
          ) : data.analysisError && !data.analysisSummary ? (
            <div className="analysis-failed"><p>{displayAnalysisError(data.analysisError)}</p><button onClick={() => action("analyze")}>重试</button></div>
          ) : (
            <>
              <div className="analysis-section">
                <h4>参考摘要</h4>
                <p>{data.analysisSummary || "还没有分析结果。"}</p>
              </div>
              {!!data.principles?.length && (
                <div className="analysis-section">
                  <h4>可复用的设计要点</h4>
                  <ol>{data.principles.slice(0, 6).map((item) => <li key={item}>{item}</li>)}</ol>
                </div>
              )}
              {!!data.colors?.length && (
                <div className="analysis-section">
                  <h4>颜色</h4>
                  <div className="drawer-colors">{data.colors.map((color) => <span key={color}><i style={{ background: color }} />{color}</span>)}</div>
                </div>
              )}
              {!!data.regions?.length && (
                <div className="analysis-section analysis-elements">
                  <div><h4>检测到的元素</h4><small>{data.regions.length} 个候选，确认后才能导出</small></div>
                  <button onClick={() => action("show-details")}>在右侧查看</button>
                </div>
              )}
              {data.analysisError && <p className="analysis-warning">上次更新失败，当前展示的是此前保存的结果。</p>}
              <button className="analysis-refresh" onClick={() => action("analyze")}>重新拆解这个参考</button>
            </>
          )}
        </section>
      )}
    </article>
  );
}

function InlineTitle({ id, value, className = "" }: { id: string; value: string; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { if (!editing) setDraft(value); }, [editing, value]);
  useEffect(() => {
    const startEditing = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string }>).detail;
      if (detail.id === id) setEditing(true);
    };
    window.addEventListener("inspo:rename-node", startEditing);
    return () => window.removeEventListener("inspo:rename-node", startEditing);
  }, [id]);

  const commit = () => {
    const title = draft.trim();
    setEditing(false);
    if (title && title !== value) {
      window.dispatchEvent(new CustomEvent("inspo:node-action", { detail: { id, action: "rename", title } }));
    } else {
      setDraft(value);
    }
  };

  if (editing) {
    return (
      <input
        className={"inline-title-input nodrag " + className}
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") commit();
          if (event.key === "Escape") { setDraft(value); setEditing(false); }
        }}
      />
    );
  }

  const Tag = className ? "strong" : "h3";
  return <Tag className={className} onDoubleClick={(event) => { event.stopPropagation(); setEditing(true); }}>{value}</Tag>;
}

function displayAnalysisError(value: string | undefined) {
  if (!value) return "拆解失败，请重试。";
  if (/invalid_(?:type|value)|expected|zod|too_(?:big|small)|\[\s*\{/i.test(value) || value.length > 260) {
    return "模型返回的分析格式不完整。请重试；若持续失败，请在 AI 设置中更换支持结构化输出的模型。";
  }
  return value;
}

function analysisStatusText(status: string | undefined, hasAnalysis: boolean) {
  if (status === "processing") return "正在拆解";
  if (status === "failed" && !hasAnalysis) return "拆解失败";
  if (hasAnalysis) return "AI 拆解";
  return "拆解这个参考";
}

function safeHost(value: string) {
  try { return new URL(value).hostname; } catch { return value; }
}
