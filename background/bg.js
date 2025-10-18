chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'INJECT_PAGE_HOOK' && sender?.tab?.id) {
    chrome.scripting.executeScript(
      {
        target: { tabId: sender.tab.id, allFrames: false },
        files: ['inject/hook.js'],
        world: 'MAIN'
      },
      () => sendResponse({ ok: true })
    );
    return true; 
  }
});