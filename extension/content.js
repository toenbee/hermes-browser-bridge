// content.js — Hermes Browser Bridge 页面操作脚本
// 注入到每个页面，提供读写能力

// ========== 暴露给 background.js 的执行函数 ==========
window.__hermesBridgeExec = function (action, params) {
  switch (action) {
    case "read_text":
      return readText(params);
    case "read_html":
      return readHTML(params);
    case "read_element":
      return readElement(params);
    case "write_text":
      return writeText(params);
    case "click":
      return clickElement(params);
    case "scroll":
      return scrollPage(params);
    case "fill_form":
      return fillForm(params);
    case "get_links":
      return getLinks(params);
    case "get_images":
      return getImages(params);
    case "screenshot_info":
      return screenshotInfo();
    case "wait_element":
      return waitElement(params);
    case "eval_js":
      return evalJS(params);
    case "dismiss_popups":
      return dismissPopups(params);
    // ── 鼠标操作 ──
    case "double_click":
      return doubleClick(params);
    case "right_click":
      return rightClick(params);
    case "hover":
      return hoverElement(params);
    case "mouse_down":
      return mouseEvent(params, 'mousedown');
    case "mouse_up":
      return mouseEvent(params, 'mouseup');
    case "drag":
      return dragElement(params);
    // ── 键盘 ──
    case "key_press":
      return keyPress(params);
    case "type_text":
      return typeText(params);
    // ── 搜索 ──
    case "find_in_page":
      return findInPage(params);
    default:
      return { error: `unknown action: ${action}` };
  }
};

// ========== 读操作 ==========

function readText(params) {
  const { selector, maxLength } = params || {};
  maxLength || (maxLength = 10000);
  
  let text;
  if (selector) {
    const el = document.querySelector(selector);
    text = el ? el.innerText : "";
  } else {
    text = document.body.innerText;
  }
  
  return {
    text: text.substring(0, maxLength),
    length: text.length,
    truncated: text.length > maxLength,
    title: document.title,
    url: window.location.href
  };
}

function readHTML(params) {
  const { selector, maxLength } = params || {};
  maxLength || (maxLength = 50000);
  
  let html;
  if (selector) {
    const el = document.querySelector(selector);
    html = el ? el.outerHTML : "";
  } else {
    html = document.documentElement.outerHTML;
  }
  
  return {
    html: html.substring(0, maxLength),
    length: html.length,
    truncated: html.length > maxLength,
    title: document.title,
    url: window.location.href
  };
}

function readElement(params) {
  const { selector, attribute } = params || {};
  if (!selector) return { error: "selector required" };
  
  const el = document.querySelector(selector);
  if (!el) return { error: `element not found: ${selector}` };
  
  return {
    tag: el.tagName.toLowerCase(),
    text: el.innerText?.substring(0, 2000) || "",
    html: el.outerHTML?.substring(0, 5000) || "",
    attributes: attribute 
      ? { [attribute]: el.getAttribute(attribute) }
      : Object.fromEntries(
          [...el.attributes].map(a => [a.name, a.value])
        ),
    rect: el.getBoundingClientRect().toJSON(),
    visible: el.offsetParent !== null
  };
}

function getLinks(params) {
  const { maxCount, filter } = params || {};
  maxCount || (maxCount = 100);
  
  const links = [...document.querySelectorAll('a[href]')]
    .filter(a => {
      if (!filter) return true;
      return a.href.includes(filter) || a.innerText.includes(filter);
    })
    .slice(0, maxCount)
    .map(a => ({
      text: a.innerText.trim().substring(0, 100),
      href: a.href,
      visible: a.offsetParent !== null
    }));
  
  return { links, count: links.length };
}

function getImages(params) {
  const { maxCount } = params || {};
  maxCount || (maxCount = 50);
  
  const images = [...document.querySelectorAll('img[src]')]
    .slice(0, maxCount)
    .map(img => ({
      src: img.src,
      alt: img.alt?.substring(0, 100) || "",
      width: img.naturalWidth,
      height: img.naturalHeight,
      visible: img.offsetParent !== null
    }));
  
  return { images, count: images.length };
}

// ========== 写操作 ==========

function writeText(params) {
  const { selector, text, mode } = params || {};
  if (!selector) return { error: "selector required" };
  
  const el = document.querySelector(selector);
  if (!el) return { error: `element not found: ${selector}` };
  
  if (el.tagName === 'TEXTAREA' || 
      (el.tagName === 'INPUT' && ['text', 'search', 'email', 'url', 'password', ''].includes(el.type || 'text'))) {
    
    el.focus();
    // 用原生 setter 绕过 Vue/React 的 getter/setter 劫持
    const nativeSetter = Object.getOwnPropertyDescriptor(
      el.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype, 'value'
    ).set;
    const newVal = mode === 'append' ? (el.value || '') + (text || '') : (text || '');
    nativeSetter.call(el, newVal);
    
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (el.isContentEditable) {
    el.focus();
    // 用 execCommand 插入文本（兼容 Jodit 等富文本编辑器）
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    if (mode === 'append') range.collapse(false);
    else range.deleteContents();
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand('insertText', false, text || '');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    if (mode === 'append') {
      el.textContent = (el.textContent || '') + (text || '');
    } else {
      el.textContent = text || '';
    }
  }
  
  return { success: true, selector, mode: mode || 'replace' };
}

function clickElement(params) {
  const { selector, index } = params || {};
  if (!selector) return { error: "selector required" };
  
  const elements = document.querySelectorAll(selector);
  const el = index !== undefined ? elements[index] : elements[0];
  
  if (!el) return { error: `element not found: ${selector}[${index || 0}]` };
  
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.click();
  
  return { 
    success: true, 
    selector, 
    index: index || 0,
    text: el.innerText?.substring(0, 50) || "",
    tag: el.tagName.toLowerCase()
  };
}

function scrollPage(params) {
  const { direction, amount } = params || {};
  const px = amount || window.innerHeight * 0.8;
  
  if (direction === 'up') {
    window.scrollBy(0, -px);
  } else {
    window.scrollBy(0, px);
  }
  
  return { 
    success: true, 
    direction: direction || 'down',
    scrollY: window.scrollY,
    maxScroll: document.documentElement.scrollHeight - window.innerHeight
  };
}

function fillForm(params) {
  const { fields } = params || {};
  if (!fields || !Array.isArray(fields)) return { error: "fields array required" };
  
  const results = [];
  for (const { selector, value } of fields) {
    const r = writeText({ selector, text: value });
    results.push({ selector, ...r });
  }
  
  return { success: true, results };
}

function waitElement(params) {
  const { selector, timeout } = params || {};
  if (!selector) return { error: "selector required" };
  const ms = timeout || 10000;
  
  // 非阻塞检测（同步返回，调用方需轮询）
  const el = document.querySelector(selector);
  if (el) {
    return { found: true, selector };
  }
  return { found: false, selector, waiting: true };
}

function screenshotInfo() {
  return {
    title: document.title,
    url: window.location.href,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight
    },
    scrollY: window.scrollY,
    totalHeight: document.documentElement.scrollHeight
  };
}

// ========== 弹窗处理 ==========

function dismissPopups(params) {
  const dismissed = [];
  
  // 常见关闭按钮文本（中英文）
  const closeTexts = ['×', '✕', '✖', 'close', '关闭', '跳过', '取消', 'dismiss', 'no thanks', 'accept', '同意', '接受', '允许', 'got it', '知道了', 'continue', '继续', 'later', '以后再说', 'not now'];
  const skipTexts = ['skip', '跳过'];
  
  // 策略1：找含关闭文本的按钮/链接
  const allElements = document.querySelectorAll('button, a, [role="button"], span, div');
  for (const el of allElements) {
    const text = (el.innerText || '').trim().toLowerCase();
    for (const ct of closeTexts) {
      if (text === ct.toLowerCase()) {
        try { el.click(); dismissed.push(`clicked:"${el.innerText.trim().substring(0,30)}"`); } catch(e) {}
        break;
      }
    }
  }
  
  // 策略2：找 aria-label 含关闭的元素
  document.querySelectorAll('[aria-label]').forEach(el => {
    const label = (el.getAttribute('aria-label') || '').toLowerCase();
    if (label.includes('close') || label.includes('关闭') || label.includes('dismiss')) {
      try { el.click(); dismissed.push(`aria:"${label.substring(0,30)}"`); } catch(e) {}
    }
  });
  
  // 策略3：移除高 z-index 的全屏遮罩（常见弹窗背景）
  const overlays = document.querySelectorAll('div[style*="z-index"]');
  for (const el of overlays) {
    const style = window.getComputedStyle(el);
    const zIndex = parseInt(style.zIndex);
    if (zIndex > 1000 && (
      style.position === 'fixed' || style.position === 'absolute'
    )) {
      const rect = el.getBoundingClientRect();
      // 覆盖大部分屏幕 = 遮罩
      if (rect.width > window.innerWidth * 0.5 && rect.height > window.innerHeight * 0.3) {
        // 先尝试找里面的关闭按钮
        const closeBtn = el.querySelector('button, [role="button"], .close, .dismiss');
        if (closeBtn) {
          try { closeBtn.click(); dismissed.push(`overlay_btn:z${zIndex}`); } catch(e) {}
        } else {
          el.remove();
          dismissed.push(`removed_overlay:z${zIndex}`);
        }
      }
    }
  }
  
  // 策略4：按 ESC 键关闭（很多弹窗支持）
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
  
  // 策略5：常见 cookie/consent 弹窗的固定类名
  const cookieSelectors = [
    '.cookie-banner', '.cookie-consent', '.consent-banner', '.gdpr',
    '#cookie-banner', '#cookie-consent', '[class*="cookie"]',
    '.notification-banner', '.popup-overlay', '.modal-overlay',
    '[class*="popup"]', '[class*="modal"]'
  ];
  for (const sel of cookieSelectors) {
    try {
      document.querySelectorAll(sel).forEach(el => {
        // 找里面的 accept/同意 按钮
        const btn = el.querySelector('button');
        if (btn) {
          const t = (btn.innerText||'').toLowerCase();
          if (t.includes('accept')||t.includes('同意')||t.includes('allow')||t.includes('允许')||t.includes('ok')) {
            btn.click(); dismissed.push(`cookie:${sel}`);
          }
        } else {
          el.remove(); dismissed.push(`removed:${sel}`);
        }
      });
    } catch(e) {}
  }
  
  return { 
    success: true, 
    dismissed: dismissed.slice(0, 20),
    count: dismissed.length
  };
}

function evalJS(params) {
  const { code } = params || {};
  if (!code) return { error: "code required" };
  try {
    // 用 Function 代替 eval 绕过 CSP
    const fn = new Function('"use strict"; return (' + code + ')');
    const result = fn();
    return { result, type: typeof result };
  } catch (e) {
    return { error: e.message };
  }
}

// ========== 鼠标操作 ==========

function getElement(params) {
  const { selector, x, y } = params || {};
  if (selector) {
    const el = document.querySelector(selector);
    if (!el) return { error: `element not found: ${selector}`, el: null };
    return { el, rect: el.getBoundingClientRect() };
  }
  if (x !== undefined && y !== undefined) {
    const el = document.elementFromPoint(x, y);
    return { el, point: { x, y } };
  }
  return { error: "selector or x,y required", el: null };
}

function dispatchMouse(el, type, params) {
  const rect = el.getBoundingClientRect();
  const cx = params?.x || rect.left + rect.width / 2;
  const cy = params?.y || rect.top + rect.height / 2;
  
  const opts = {
    bubbles: true, cancelable: true, view: window,
    clientX: cx, clientY: cy,
    button: type === 'contextmenu' ? 2 : (params?.button || 0),
    buttons: type === 'contextmenu' ? 2 : 1
  };

  ['mouseover', 'mouseenter', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu'].forEach(evt => {
    if (type === evt || (type === 'click' && evt === 'click')) {
      el.dispatchEvent(new MouseEvent(evt, opts));
    }
  });

  // 完整点击序列
  if (type === 'click') {
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
  }
  if (type === 'dblclick') {
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
    el.dispatchEvent(new MouseEvent('dblclick', opts));
  }
  if (type === 'contextmenu') {
    el.dispatchEvent(new MouseEvent('mousedown', {...opts, button: 2, buttons: 2}));
    el.dispatchEvent(new MouseEvent('mouseup', {...opts, button: 2, buttons: 2}));
    el.dispatchEvent(new MouseEvent('contextmenu', opts));
  }

  return { success: true, element: el.tagName?.toLowerCase(), x: cx, y: cy };
}

function doubleClick(params) {
  const { el, error } = getElement(params);
  if (error) return { error };
  return dispatchMouse(el, 'dblclick', params);
}

function rightClick(params) {
  const { el, error } = getElement(params);
  if (error) return { error };
  return dispatchMouse(el, 'contextmenu', params);
}

function hoverElement(params) {
  const { el, error } = getElement(params);
  if (error) return { error };
  const rect = el.getBoundingClientRect();
  el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: rect.left + rect.width/2, clientY: rect.top + rect.height/2 }));
  el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, clientX: rect.left + rect.width/2, clientY: rect.top + rect.height/2 }));
  return { success: true, element: el.tagName?.toLowerCase() };
}

function mouseEvent(params, type) {
  const { el, error } = getElement(params);
  if (error) return { error };
  const rect = el.getBoundingClientRect();
  el.dispatchEvent(new MouseEvent(type, {
    bubbles: true, cancelable: true,
    clientX: params?.x || rect.left + rect.width/2,
    clientY: params?.y || rect.top + rect.height/2,
    button: params?.button || 0
  }));
  return { success: true, type };
}

function dragElement(params) {
  const { from, to } = params || {};
  if (!from || !to) return { error: "from and to selectors required" };
  
  const el = document.querySelector(from);
  if (!el) return { error: `element not found: ${from}` };
  
  const fromRect = el.getBoundingClientRect();
  const tox = to.x || fromRect.left + (to.dx || 0);
  const toy = to.y || fromRect.top + (to.dy || 0);

  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: fromRect.left, clientY: fromRect.top, button: 0 }));
  
  // 分步移动
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    const mx = fromRect.left + (tox - fromRect.left) * i / steps;
    const my = fromRect.top + (toy - fromRect.top) * i / steps;
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: mx, clientY: my }));
  }
  
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: tox, clientY: toy, button: 0 }));
  
  return { success: true, from: fromRect, to: { x: tox, y: toy } };
}

// ========== 键盘操作 ==========

function keyPress(params) {
  const { key, code, ctrlKey, shiftKey, altKey, metaKey } = params || {};
  if (!key && !code) return { error: "key or code required" };
  
  const k = key || code;
  const opts = {
    bubbles: true, cancelable: true,
    key: k, code: code || k,
    ctrlKey: !!ctrlKey, shiftKey: !!shiftKey,
    altKey: !!altKey, metaKey: !!metaKey
  };
  
  document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', opts));
  document.activeElement?.dispatchEvent(new KeyboardEvent('keypress', opts));
  document.activeElement?.dispatchEvent(new KeyboardEvent('keyup', opts));
  
  return { success: true, key: k, modifiers: { ctrl: !!ctrlKey, shift: !!shiftKey, alt: !!altKey, meta: !!metaKey } };
}

function typeText(params) {
  const { text, selector } = params || {};
  if (!text) return { error: "text required" };
  
  let target = document.activeElement;
  if (selector) {
    target = document.querySelector(selector);
    if (!target) return { error: `element not found: ${selector}` };
    target.focus();
  }
  
  for (const char of text) {
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: char }));
    target.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, key: char }));
    target.dispatchEvent(new InputEvent('input', { bubbles: true, data: char, inputType: 'insertText' }));
    target.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: char }));
  }
  
  return { success: true, length: text.length, target: target.tagName?.toLowerCase() };
}

// ========== 页面搜索 ==========

function findInPage(params) {
  const { query, caseSensitive, forward } = params || {};
  if (!query) return { error: "query required" };
  
  const found = window.find(query, !!caseSensitive, false, true, false, forward !== false, false);
  
  return { 
    found, 
    query,
    selection: found ? window.getSelection()?.toString()?.substring(0, 100) : null
  };
}

console.log("[Hermes Bridge] Content script loaded on:", window.location.href);

// ========== 监听来自 background 的消息 ==========
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action) {
    const result = window.__hermesBridgeExec(msg.action, msg.params);
    sendResponse(result);
  }
  return true; // 保持异步通道
});
