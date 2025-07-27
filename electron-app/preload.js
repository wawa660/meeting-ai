const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  sendAudioToMain: (audioBuffer) => ipcRenderer.send('send-audio-to-main', audioBuffer),
  onAnalysisResult: (callback) => ipcRenderer.on('analysis-result', (event, result) => callback(result)),
  onAnalysisError: (callback) => ipcRenderer.on('analysis-error', (event, errorMessage) => callback(errorMessage)),
});