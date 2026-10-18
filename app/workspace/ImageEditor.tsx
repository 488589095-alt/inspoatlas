"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { uploadPrivateFile } from "./clientUpload";

type Rect = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };
type Proposal = { id: string; label: string; category: string; rect: Rect; contours: Point[][]; confidence: number };
type SavedDerivative = { id: string; title: string; sourceAssetId: string; operation: "crop" | "mask" | "ai-edit"; contentUrl: string; metadata: Record<string, unknown> };
type MaskSelection = { operation: "erase" | "isolate" | "background"; proposalIds: string[] };
type EditorSnapshot = { crop: Rect; rotation: number; flipX: boolean; flipY: boolean; outputScale: number; maskEnabled: boolean; maskSelection: MaskSelection | null; maskPng: string | null };

export function ImageEditor({ assetId, sourceUrl, title, onClose, onSaved }: { assetId: string; sourceUrl: string; title: string; onClose(): void; onSaved(derivative: SavedDerivative): void }) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<Rect>({ x: 0, y: 0, width: 1, height: 1 });
  const [rotation, setRotation] = useState(0);
  const [flipX, setFlipX] = useState(false);
  const [flipY, setFlipY] = useState(false);
  const [outputScale, setOutputScale] = useState(1);
  const [maskEnabled, setMaskEnabled] = useState(false);
  const [maskSelection, setMaskSelection] = useState<MaskSelection | null>(null);
  const [maskRevision, setMaskRevision] = useState(0);
  const [brushMode, setBrushMode] = useState<"keep" | "erase">("keep");
  const [brushSize, setBrushSize] = useState(32);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [proposalBusy, setProposalBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [, setHistoryRevision] = useState(0);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [error, setError] = useState("");
  const displayRef = useRef<HTMLCanvasElement>(null);
  const resultRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const lastStrokePoint = useRef<{ x: number; y: number } | null>(null);
  const undoStack = useRef<EditorSnapshot[]>([]);
  const redoStack = useRef<EditorSnapshot[]>([]);
  const restoringHistory = useRef(false);

  const snapshot = (): EditorSnapshot => ({ crop: { ...crop }, rotation, flipX, flipY, outputScale, maskEnabled, maskSelection, maskPng: maskRef.current?.toDataURL("image/png") ?? null });
  const recordEdit = () => {
    if (restoringHistory.current || !image) return;
    undoStack.current.push(snapshot());
    if (undoStack.current.length > 20) undoStack.current.shift();
    redoStack.current = [];
    setHistoryRevision((value) => value + 1);
  };
  const restore = async (state: EditorSnapshot) => {
    if (maskRef.current && state.maskPng) {
      const loaded = new Image();
      loaded.src = state.maskPng;
      await loaded.decode();
      const context = maskRef.current.getContext("2d");
      context?.clearRect(0, 0, maskRef.current.width, maskRef.current.height);
      context?.drawImage(loaded, 0, 0);
    }
    setCrop(state.crop); setRotation(state.rotation); setFlipX(state.flipX); setFlipY(state.flipY);
    setOutputScale(state.outputScale); setMaskEnabled(state.maskEnabled); setMaskSelection(state.maskSelection);
    setMaskRevision((value) => value + 1);
  };
  const travelHistory = async (direction: "undo" | "redo") => {
    if (restoringHistory.current) return;
    const source = direction === "undo" ? undoStack.current : redoStack.current;
    const destination = direction === "undo" ? redoStack.current : undoStack.current;
    const state = source.pop();
    if (!state) return;
    destination.push(snapshot());
    restoringHistory.current = true; setHistoryBusy(true); setHistoryRevision((value) => value + 1);
    try { await restore(state); setError(""); }
    catch { setError("无法恢复这一步，请重新打开素材。"); }
    finally { restoringHistory.current = false; setHistoryBusy(false); }
  };

  useEffect(() => {
    const onHistoryKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const key = event.key.toLowerCase();
      if (key === "z" || key === "y") {
        event.preventDefault();
        void travelHistory(key === "y" || event.shiftKey ? "redo" : "undo");
      }
    };
    window.addEventListener("keydown", onHistoryKey);
    return () => window.removeEventListener("keydown", onHistoryKey);
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const next = new Image();
    next.crossOrigin = "anonymous";
    next.onload = () => {
      setImage(next);
      const mask = document.createElement("canvas");
      mask.width = next.naturalWidth; mask.height = next.naturalHeight;
      const context = mask.getContext("2d"); context?.fillRect(0, 0, mask.width, mask.height);
      maskRef.current = mask;
    };
    next.onerror = () => setError("图片无法读取，请重新打开素材。");
    next.src = sourceUrl;
  }, [sourceUrl]);

  const cropPixels = useMemo(() => image ? { x: Math.round(crop.x * image.naturalWidth), y: Math.round(crop.y * image.naturalHeight), width: Math.max(1, Math.round(crop.width * image.naturalWidth)), height: Math.max(1, Math.round(crop.height * image.naturalHeight)) } : null, [crop, image]);

  useEffect(() => {
    const canvas = displayRef.current;
    if (!canvas || !image) return;
    const width = 540; const height = Math.max(220, Math.round(width * image.naturalHeight / image.naturalWidth));
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d"); if (!context) return;
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    context.save();
    context.fillStyle = "rgba(3, 7, 6, .58)";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, crop.x * image.naturalWidth, crop.y * image.naturalHeight, crop.width * image.naturalWidth, crop.height * image.naturalHeight, crop.x * width, crop.y * height, crop.width * width, crop.height * height);
    context.strokeStyle = "#b5ce84"; context.lineWidth = 2;
    context.strokeRect(crop.x * width + 1, crop.y * height + 1, crop.width * width - 2, crop.height * height - 2);
    if (maskEnabled && maskRef.current) {
      context.globalAlpha = .22;
      context.drawImage(maskRef.current, 0, 0, width, height);
    }
    context.restore();
  }, [crop, image, maskEnabled, maskRevision]);

  useEffect(() => {
    const preview = resultRef.current;
    if (!preview || !image) return;
    const width = Math.max(1, Math.round(crop.width * image.naturalWidth));
    const height = Math.max(1, Math.round(crop.height * image.naturalHeight));
    const previewScale = Math.min(1, 540 / Math.max(width, height));
    const rendered = renderEditedCanvas(image, crop, maskEnabled ? maskRef.current : null, rotation, flipX, flipY, previewScale);
    preview.width = rendered.width;
    preview.height = rendered.height;
    preview.getContext("2d")?.drawImage(rendered, 0, 0);
  }, [image, crop, maskEnabled, maskRevision, rotation, flipX, flipY]);

  const paint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !image || !maskRef.current) return;
    const canvas = displayRef.current; if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width * image.naturalWidth;
    const y = (event.clientY - bounds.top) / bounds.height * image.naturalHeight;
    const context = maskRef.current.getContext("2d"); if (!context) return;
    context.save(); context.lineCap = "round"; context.lineJoin = "round"; context.lineWidth = brushSize * image.naturalWidth / bounds.width;
    context.globalCompositeOperation = brushMode === "erase" ? "destination-out" : "source-over";
    const previous = lastStrokePoint.current ?? { x, y };
    context.strokeStyle = "#fff"; context.beginPath(); context.moveTo(previous.x, previous.y); context.lineTo(x, y); context.stroke();
    if (!lastStrokePoint.current) { context.beginPath(); context.arc(x, y, context.lineWidth / 2, 0, Math.PI * 2); context.fillStyle = brushMode === "erase" ? "rgba(0,0,0,1)" : "#fff"; if (brushMode === "erase") context.globalCompositeOperation = "destination-out"; context.fill(); }
    context.restore();
    lastStrokePoint.current = { x, y };
    setMaskRevision((value) => value + 1);
  };

  const enableMask = () => {
    if (!image || !maskRef.current) return;
    recordEdit();
    const context = maskRef.current.getContext("2d"); if (!context) return;
    context.clearRect(0, 0, image.naturalWidth, image.naturalHeight);
    context.fillStyle = "#fff";
    context.fillRect(0, 0, image.naturalWidth, image.naturalHeight);
    setMaskEnabled(true); setMaskSelection(null); setBrushMode("erase"); setMaskRevision((value) => value + 1);
  };

  const applyAutoMask = (operation: "erase" | "isolate" | "background", proposal?: Proposal) => {
    const selected = operation === "background" ? proposals.filter((item) => item.contours?.length) : proposal ? [proposal] : [];
    if (!image || !maskRef.current || !selected.length || selected.some((item) => !item.contours?.length)) {
      setError("AI 没有识别出可用轮廓，请重试或使用笔刷修饰。"); return;
    }
    const context = maskRef.current.getContext("2d"); if (!context) return;
    recordEdit(); setError("");
    if (operation !== "erase" || !maskEnabled) {
      context.clearRect(0, 0, maskRef.current.width, maskRef.current.height);
      if (operation === "erase") { context.fillStyle = "#fff"; context.fillRect(0, 0, maskRef.current.width, maskRef.current.height); }
    }
    context.save();
    context.globalCompositeOperation = operation === "erase" ? "destination-out" : "source-over";
    context.fillStyle = "#fff";
    for (const item of selected) for (const contour of item.contours) {
      context.beginPath();
      contour.forEach((point, index) => {
        const x = point.x * maskRef.current!.width; const y = point.y * maskRef.current!.height;
        if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
      });
      context.closePath(); context.fill();
    }
    context.restore();
    setMaskEnabled(true); setMaskSelection({ operation, proposalIds: selected.map((item) => item.id) }); setBrushMode("erase"); setMaskRevision((value) => value + 1);
  };

  const requestProposals = async () => {
    setProposalBusy(true); setError("");
    try {
      const response = await fetch(`/api/assets/${assetId}/layer-proposals`, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "没有获得图层候选");
      const next = Array.isArray(payload.proposals) ? payload.proposals as Proposal[] : [];
      setProposals(next);
      if (!next.length) setError("AI 没有识别到可选择的主体，请换一张图片或使用笔刷。");
      else if (!next.some((item) => item.contours?.length)) setError("AI 只找到了大致位置，未给出可擦除轮廓。可重试或使用笔刷。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "图层定位失败"); }
    finally { setProposalBusy(false); }
  };

  const renderPng = async () => {
    if (!image || !cropPixels) throw new Error("图片尚未就绪");
    const output = renderEditedCanvas(image, crop, maskEnabled ? maskRef.current : null, rotation, flipX, flipY, outputScale);
    return await new Promise<Blob>((resolve, reject) => output.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG 导出失败")), "image/png"));
  };

  const save = async () => {
    setSaving(true); setError("");
    try {
      const png = await renderPng();
      const nextTitle = maskEnabled ? `${title} · 图层` : `${title} · 编辑副本`;
      const operation = maskEnabled ? "mask" : "crop";
      const metadata = { sourceWidth: image?.naturalWidth, sourceHeight: image?.naturalHeight, crop, rotation, flipX, flipY, outputScale, maskSelection };
      const staged = await uploadPrivateFile(png, { scope: "derivative", sourceAssetId: assetId, contentType: "image/png", size: png.size });
      let response: Response;
      if (staged) {
        response = await fetch(`/api/assets/${assetId}/derivatives`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ uploadedDerivative: true, ...staged, title: nextTitle, operation, metadata, size: png.size }),
        });
      } else {
        const form = new FormData(); form.set("file", png, "layer.png"); form.set("title", nextTitle); form.set("operation", operation);
        form.set("metadata", JSON.stringify(metadata));
        response = await fetch(`/api/assets/${assetId}/derivatives`, { method: "POST", body: form });
      }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "保存副本失败");
      onSaved(payload.derivative);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "保存副本失败"); }
    finally { setSaving(false); }
  };

  const downloadPng = async () => {
    setError("");
    try {
      const png = await renderPng();
      const url = URL.createObjectURL(png);
      const link = document.createElement("a");
      link.href = url; link.download = `${title}-${maskEnabled ? "图层" : "编辑副本"}.png`;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "PNG 导出失败"); }
  };

  const finishStroke = () => { drawing.current = false; lastStrokePoint.current = null; };

  return <section className={"image-editor image-editor-inline" + (historyBusy ? " is-restoring" : "")} aria-label="编辑素材">
      <header><div><small>素材操作</small><h2>编辑素材</h2><p>原图保持不变，保存后生成可追溯副本。</p></div><button onClick={onClose} aria-label="返回素材详情">返回</button></header>
      <div className="image-editor-layout">
        <div className="image-editor-preview">
          <div className="editor-source"><span>原图与选区{maskEnabled ? " · 在这里涂抹蒙版" : ""}</span><canvas ref={displayRef} onPointerDown={(event) => { if (maskEnabled) { recordEdit(); drawing.current = true; lastStrokePoint.current = null; event.currentTarget.setPointerCapture(event.pointerId); paint(event); } }} onPointerMove={paint} onPointerUp={finishStroke} onPointerCancel={finishStroke} onPointerLeave={finishStroke} /></div>
          <div className="editor-result"><span>实时效果 · 保存后作为新卡片加入画布</span><div className="editor-result-checker"><canvas ref={resultRef} aria-label="当前裁剪、旋转和蒙版效果预览" /></div></div>
        </div>
        <aside className="image-editor-controls">
          <div className="editor-history"><button type="button" disabled={historyBusy || undoStack.current.length === 0} onClick={() => void travelHistory("undo")} aria-label="撤销上一步编辑">撤销</button><button type="button" disabled={historyBusy || redoStack.current.length === 0} onClick={() => void travelHistory("redo")} aria-label="重做上一步编辑">重做</button></div>
          <section><h3>构图</h3><div className="editor-crop-presets"><button onClick={() => { recordEdit(); setCrop({ x: 0, y: 0, width: 1, height: 1 }); }}>原图</button><button onClick={() => { if (image) { recordEdit(); setCrop(centerCrop(image, 1)); } }}>正方形</button><button onClick={() => { if (image) { recordEdit(); setCrop(centerCrop(image, 16 / 9)); } }}>横幅</button><button onClick={() => { if (image) { recordEdit(); setCrop(centerCrop(image, 4 / 5)); } }}>竖幅</button></div><div className="crop-fields">{(["x", "y", "width", "height"] as const).map((key) => <label key={key}><span>{key === "x" ? "左" : key === "y" ? "上" : key === "width" ? "宽" : "高"}</span><input type="number" min="0" max="1" step=".01" value={crop[key]} onChange={(event) => { recordEdit(); setCrop((value) => clampRect({ ...value, [key]: Number(event.target.value) })); }} /></label>)}</div></section>
          <section><h3>变换</h3><div className="editor-button-row"><button onClick={() => { recordEdit(); setRotation((value) => (value + 270) % 360); }}>向左旋转</button><button onClick={() => { recordEdit(); setRotation((value) => (value + 90) % 360); }}>向右旋转</button></div><div className="editor-button-row"><button className={flipX ? "active" : ""} onClick={() => { recordEdit(); setFlipX((value) => !value); }}>水平翻转</button><button className={flipY ? "active" : ""} onClick={() => { recordEdit(); setFlipY((value) => !value); }}>垂直翻转</button></div><label className="range-control"><span>导出倍率 <b>{outputScale}×</b></span><input type="range" min=".25" max="2" step=".25" value={outputScale} onChange={(event) => { recordEdit(); setOutputScale(Number(event.target.value)); }} /></label></section>
          <section>
            <div className="editor-section-title"><h3>图层蒙版</h3><button onClick={enableMask}>{maskEnabled ? "重置蒙版" : "启用蒙版"}</button></div>
            <p>AI 识别人物和物体轮廓，点选后可整块擦除或只保留该层；边缘可用笔刷修饰。</p>
            <button className="layer-proposal-button" disabled={proposalBusy || !image} onClick={() => void requestProposals()}>{proposalBusy ? "正在识别…" : "AI 识别可擦除区域"}</button>
            {proposals.length > 0 && <div className="layer-proposal-list" aria-label="AI 识别区域">
              {proposals.some((item) => item.contours?.length) && <div className="layer-proposal-item"><span>背景<small>保留所有识别出的主体</small></span><button onClick={() => applyAutoMask("background")}>擦除背景</button></div>}
              {proposals.map((item) => <div className="layer-proposal-item" key={item.id}><span>{item.label}<small>{item.contours?.length ? `AI 轮廓 · ${Math.round(item.confidence * 100)}%` : "仅定位，暂无轮廓"}</small></span><div><button disabled={!item.contours?.length} onClick={() => applyAutoMask("erase", item)}>擦除</button><button disabled={!item.contours?.length} onClick={() => applyAutoMask("isolate", item)}>只保留</button></div></div>)}
            </div>}
            <div className="editor-button-row"><button className={brushMode === "keep" ? "active" : ""} disabled={!maskEnabled} onClick={() => setBrushMode("keep")}>保留笔刷</button><button className={brushMode === "erase" ? "active" : ""} disabled={!maskEnabled} onClick={() => setBrushMode("erase")}>擦除笔刷</button></div>
            <label className="range-control"><span>笔刷大小</span><input disabled={!maskEnabled} type="range" min="8" max="100" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} /></label>
            {proposals.some((item) => item.contours?.length) && <small className="editor-ai-note">AI 轮廓可能有偏差，请在实时效果中确认后保存。</small>}
          </section>
          {error && <p className="image-editor-error" role="alert">{error}</p>}
        </aside>
      </div>
      <footer><button onClick={onClose}>取消</button><div><button disabled={!image || saving} onClick={() => void downloadPng()}>导出 PNG</button><button className="primary" disabled={!image || saving} onClick={() => void save()}>{saving ? "正在保存…" : "保存为副本"}</button></div></footer>
    </section>;
}

function clampRect(value: Rect): Rect {
  const x = Math.min(.99, Math.max(0, value.x)); const y = Math.min(.99, Math.max(0, value.y));
  return { x, y, width: Math.min(1 - x, Math.max(.01, value.width)), height: Math.min(1 - y, Math.max(.01, value.height)) };
}

function centerCrop(image: HTMLImageElement, ratio: number): Rect {
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const width = Math.min(1, ratio / imageRatio);
  const height = Math.min(1, imageRatio / ratio);
  return { x: (1 - width) / 2, y: (1 - height) / 2, width, height };
}

function renderEditedCanvas(image: HTMLImageElement, crop: Rect, mask: HTMLCanvasElement | null, rotation: number, flipX: boolean, flipY: boolean, scale: number): HTMLCanvasElement {
  const x = Math.round(crop.x * image.naturalWidth);
  const y = Math.round(crop.y * image.naturalHeight);
  const width = Math.max(1, Math.round(crop.width * image.naturalWidth));
  const height = Math.max(1, Math.round(crop.height * image.naturalHeight));
  const raw = document.createElement("canvas"); raw.width = width; raw.height = height;
  const rawContext = raw.getContext("2d"); if (!rawContext) throw new Error("无法初始化画布");
  rawContext.drawImage(image, x, y, width, height, 0, 0, width, height);
  if (mask) {
    rawContext.globalCompositeOperation = "destination-in";
    rawContext.drawImage(mask, x, y, width, height, 0, 0, width, height);
  }
  const quarter = ((rotation % 360) + 360) % 360;
  const turns = quarter === 90 || quarter === 270;
  const output = document.createElement("canvas");
  output.width = Math.min(4096, Math.max(1, Math.round((turns ? height : width) * scale)));
  output.height = Math.min(4096, Math.max(1, Math.round((turns ? width : height) * scale)));
  const context = output.getContext("2d"); if (!context) throw new Error("无法生成 PNG");
  context.translate(output.width / 2, output.height / 2);
  context.rotate(quarter * Math.PI / 180);
  context.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  context.drawImage(raw, -width * scale / 2, -height * scale / 2, width * scale, height * scale);
  return output;
}
