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
          <InlineBody id={id} value={String(data.body ?? "单击添加分组说明")} className="group-description" placeholder="添加分组说明" />
        </div>
        <button className="node-menu nodrag" aria-label="分组操作" onClick={(event) => { event.stopPropagation(); action("menu", event); }}>•••</button>
      </section>
    );
  }

  if (data.workflowStage === "analysis") {
    const busy = data.status === "processing";
    return (
      <article className={"canvas-card workflow-card analysis-workflow-card" + (selected ? " is-selected" : "") + (busy ? " is-processing" : "")}>
        <NodeResizer minWidth={260} minHeight={170} isVisible={selected} />
        <Handle id="input" type="target" position={Position.Left} className="node-handle node-port-input nodrag" title="连接来源" />
        <Handle id="output" type="source" position={Position.Right} className="node-handle node-port-output nodrag" title="拖出并整合为方案" />
        <div className="card-surface">
          <header className="card-head"><span className="card-kind">拆解</span><button className="node-menu nodrag" aria-label="拆解卡操作" onClick={(event) => { event.stopPropagation(); action("menu", event); }}>•••</button></header>
          <div className="workflow-card-content">
            <small>来自 {String(data.sourceTitle || "参考卡片")}</small>
            <InlineTitle id={id} value={data.title} />
            {busy ? <div className="workflow-processing"><i /><span>正在读取版式、视觉和组件</span></div> : <p>{data.analysisSummary || data.analysisError || "等待拆解结果"}</p>}
            {!busy && <div className="workflow-card-details">
              {!!data.principles?.length && <><b>可复用要点</b><ul>{data.principles.slice(0, 4).map((item) => <li key={item}>{item}</li>)}</ul></>}
              {!!data.colors?.length && <div className="workflow-colors">{data.colors.slice(0, 7).map((color) => <i key={color} style={{ background: color }} title={color} />)}</div>}
            </div>}
          </div>
          <footer className="workflow-card-footer"><span>{busy ? "拆解中" : "可多选后整合"}</span><small>拖动右侧 ＋ 继续</small></footer>
        </div>
      </article>
    );
  }

  if (data.workflowStage === "contract") {
    const contract = data.contract;
    const reviewCount = (contract?.conflicts.length || 0) + (contract?.unresolved.length || 0);
    return (
      <article className={"canvas-card workflow-card contract-workflow-card" + (selected ? " is-selected" : "")}>
        <NodeResizer minWidth={280} minHeight={190} isVisible={selected} />
        <Handle id="input" type="target" position={Position.Left} className="node-handle node-port-input nodrag" title="连接拆解结果" />
        <Handle id="output" type="source" position={Position.Right} className="node-handle node-port-output nodrag" title="拖出并选择输出" />
        <button className="contract-card-button nodrag" onClick={(event) => { event.stopPropagation(); action("open-export"); }}>
          <span className="card-kind">方案</span>
          <InlineTitle id={id} value={data.title} />
          <small>{contract?.sourceAssetIds.length || 0} 张参考 · {contract?.components.length || 0} 个组件{reviewCount ? ` · ${reviewCount} 项待核对` : " · 证据已汇总"}</small>
          <p>{contract?.principles.slice(0, 2).join("；") || "打开后检查方案并选择输出方式"}</p>
          <b>打开输出选项 <span>→</span></b>
        </button>
      </article>
    );
  }

  const isSource = sourceKinds.has(data.kind) && !data.note && Boolean(data.assetId);
  const hasAnalysis = Boolean(data.analysisSummary || data.analysisId || data.status === "processing" || data.analysisError);

  return (
    <article className={"canvas-card card-" + (data.note ? "note" : data.kind) + (selected ? " is-selected" : "") + (data.preview ? " is-preview" : "")}>
      <NodeResizer minWidth={200} minHeight={130} isVisible={selected} />
      <Handle id="input" type="target" position={Position.Left} className="node-handle node-port-input nodrag" title="连接到这张卡片" aria-label="连接到这张卡片" />
      <Handle id="output" type="source" position={Position.Right} className="node-handle node-port-output nodrag" title="从这里拖到另一张卡片" aria-label="从这里拖到另一张卡片" />
      <div className="card-surface">
        <header className="card-head">
          <span className="card-kind">{data.note ? "备注" : labels[data.kind]}</span>
          <button className="node-menu nodrag" aria-label="卡片操作" onClick={(event) => { event.stopPropagation(); action("menu", event); }}>•••</button>
        </header>
        {data.imageUrl && (
          <div className={"card-image" + (data.kind === "web" ? " web-shot nodrag nowheel" : "")}>
            {data.kind === "web"
              ? Array.from({ length: Math.max(1, Number(data.screenshotPartCount) || 1) }, (_, index) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={index} src={withScreenshotPart(data.imageUrl!, index)} alt={index ? "" : data.title} draggable={false} loading={index ? "lazy" : "eager"} />
                ))
              : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.imageUrl} alt={data.title} draggable={false} />
              )}
            <span className="source-chip">{data.kind === "web" ? "网页截图" : "原始素材"}</span>
            {data.kind === "web" && Number(data.screenshotPartCount) > 1 && <span className="web-shot-count">{data.screenshotPartCount} 段 · 滚动查看</span>}
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
          {data.note ? <InlineBody id={id} value={data.body ?? ""} className="note-body" placeholder="写下备注…" multiline /> : data.body && (data.kind === "web" ? <div className="card-body-scroll nodrag nowheel"><p>{data.body}</p></div> : <p>{data.body}</p>)}
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
                  <div><h4>识别到的组件</h4><small>{data.regions.length} 项，会自动进入设计方案</small></div>
                  <button onClick={() => action("show-details")}>在右侧查看</button>
                </div>
              )}
              {data.analysisError && <p className="analysis-warning">上次更新失败，当前展示的是此前保存的结果。</p>}
              <div className="analysis-feedback">
                {data.analysisFeedback ? <small>{data.analysisFeedback === "helpful" ? "✓ 已标记有帮助" : "✓ 已标记需改进"}</small> : <><small>这次拆解有帮助吗？</small><button onClick={() => action("feedback-analysis-helpful")}>有用</button><button onClick={() => action("feedback-analysis-needs-work")}>不准确</button></>}
              </div>
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
  useEffect(() => {
    const startEditing = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string }>).detail;
      if (detail.id === id) { setDraft(value); setEditing(true); }
    };
    window.addEventListener("inspo:rename-node", startEditing);
    return () => window.removeEventListener("inspo:rename-node", startEditing);
  }, [id, value]);

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
  return <Tag className={className} onDoubleClick={(event) => { event.stopPropagation(); setDraft(value); setEditing(true); }}>{value}</Tag>;
}

function InlineBody({ id, value, className = "", placeholder, multiline = false }: { id: string; value: string; className?: string; placeholder: string; multiline?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commit = () => {
    const body = draft.trim();
    setEditing(false);
    if (body !== value) {
      window.dispatchEvent(new CustomEvent("inspo:node-action", { detail: { id, action: "update-body", body } }));
    }
  };

  if (editing) {
    const shared = {
      autoFocus: true,
      value: draft,
      placeholder,
      className: `inline-body-input nodrag ${className}`,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(event.target.value),
      onBlur: commit,
      onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        event.stopPropagation();
        if (event.key === "Escape") { setDraft(value); setEditing(false); }
        if (!multiline && event.key === "Enter") commit();
        if (multiline && event.key === "Enter" && (event.metaKey || event.ctrlKey)) commit();
      },
    };
    return multiline ? <textarea {...shared} rows={5} /> : <input {...shared} />;
  }

  const text = value || placeholder;
  return multiline
    ? <p className={`editable-body nodrag ${className}`} onClick={(event) => { event.stopPropagation(); setDraft(value); setEditing(true); }}>{text}</p>
    : <small className={`editable-body nodrag ${className}`} onClick={(event) => { event.stopPropagation(); setDraft(value); setEditing(true); }}>{text}</small>;
}
function displayAnalysisError(value: string | undefined) {
  if (!value) return "拆解失败，请重试。";
  if (/JSON 无法解析|invalid_(?:type|value)|expected|zod|too_(?:big|small)|\[\s*\{/i.test(value) || value.length > 260) {
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

function withScreenshotPart(value: string, index: number) {
  const separator = value.includes("?") ? "&" : "?";
  return value + separator + "part=" + index;
}

function safeHost(value: string) {
  try { return new URL(value).hostname; } catch { return value; }
}
