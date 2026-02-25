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
  // Guard: skip restricted browser-internal pages
  const url = tab.url || "";
  if (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:")
  ) {
    console.warn("QRLens: Cannot run on this page:", url);
    return;
  }

  try {
    // Inject CSS first so styles are ready before JS runs
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ["styles.css"],
    });

    // Inject jsQR library first, then content script (separate calls for reliability)
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["lib/jsQR.min.js"],
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });

    console.log("QRLens: Injected successfully into tab", tab.id);
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
          console.error("QRLens: captureVisibleTab failed:", chrome.runtime.lastError.message);
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
