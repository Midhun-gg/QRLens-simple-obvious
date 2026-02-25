/**
 * QRLens – Content Script
 *
 * Injected into the active tab when the user clicks the extension icon.
 * Creates a fullscreen overlay, lets the user draw a selection rectangle,
 * captures the selected region, decodes any QR code with jsQR, and opens
 * the result in a new tab.
 */

(() => {
  "use strict";

  /* ----------------------------------------------------------------
   * Guard: prevent double-injection
   * -------------------------------------------------------------- */
  if (window.__qrlens_active) return;
  window.__qrlens_active = true;

  /* ----------------------------------------------------------------
   * Ensure jsQR is available as a global function.
   * Some pages ship an AMD loader (define()) which causes jsQR's
   * UMD wrapper to register as an AMD module instead of attaching
   * to the global. We check and surface a clear error if missing.
   * -------------------------------------------------------------- */
  if (typeof jsQR !== "function") {
    console.error("QRLens: jsQR library is not available on this page.");
    const t = document.createElement("div");
    t.className = "qrlens-toast qrlens-toast--error";
    t.textContent = "QRLens: Failed to load decoder. Please try again.";
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 4000);
    window.__qrlens_active = false;
    return;
  }

  /* ----------------------------------------------------------------
   * DOM helpers
   * -------------------------------------------------------------- */
  const el = (tag, cls) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    return node;
  };

  /* ----------------------------------------------------------------
   * State
   * -------------------------------------------------------------- */
  let startX, startY, dragging = false;

  /* ----------------------------------------------------------------
   * Build overlay UI
   * -------------------------------------------------------------- */
  const overlay   = el("div", "qrlens-overlay");
  const selection = el("div", "qrlens-selection");
  const banner    = el("div", "qrlens-banner");

  banner.textContent = "Draw a box around the QR code · Press Esc to cancel";

  document.body.appendChild(overlay);
  document.body.appendChild(banner);

  /* ----------------------------------------------------------------
   * Toast helper
   * -------------------------------------------------------------- */
  function showToast(text, type = "error", duration = 3000) {
    const toast = el("div", `qrlens-toast qrlens-toast--${type}`);
    toast.textContent = text;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
  }

  /* ----------------------------------------------------------------
   * Loader helper
   * -------------------------------------------------------------- */
  function showLoader() {
    const wrap = el("div", "qrlens-loader-wrap");
    const spin = el("div", "qrlens-loader");
    wrap.appendChild(spin);
    document.body.appendChild(wrap);
    return wrap;
  }

  /* ----------------------------------------------------------------
   * Cleanup: remove all QRLens elements (toasts self-remove)
   * -------------------------------------------------------------- */
  function cleanup() {
    overlay.remove();
    selection.remove();
    banner.remove();
    document.querySelectorAll(
      ".qrlens-loader-wrap, .qrlens-result-menu, .qrlens-result-backdrop"
    ).forEach((n) => n.remove());
    window.__qrlens_active = false;
  }

  /* ----------------------------------------------------------------
   * Selection rectangle drawing
   * -------------------------------------------------------------- */
  function updateSelectionRect(x1, y1, x2, y2) {
    const left   = Math.min(x1, x2);
    const top    = Math.min(y1, y2);
    const width  = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);
    selection.style.left   = `${left}px`;
    selection.style.top    = `${top}px`;
    selection.style.width  = `${width}px`;
    selection.style.height = `${height}px`;
  }

  overlay.addEventListener("mousedown", (e) => {
    e.preventDefault();
    startX   = e.clientX;
    startY   = e.clientY;
    dragging = true;
    updateSelectionRect(startX, startY, startX, startY);
    document.body.appendChild(selection);
  });

  overlay.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    updateSelectionRect(startX, startY, e.clientX, e.clientY);
  });

  overlay.addEventListener("mouseup", (e) => {
    if (!dragging) return;
    dragging = false;

    const rect = {
      x: Math.min(startX, e.clientX),
      y: Math.min(startY, e.clientY),
      w: Math.abs(e.clientX - startX),
      h: Math.abs(e.clientY - startY),
    };

    // Ignore tiny accidental clicks (< 10 px)
    if (rect.w < 10 || rect.h < 10) {
      selection.remove();
      return;
    }

    processSelection(rect);
  });

  /* ----------------------------------------------------------------
   * Escape key → cancel
   * -------------------------------------------------------------- */
  function onKeyDown(e) {
    if (e.key === "Escape") {
      cleanup();
      document.removeEventListener("keydown", onKeyDown);
    }
  }
  document.addEventListener("keydown", onKeyDown);

  /* ----------------------------------------------------------------
   * Helper: wait for the browser to actually repaint
   * -------------------------------------------------------------- */
  function waitForRepaint() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  }

  /* ----------------------------------------------------------------
   * Core: capture → crop → decode → open
   * -------------------------------------------------------------- */
  async function processSelection(rect) {
    // 1. Remove ALL QRLens UI so capture sees the real page
    selection.remove();
    overlay.remove();
    banner.remove();

    // 2. Wait for the browser to fully repaint without our overlay
    await waitForRepaint();

    let loader = null;

    try {
      // 3. Capture the visible tab (now clean, no overlay/spinner)
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: "capture" }, (res) => {
          if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
          if (res && res.error) return reject(new Error(res.error));
          if (!res || !res.dataUrl) return reject(new Error("Empty capture response"));
          resolve(res);
        });
      });

      // 4. NOW show the loader while we decode
      loader = showLoader();

      // 5. Load image from data URL
      const img = await loadImage(response.dataUrl);

      // 6. Crop to selected region (handle devicePixelRatio)
      const dpr    = window.devicePixelRatio || 1;
      const canvas = document.createElement("canvas");
      const ctx    = canvas.getContext("2d", { willReadFrequently: true });

      canvas.width  = Math.round(rect.w * dpr);
      canvas.height = Math.round(rect.h * dpr);

      ctx.drawImage(
        img,
        Math.round(rect.x * dpr),
        Math.round(rect.y * dpr),
        canvas.width,
        canvas.height,
        0, 0,
        canvas.width,
        canvas.height
      );

      // 7. Attempt QR decode – try multiple strategies
      const decoded = attemptDecode(canvas, ctx);

      if (loader) loader.remove();

      if (decoded) {
        showResultMenu(decoded, rect);
        return; // don't cleanup yet — menu is interactive
      } else {
        showToast("No QR code detected. Try selecting a tighter area around the QR code.", "error", 5000);
      }
    } catch (err) {
      if (loader) loader.remove();
      showToast("Capture failed – " + err.message, "error", 5000);
      console.error("QRLens error:", err);
    }

    // Clean up overlay elements immediately; toasts self-remove
    cleanup();
    document.removeEventListener("keydown", onKeyDown);
  }

  /* ----------------------------------------------------------------
   * Result menu: neobrutalism-style popup with URL, copy & open
   * -------------------------------------------------------------- */
  function showResultMenu(decoded, rect) {
    // Determine the best URL
    let url = decoded;
    let isUrl = /^https?:\/\//i.test(decoded);
    if (!isUrl) {
      const tryUrl = `https://${decoded}`;
      if (isValidUrl(tryUrl)) {
        url = tryUrl;
        isUrl = true;
      }
    }

    // Build menu container
    const menu = el("div", "qrlens-result-menu");

    // URL display
    const urlRow = el("div", "qrlens-result-url");
    urlRow.textContent = decoded;
    urlRow.title = decoded;
    menu.appendChild(urlRow);

    // Buttons row
    const btnRow = el("div", "qrlens-result-buttons");

    // Copy button
    const copyBtn = el("button", "qrlens-result-btn qrlens-result-btn--copy");
    copyBtn.textContent = "📋 Copy";
    copyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(decoded).then(() => {
        copyBtn.textContent = "✅ Copied!";
        setTimeout(() => { copyBtn.textContent = "📋 Copy"; }, 1500);
      });
    });
    btnRow.appendChild(copyBtn);

    // Open link button (only if valid URL)
    if (isUrl) {
      const openBtn = el("button", "qrlens-result-btn qrlens-result-btn--open");
      openBtn.textContent = "🔗 Open Link";
      openBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        chrome.runtime.sendMessage({ type: "openTab", url });
        dismissMenu();
      });
      btnRow.appendChild(openBtn);
    }

    menu.appendChild(btnRow);

    // Position menu below the selection rect, centered
    const menuWidth = 340;
    let left = rect.x + (rect.w / 2) - (menuWidth / 2);
    let top = rect.y + rect.h + 12;

    // Keep within viewport
    if (left < 12) left = 12;
    if (left + menuWidth > window.innerWidth - 12) left = window.innerWidth - menuWidth - 12;
    if (top + 120 > window.innerHeight) top = rect.y - 120; // flip above

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.width = `${menuWidth}px`;

    document.body.appendChild(menu);

    // Backdrop to catch clicks outside
    const backdrop = el("div", "qrlens-result-backdrop");
    document.body.appendChild(backdrop);
    backdrop.addEventListener("click", dismissMenu);

    // Dismiss handler
    function dismissMenu() {
      menu.remove();
      backdrop.remove();
      cleanup();
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keydown", escHandler);
    }

    function escHandler(e) {
      if (e.key === "Escape") dismissMenu();
    }
    document.addEventListener("keydown", escHandler);
  }

  /* ----------------------------------------------------------------
   * Multi-pass QR decode (handles small / low-contrast codes)
   * -------------------------------------------------------------- */
  function attemptDecode(canvas, ctx) {
    const w = canvas.width;
    const h = canvas.height;

    // Pass 1: direct decode at captured resolution
    const imageData = ctx.getImageData(0, 0, w, h);
    const result = jsQR(imageData.data, w, h, { inversionAttempts: "attemptBoth" });
    if (result && result.data) return result.data;

    // Pass 2: upscale 2× for small QR codes
    const up2 = upscaleCanvas(canvas, 2);
    const up2Data = up2.getContext("2d").getImageData(0, 0, up2.width, up2.height);
    const result2 = jsQR(up2Data.data, up2.width, up2.height, { inversionAttempts: "attemptBoth" });
    if (result2 && result2.data) return result2.data;

    // Pass 3: grayscale + high-contrast B&W threshold
    const bwData = toBW(ctx.getImageData(0, 0, w, h));
    const result3 = jsQR(bwData.data, w, h, { inversionAttempts: "attemptBoth" });
    if (result3 && result3.data) return result3.data;

    // Pass 4: 3× upscale + B&W (catches very small QR codes)
    const up3 = upscaleCanvas(canvas, 3);
    const up3Ctx = up3.getContext("2d");
    const up3BW = toBW(up3Ctx.getImageData(0, 0, up3.width, up3.height));
    const result4 = jsQR(up3BW.data, up3.width, up3.height, { inversionAttempts: "attemptBoth" });
    if (result4 && result4.data) return result4.data;

    return null;
  }

  /* ----------------------------------------------------------------
   * Helper: upscale a canvas by a given factor (nearest-neighbor)
   * -------------------------------------------------------------- */
  function upscaleCanvas(source, scale) {
    const c = document.createElement("canvas");
    const cx = c.getContext("2d", { willReadFrequently: true });
    c.width  = source.width * scale;
    c.height = source.height * scale;
    cx.imageSmoothingEnabled = false;
    cx.drawImage(source, 0, 0, c.width, c.height);
    return c;
  }

  /* ----------------------------------------------------------------
   * Helper: convert ImageData to pure black & white
   * -------------------------------------------------------------- */
  function toBW(imageData) {
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const avg = (d[i] + d[i + 1] + d[i + 2]) / 3;
      const bw  = avg > 128 ? 255 : 0;
      d[i] = d[i + 1] = d[i + 2] = bw;
    }
    return imageData;
  }

  /* ----------------------------------------------------------------
   * Utility: load an image from a data URL
   * -------------------------------------------------------------- */
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload  = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load captured image"));
      img.src = src;
    });
  }

  /* ----------------------------------------------------------------
   * Utility: basic URL validation
   * -------------------------------------------------------------- */
  function isValidUrl(string) {
    try { new URL(string); return true; }
    catch { return false; }
  }
})();
