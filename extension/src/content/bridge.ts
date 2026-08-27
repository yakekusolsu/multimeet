import type { ExtensionState, ProviderCommand } from '../types';

let latestState: ExtensionState = {
  active: false,
  participants: [],
  cameraEnabled: true,
  microphoneEnabled: true,
};

window.addEventListener('message', (event: MessageEvent) => {
  if (
    event.source !== window ||
    event.data?.source !== 'multimeet-provider' ||
    event.data?.type !== 'state'
  )
    return;
  latestState = event.data.state as ExtensionState;
  void chrome.storage.session.set({ [`tab-state`]: latestState });
  void chrome.runtime
    .sendMessage({ type: 'multimeet-state', state: latestState })
    .catch(() => undefined);
});

chrome.runtime.onMessage.addListener(
  (message: { type?: string; command?: ProviderCommand }, _sender, sendResponse) => {
    if (message.type === 'get-state') {
      sendResponse(latestState);
      return false;
    }
    if (message.type === 'command' && message.command) {
      window.dispatchEvent(new CustomEvent('multimeet:command', { detail: message.command }));
      sendResponse({ ok: true });
    }
    return false;
  },
);
