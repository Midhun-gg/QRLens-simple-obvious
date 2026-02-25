/**
 * QRLens – Background Service Worker
 *
 * Responsibilities:
 *  1. Listen for the extension icon click and inject content script + styles.
 *  2. Capture the visible tab when requested by the content script.
 *  3. Open decoded URLs in a new tab.
 */

/* ------------------------------------------------------------------ */
/*  Icon click → inject content script & styles                       */
/* ------------------------------------------------------------------ */

chrome.action.onClicked.addListener(async (tab) => {
  // Avoid injecting on restricted pages
  if (
    !tab.url ||
    tab.url.startsWith("chrome://") ||
    tab.url.startsWith("chrome-extension://")
  ) {
    console.warn("QRLens: Cannot run on this page.");
    return;
  }

  try {
    // Inject CSS first so styles are ready before JS runs
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ["styles.css"],
    });

    // Inject the jsQR library, then the content script
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["lib/jsQR.min.js", "content.js"],
    });
  } catch (err) {
    console.error("QRLens: Injection failed –", err);
  }
});

/* ------------------------------------------------------------------ */
/*  Message handling from content script                               */
/* ------------------------------------------------------------------ */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // --- Capture visible tab ----------------------------------------
  if (message.type === "capture") {
    chrome.tabs.captureVisibleTab(
      sender.tab.windowId,
      { format: "png" },
      (dataUrl) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ dataUrl });
        }
      },
    );
    return true; // keep message channel open for async response
  }

  // --- Open decoded URL in new tab --------------------------------
  if (message.type === "openTab") {
    chrome.tabs.create({ url: message.url, active: true });
  }
});
