const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("electronAPI", {

  minimize: () => ipcRenderer.send("minimize"),
  maximize: () => ipcRenderer.send("maximize"),
  close: () => ipcRenderer.send("close"),

  startTranscriptCapture: () => ipcRenderer.invoke("start-transcript-capture"),
  stopTranscriptCapture: () => ipcRenderer.invoke("stop-transcript-capture"),

  sendAudioForAnalysis: (audioBuffer) => ipcRenderer.invoke("send-audio-for-analysis", audioBuffer),

  processAISummary: (transcript) => ipcRenderer.invoke("process-ai-summary", transcript),

  exportToNotion: (config, data) => ipcRenderer.invoke("export-to-notion", config, data),
  fetchNotionDatabases: (apiKey) => ipcRenderer.invoke("fetch-notion-databases", apiKey),

  onTranscriptUpdate: (callback) => ipcRenderer.on("transcript-update", callback),
  onMeetingStatusChange: (callback) => ipcRenderer.on("meeting-status-change", callback),
})