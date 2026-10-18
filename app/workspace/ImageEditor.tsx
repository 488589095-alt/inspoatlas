"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { uploadPrivateFile } from "./clientUpload";

type Rect = { x: number; y: number; width: number; height: number };
type Proposal = { id: string; label: string; category: string; rect: Rect; confidence: number };
type SavedDerivative = { id: string; title: string; sourceAssetId: string; operation: "crop" | "mask" | "ai-edit"; contentUrl: string; metadata: Record<string, unknown> };

export function ImageEditor({ assetId, sourceUrl, title, onClose, onSaved }: { assetId: string; sourceUrl: string; title: string; onClose(): void; onSaved(derivative: SavedDerivative): void }) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<Rect>({ x: 0, y: 0, width: 1, height: 1 });
  const [rotation, setRotation] = useState(0);
  const [flipX, setFlipX] = useState(false);
  const [flipY, setFlipY] = useState(false);
  const [outputScale, setOutputScale] = useState(1);
  const [maskEnabled, setMaskEnabled] = useState(false);
  const [brushMode, setBrushMode] = useState<"keep" | "erase">("keep");
  const [brushSize, setBrushSize] = useState(32);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [proposalBusy, setProposalBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const displayRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const lastStrokePoint = useRef<{ x: number; y: number } | null>(null);

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
  }, [crop, image, maskEnabled]);

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
    context.strokeStyle = "#fff"; context.beginPath(); context.moveTo(previous.x, previous.y); context.lineTo(x, y); context.stroke(); context.restore();
    lastStrokePoint.current = { x, y };
    setCrop((value) => ({ ...value }));
  };

  const enableMask = (rect = crop) => {
    if (!image || !maskRef.current) return;
    const context = maskRef.current.getContext("2d"); if (!context) return;
    context.clearRect(0, 0, image.naturalWidth, image.naturalHeight);
    context.fillStyle = "#fff";
    context.fillRect(rect.x * image.naturalWidth, rect.y * image.naturalHeight, rect.width * image.naturalWidth, rect.height * image.naturalHeight);
    setMaskEnabled(true); setCrop((value) => ({ ...value }));
  };

  const requestProposals = async () => {
    setProposalBusy(true); setError("");
    try {
      const response = await fetch(`/api/assets/${assetId}/layer-proposals`, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "没有获得图层候选");
      setProposals(Array.isArray(payload.proposals) ? payload.proposals : []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "图层定位失败"); }
    finally { setProposalBusy(false); }
  };

  const renderPng = async () => {
    if (!image || !cropPixels) throw new Error("图片尚未就绪");
    const raw = document.createElement("canvas"); raw.width = cropPixels.width; raw.height = cropPixels.height;
    const rawContext = raw.getContext("2d"); if (!rawContext) throw new Error("无法初始化画布");
    rawContext.drawImage(image, cropPixels.x, cropPixels.y, cropPixels.width, cropPixels.height, 0, 0, raw.width, raw.height);
    if (maskEnabled && maskRef.current) {
      rawContext.globalCompositeOperation = "destination-in";
      rawContext.drawImage(maskRef.current, cropPixels.x, cropPixels.y, cropPixels.width, cropPixels.height, 0, 0, raw.width, raw.height);
    }
    const quarter = ((rotation % 360) + 360) % 360;
    const turns = quarter === 90 || quarter === 270;
    const output = document.createElement("canvas");
    output.width = Math.min(4096, Math.max(1, Math.round((turns ? raw.height : raw.width) * outputScale)));
    output.height = Math.min(4096, Math.max(1, Math.round((turns ? raw.width : raw.height) * outputScale)));
    const context = output.getContext("2d"); if (!context) throw new Error("无法生成 PNG");
    context.translate(output.width / 2, output.height / 2);
    context.rotate(quarter * Math.PI / 180); context.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    const drawWidth = raw.width * outputScale; const drawHeight = raw.height * outputScale;
    context.drawImage(raw, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    return await new Promise<Blob>((resolve, reject) => output.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG 导出失败")), "image/png"));
  };

  const save = async () => {
    setSaving(true); setError("");
    try {
      const png = await renderPng();
      const nextTitle = maskEnabled ? `${title} · 图层` : `${title} · 编辑副本`;
      const operation = maskEnabled ? "mask" : "crop";
      const metadata = { sourceWidth: image?.naturalWidth, sourceHeight: image?.naturalHeight, crop, rotation, flipX, flipY, outputScale, proposal: proposals.find((item) => item.rect === crop) };
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

  return <section className="image-editor image-editor-inline" aria-label="编辑素材">
      <header><div><small>素材操作</small><h2>编辑素材</h2><p>原图保持不变，保存后生成可追溯副本。</p></div><button onClick={onClose} aria-label="返回素材详情">返回</button></header>
      <div className="image-editor-layout">
        <div className="image-editor-preview">
          <canvas ref={displayRef} onPointerDown={(event) => { if (maskEnabled) { drawing.current = true; lastStrokePoint.current = null; event.currentTarget.setPointerCapture(event.pointerId); paint(event); } }} onPointerMove={paint} onPointerUp={finishStroke} onPointerCancel={finishStroke} onPointerLeave={finishStroke} />
          {maskEnabled && <p>蒙版：{brushMode === "keep" ? "保留" : "擦除"}笔刷</p>}
        </div>
        <aside className="image-editor-controls">
          <section><h3>构图</h3><div className="crop-fields">{(["x", "y", "width", "height"] as const).map((key) => <label key={key}><span>{key === "x" ? "左" : key === "y" ? "上" : key === "width" ? "宽" : "高"}</span><input type="number" min="0" max="1" step=".01" value={crop[key]} onChange={(event) => setCrop((value) => clampRect({ ...value, [key]: Number(event.target.value) }))} /></label>)}</div></section>
          <section><h3>变换</h3><div className="editor-button-row"><button onClick={() => setRotation((value) => (value + 270) % 360)}>向左旋转</button><button onClick={() => setRotation((value) => (value + 90) % 360)}>向右旋转</button></div><div className="editor-button-row"><button className={flipX ? "active" : ""} onClick={() => setFlipX((value) => !value)}>水平翻转</button><button className={flipY ? "active" : ""} onClick={() => setFlipY((value) => !value)}>垂直翻转</button></div><label className="range-control"><span>导出倍率 <b>{outputScale}×</b></span><input type="range" min=".25" max="2" step=".25" value={outputScale} onChange={(event) => setOutputScale(Number(event.target.value))} /></label></section>
          <section><div className="editor-section-title"><h3>图层蒙版</h3><button onClick={() => enableMask()}>{maskEnabled ? "重置蒙版" : "启用蒙版"}</button></div><p>对象定位只作选区起点；用笔刷修正后再保存。</p><div className="editor-button-row"><button className={brushMode === "keep" ? "active" : ""} disabled={!maskEnabled} onClick={() => setBrushMode("keep")}>保留</button><button className={brushMode === "erase" ? "active" : ""} disabled={!maskEnabled} onClick={() => setBrushMode("erase")}>擦除</button></div><label className="range-control"><span>笔刷</span><input disabled={!maskEnabled} type="range" min="8" max="100" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} /></label><button className="layer-proposal-button" disabled={proposalBusy} onClick={() => void requestProposals()}>{proposalBusy ? "正在定位…" : "AI 拆图层"}</button>{proposals.length > 0 && <div className="layer-proposal-list">{proposals.map((item) => <button key={item.id} onClick={() => { setCrop(item.rect); enableMask(item.rect); }}><span>{item.label}</span><small>{item.category} · {Math.round(item.confidence * 100)}%</small></button>)}</div>}</section>
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
