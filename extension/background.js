// background.js v7.1 — offscreen 启动 + 全量 chrome API 处理
// browser 工具通过 offscreen → runtime.sendMessage → 本文件处理

async function ensureOffscreen() {
  const has = await chrome.offscreen?.hasDocument?.().catch(() => false);
  if (!has) {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["DOM_PARSER"],
      justification: "Hermes Bridge persistent connection"
    });
  }
}
ensureOffscreen();

// ===== chrome API 处理 =====
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const { id, action, params, tabId } = msg;
  const p = params || {};
  let tid = tabId || (sender.tab ? sender.tab.id : null);

  // 内容操作 — 转发到 content script
  const contentOps = ['read_text','read_html','read_element','get_links','get_images',
                      'find_in_page','scroll','click','write_text','double_click',
                      'right_click','hover','drag','key_press','type_text','eval_js',
                      'dismiss_popups'];
  
  if (contentOps.includes(action)) {
    tryExec();
    return true;

    async function tryExec() {
      if (!tid) {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        tid = tabs[0]?.id;
      }
      if (!tid) { sendResponse({ error: "no tab" }); return; }

      chrome.tabs.sendMessage(tid, { action, params }, resp => {
        if (!chrome.runtime.lastError) {
          if (action === 'get_images') resp = filterImages(resp, params);
          sendResponse(resp);
          return;
        }
        chrome.scripting.executeScript({ target: { tabId: tid }, files: ["content.js"] }, () => {
          if (chrome.runtime.lastError) { sendResponse({ error: "inject: " + chrome.runtime.lastError.message }); return; }
          setTimeout(() => {
            chrome.tabs.sendMessage(tid, { action, params }, retry => {
              if (chrome.runtime.lastError) { sendResponse({ error: chrome.runtime.lastError.message }); return; }
              if (action === 'get_images') retry = filterImages(retry, params);
              sendResponse(retry);
            });
          }, 800);
        });
      });
    }
  }

  // chrome API 操作
  (async () => {
    try {
      if (action === 'list_tabs') {
        const tabs = await chrome.tabs.query({});
        sendResponse({ tabs: tabs.map(t => ({ id: t.id, title: t.title||"", url: t.url||"", active: t.active })) }); return;
      }
      if (!tid) {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        tid = tabs[0]?.id;
      }
      if (action === 'close_tab')          { await chrome.tabs.remove(tid); sendResponse({ closed: true }); }
      else if (action === 'activate_tab')   { await chrome.tabs.update(tid, { active: true }); sendResponse({ ok: true }); }
      else if (action === 'reload_tab')     { await chrome.tabs.reload(tid); sendResponse({ ok: true }); }
      else if (action === 'navigate')       { await chrome.tabs.update(tid, { url: p.url }); sendResponse({ ok: true }); }
      else if (action === 'go_back')        { chrome.tabs.goBack(tid); sendResponse({ ok: true }); }
      else if (action === 'go_forward')     { chrome.tabs.goForward(tid); sendResponse({ ok: true }); }
      else if (action === 'set_zoom')       { await chrome.tabs.setZoom(tid, p.zoom||1); sendResponse({ ok: true }); }
      else if (action === 'get_zoom')       { const z = await chrome.tabs.getZoom(tid); sendResponse({ zoom: z }); }
      else if (action === 'new_tab')        { const t = await chrome.tabs.create({ url: p.url||"about:blank" }); sendResponse({ tabId: t.id, title: t.title, url: t.url }); }
      else if (action === 'create_window')  { const w = await chrome.windows.create({ url: p.url||"about:blank" }); sendResponse({ windowId: w.id, tabId: w.tabs?.[0]?.id }); }
      else if (action === 'close_window')   {
        if (p.windowId) { await chrome.windows.remove(p.windowId); sendResponse({ closed: true }); }
        else { const t = await chrome.tabs.get(tid); await chrome.windows.remove(t.windowId); sendResponse({ closed: true }); }
      }
      else if (action === 'list_windows')   { const w = await chrome.windows.getAll({ populate: true }); sendResponse({ windows: w.map(x=>({id:x.id, focused:x.focused, tabs:x.tabs?.length})) }); }
      else if (action === 'search_history') { const h = await chrome.history.search({ text: p.query||"", maxResults: p.maxResults||20 }); sendResponse({ results: h.map(x=>({title:x.title,url:x.url})) }); }
      else if (action === 'list_bookmarks') { const t = await chrome.bookmarks.getTree(); sendResponse({ tree: t }); }
      else if (action === 'screenshot')     { chrome.debugger.attach({ tabId: tid }, "1.3", async () => { const r = await chrome.debugger.sendCommand({ tabId: tid }, "Page.captureScreenshot", { format: "png" }); await chrome.debugger.detach({ tabId: tid }); sendResponse({ dataUrl: "data:image/png;base64," + (r?.data||"") }); }); return; }
      else if (action === 'download')       { chrome.downloads.download({ url: p.url, filename: p.filename||"" }, did => sendResponse({ downloadId: did })); return; }
      else if (action === 'list_downloads') { chrome.downloads.search({ limit: p.limit||20 }, r => sendResponse({ downloads: r.map(d=>({id:d.id,filename:d.filename,url:d.url,state:d.state})) })); return; }
      else if (action === 'clear_data')     { let o={since: p.since||0}; if(p.cache)o.cache=true; if(p.cookies)o.cookies=true; await chrome.browsingData.remove(o,{}); sendResponse({ ok: true }); }
      else { sendResponse({ error: "unknown action: " + action }); }
    } catch(e) { sendResponse({ error: e.message }); }
  })();
  return true;  // required for async sendResponse
});
// ===== 智能图片过滤 =====
function filterImages(resp, params) {
  const raw = (resp && resp.images) ? resp.images : (Array.isArray(resp) ? resp : []);
  const blacklist = ['bd_logo','avatar','icon','logo','favicon','qr','result','flexible','baidu/img','share-icon','peak','bcebos.com/avatar'];
  const filtered = raw.filter(img => {
    const src = (img.src || '').toLowerCase();
    const w = img.width || 0;
    const h = img.height || 0;
    if (w < 200 || h < 100) return false;
    if (src.startsWith('data:') && src.length < 2000) return false;
    for (const b of blacklist) { if (src.includes(b)) return false; }
    return true;
  });
  filtered.sort((a, b) => (b.width||0)*(b.height||0) - (a.width||0)*(a.height||0));
  const max = (params && params.maxCount) || 20;
  const images = filtered.slice(0, max).map(i => ({ src: i.src, width: i.width||0, height: i.height||0, alt: (i.alt||'').substring(0, 100) }));
  return { images, count: images.length, total: raw.length, rejected: raw.length - images.length };
}