const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws'); // Explicitly import WebSocket for clarity

let ffmpegProcess = null; // Renamed for clarity, though it's 'rec' now
let wsClient = null; // WebSocket client
let audioBuffer = []; // Buffer to store audio data for replay

// Function to start audio capture
function startAudioCapture(mainWindow) {
  console.log('Starting audio capture...');

  // Clear previous audio buffer
  audioBuffer = [];

  // Close any existing WebSocket connection before starting a new one
  if (wsClient) {
    wsClient.close();
    wsClient = null;
  }

  // Ensure audio capture process is stopped if it's still running
  if (ffmpegProcess) {
    ffmpegProcess.kill();
    ffmpegProcess = null;
  }

  // Use 'rec' from SoX for audio capture on macOS
  // Ensure SoX is installed via Homebrew: brew install sox
  ffmpegProcess = spawn('rec', [
    // Output format parameters:
    '-r', '16000',      // Set output sample rate to 16kHz
    '-c', '1',          // Channels: 1 (mono)
    '-e', 'signed-integer', // Encoding: signed integer (SoX specific)
    '-b', '16',         // Bit depth: 16-bit
    '-t', 'raw',        // Output type: raw (raw PCM)
    '-',                // Output to stdout (this is crucial for piping)
    // Effect to apply *after* recording but *before* output
    'rate', '16000'     // Explicitly resample to 16kHz (important if device doesn't support it natively)
    // Removed problematic 'channels', 'enc', 'bits', 'endian' as separate effects/options
    // These should be handled by the initial '-c', '-e', '-b', '-t' and the system's default endianness for raw.
  ]);

  // Establish WebSocket connection
  wsClient = new WebSocket('ws://localhost:8000/ws'); // Connect to your backend WebSocket

  wsClient.onopen = () => {
    console.log('WebSocket client connected to backend.');
    // Start streaming audio from rec to WebSocket once connection is open
    ffmpegProcess.stdout.on('data', (data) => {
      // console.log(`Electron: Received ${data.length} bytes from rec.`); // Too verbose, uncomment for deep debugging
      if (wsClient && wsClient.readyState === WebSocket.OPEN) {
        wsClient.send(data);
        audioBuffer.push(data); // Store for replay
      }
    });

    ffmpegProcess.stderr.on('data', (data) => {
      // This will capture 'rec WARN formats: can't set sample rate 16000; using 44100' etc.
      console.error(`rec stderr: ${data}`);
      mainWindow.webContents.send('backend-error', `Audio capture tool output: ${data}`);
    });

    ffmpegProcess.on('close', (code) => {
      console.log(`Audio capture process exited with code ${code}`);
      if (code !== 0 && code !== null) { // null often means killed manually
          mainWindow.webContents.send('backend-error', `Audio capture process exited unexpectedly with code ${code}`);
      }
    });

    ffmpegProcess.on('error', (err) => {
      console.error('Failed to start audio capture process:', err);
      mainWindow.webContents.send('backend-error', `Audio capture error: ${err.message}. Is 'rec' (SoX) installed and in your PATH?`);
    });
  };

  wsClient.onmessage = (event) => {
    const message = JSON.parse(event.data);
    // console.log('Received message from backend:', message); // For debugging
    switch (message.type) {
      case 'transcript':
        mainWindow.webContents.send('transcript-update', message.data);
        break;
      case 'summary':
        mainWindow.webContents.send('summary-update', message.data);
        break;
      case 'action_items':
        mainWindow.webContents.send('action-items-update', message.data);
        break;
      case 'error':
        mainWindow.webContents.send('backend-error', `Backend error: ${message.data}`);
        break;
      default:
        console.warn('Unknown message type from backend:', message.type);
    }
  };

  wsClient.onclose = (event) => {
    console.log('WebSocket disconnected from backend:', event.code, event.reason);
    if (!event.wasClean) {
        mainWindow.webContents.send('backend-error', `WebSocket connection closed unexpectedly: ${event.code} ${event.reason || ''}`);
    }
  };

  wsClient.onerror = (error) => {
    console.error('WebSocket error:', error);
    mainWindow.webContents.send('backend-error', `WebSocket error: ${error.message || error}`);
  };
}

// Function to stop audio capture
function stopAudioCapture() {
  console.log('Stopping audio capture...');
  if (ffmpegProcess) {
    ffmpegProcess.kill();
    ffmpegProcess = null;
  }
  if (wsClient) {
    wsClient.close();
    wsClient = null;
  }
}

// IPC handler for replaying audio
ipcMain.on('replay-audio', (event) => {
  console.log('Replaying audio...');
  if (audioBuffer.length > 0) {
    // Concatenate all buffered audio chunks into a single Buffer
    const fullAudio = Buffer.concat(audioBuffer);
    event.sender.send('replay-audio-data', fullAudio);
  } else {
    console.warn('No audio data to replay.');
    event.sender.send('replay-audio-data', null); // Send null to indicate no data
  }
});


function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile('index.html');

  // Open the DevTools.
  // mainWindow.webContents.openDevTools();

  ipcMain.on('start-audio-capture', () => startAudioCapture(mainWindow));
  ipcMain.on('stop-audio-capture', stopAudioCapture);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});