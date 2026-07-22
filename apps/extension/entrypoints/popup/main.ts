const button = document.querySelector<HTMLButtonElement>("#capture")!;
const status = document.querySelector<HTMLOutputElement>("#status")!;

button.addEventListener("click", async () => {
  status.value = "正在读取当前页面…";
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.id || !tab.url?.startsWith("http")) { status.value = "当前页面不支持采集"; return; }

  const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: collectPage });
  if (!result) { status.value = "页面读取失败"; return; }
  const screenshotParts: Array<{ index: number; width: number; height: number; dataUrl: string }> = [];
  const step = Math.max(320, result.viewport.height - 40);
  const pageHeight = Math.min(result.document.height, 40_000);
  const originalY = result.document.scrollY;

  for (let y = 0, index = 0; y < pageHeight && index < 30; y += step, index += 1) {
    status.value = `正在采集第 ${index + 1} 段…`;
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: (scrollY: number) => window.scrollTo({ top: scrollY, behavior: "instant" }), args: [y] });
    await new Promise((resolve) => setTimeout(resolve, 140));
    const dataUrl = await chrome.tabs.captureVisibleTab({ format: "jpeg", quality: 84 });
    screenshotParts.push({ index, width: result.viewport.width, height: Math.min(result.viewport.height, pageHeight - y), dataUrl });
  }
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: (scrollY: number) => window.scrollTo({ top: scrollY, behavior: "instant" }), args: [originalY] });

  const baseUrl = (await chrome.storage.sync.get("appUrl")).appUrl ?? "http://localhost:3000";
  const response = await fetch(`${baseUrl}/api/clips`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: result.url, title: result.title, readableText: result.readableText, styles: result.styles, screenshotParts }),
  });
  status.value = response.ok ? `已保存完整网页（${screenshotParts.length} 段）` : "保存失败，请先登录 Web 端";
});

function collectPage() {
  const candidates = [...document.querySelectorAll("button,a,input,nav,header,[role=button],[class*=card]")].slice(0, 250);
  return {
    url: location.href, title: document.title || location.hostname,
    readableText: (document.body.innerText || "").slice(0, 50_000),
    viewport: { width: innerWidth, height: innerHeight },
    document: { height: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight), scrollY: window.scrollY },
    styles: candidates.map((element, index) => {
      const node = element as HTMLElement; const style = getComputedStyle(node); const rect = node.getBoundingClientRect();
      return { selectorHint: `${node.tagName.toLowerCase()}:${index}`, role: node.getAttribute("role") || node.tagName.toLowerCase(), rect: { x: rect.x, y: rect.y + window.scrollY, width: rect.width, height: rect.height }, style: { color: style.color, backgroundColor: style.backgroundColor, fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, borderRadius: style.borderRadius, boxShadow: style.boxShadow, padding: style.padding, gap: style.gap } };
    }),
  };
}

