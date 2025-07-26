const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Expose functions that the renderer can call in the main process
    // These channel names must match what ipcMain.on listens for in main.js
    startRecording: () => ipcRenderer.send('start-recording'), // Corrected to match main.js
    stopRecording: () => ipcRenderer.send('stop-recording'),   // Corrected to match main.js
    replayAudio: () => ipcRenderer.send('replay-audio'),       // This channel is currently unused in main.js, but kept for completeness

    // Expose functions to receive data from the main process
    // These channel names must match what mainWindow.webContents.send uses in main.js
    onTranscriptUpdate: (callback) => ipcRenderer.on('transcript-update', (_event, value) => callback(value)), // Corrected to match main.js/renderer.js
    onSummaryUpdate: (callback) => ipcRenderer.on('summary-update', (_event, value) => callback(value)),       // Corrected to match main.js/renderer.js
    onActionItemsUpdate: (callback) => ipcRenderer.on('action-items-update', (_event, value) => callback(value)), // Corrected to match main.js/renderer.js
    onReplayAudioData: (callback) => ipcRenderer.on('replay-audio-data', (_event, audioData) => callback(audioData)), // This channel is currently unused in main.js, but kept for completeness
    onErrorMessage: (callback) => ipcRenderer.on('error-message', (_event, value) => callback(value)),           // Added missing error handler
});