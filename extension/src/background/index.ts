chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.local.set({
    'multimeet.settings': {
      serverUrl: 'http://localhost:3000',
      outputSize: '720p',
      fps: 30,
      background: '#090b10',
      showNames: true,
      maxParticipants: 6,
    },
  });
});
