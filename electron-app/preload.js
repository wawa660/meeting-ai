const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Expose functions that the renderer can call in the main process
  // For example, to start/stop audio capture
  startAudioCapture: () => ipcRenderer.send('start-audio-capture'),
  stopAudioCapture: () => ipcRenderer.send('stop-audio-capture'),
  replayAudio: () => ipcRenderer.send('replay-audio'),

  // Expose functions to receive data from the main process
  onTranscript: (callback) => ipcRenderer.on('transcript-update', (event, transcript) => callback(transcript)),
  onSummary: (callback) => ipcRenderer.on('summary-update', (event, summary) => callback(summary)),
  onActionItems: (callback) => ipcRenderer.on('action-items-update', (event, actionItems) => callback(actionItems)),
  onReplayAudioData: (callback) => ipcRenderer.on('replay-audio-data', (event, audioData) => callback(audioData)),
});
