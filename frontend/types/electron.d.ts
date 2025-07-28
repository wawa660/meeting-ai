export {};

declare global {
  interface Window {
    electronAPI: {
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      startTranscriptCapture: () => Promise<{ success: boolean; result?: any; error?: string }>;
      stopTranscriptCapture: () => Promise<{ success: boolean; result?: any; error?: string }>;
      sendAudioForAnalysis: (audioBuffer: ArrayBuffer) => Promise<{ success: boolean; result?: any; error?: string }>;
      exportToNotion: (config: any, data: any) => Promise<{ success: boolean; pageId?: string; error?: string }>;
      fetchNotionDatabases: (apiKey: string) => Promise<{ success: boolean; databases?: any[]; error?: string }>;
      processAISummary: (transcript: string) => Promise<any>;
      onTranscriptUpdate: (callback: (event: Electron.IpcRendererEvent, segment: any) => void) => Electron.IpcRenderer;
      onMeetingStatusChange: (callback: (event: Electron.IpcRendererEvent, status: string) => void) => Electron.IpcRenderer;
    };
  }
}