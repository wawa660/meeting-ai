// electron-app/main.js

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws'); // ADDED for WebSocket client

let ffmpegProcess = null;
let wsClient = null; // Changed from tcpClient to wsClient for WebSocket
let audioBuffer = []; // Buffer to store audio data for replay

// Function to start audio capture
function startAudioCapture(mainWindow) {
  console.log('Starting audio capture...');

  audioBuffer = []; // Clear previous audio buffer

  // Close any existing WebSocket connection before starting a new one
  if (wsClient) {
    wsClient.close();
    wsClient = null;
  }

  // Ensure ffmpegProcess is stopped if it's still running
  if (ffmpegProcess) {
    ffmpegProcess.kill();
    ffmpegProcess = null;
  }

  // --- Audio Recording Process Setup ---
  // IMPORTANT: The 'arecord' command is for Linux systems.
  // For macOS, you might need 'sox' or 'ffmpeg'.
  // If 'arecord' works on your Mac (via Homebrew or similar), keep it.
  // Otherwise, you'll need to install 'ffmpeg' (e.g., `brew install ffmpeg`)
  // or 'sox' (e.g., `brew install sox`) and use the appropriate command.

  // Example for macOS with ffmpeg (ensure ffmpeg is in your PATH):
  // ffmpegProcess = spawn('ffmpeg', [
  //   '-f', 'avfoundation', // Or 'coreaudio' depending on macOS version
  //   '-i', ':0', // Input device, might need to change if you have multiple mics
  //   '-f', 's16le',
  //   '-acodec', 'pcm_s16le',
  //   '-ar', '16000',
  //   '-ac', '1',
  //   '-threads', '1',
  //   'pipe:1'
  // ]);

  // Example for macOS with sox (ensure sox is installed):
  // ffmpegProcess = spawn('sox', [
  //   '-d', // Default audio device
  //   '-r', '16000', // Sample rate
  //   '-c', '1',    // Channels (mono)
  //   '-b', '16',   // Bit depth
  //   '-t', 'raw',  // Raw PCM
  //   '-'           // Output to stdout
  // ]);

  // Using 'arecord' as per your original file, assuming it works for you:
  ffmpegProcess = spawn('arecord', [
    '-f', 'S16_LE', // Signed 16-bit Little Endian
    '-r', '16000',  // 16kHz sample rate
    '-c', '1',      // 1 channel (mono)
    '-t', 'raw',    // Raw audio format
    '-'             // Output to stdout
  ]);


  // --- WebSocket connection to FastAPI backend on port 8000 ---
  wsClient = new WebSocket('ws://localhost:8000/ws'); // Connect to your FastAPI WebSocket endpoint

  wsClient.onopen = () => {
    console.log('WebSocket client connected to FastAPI backend.');
    // Pipe audio data from ffmpegProcess stdout to WebSocket
    ffmpegProcess.stdout.on('data', (data) => {
      // console.log(`Electron: Sending ${data.length} bytes via WebSocket`);
      if (wsClient.readyState === WebSocket.OPEN) {
        wsClient.send(data);
        audioBuffer.push(data); // Store for replay
      }
    });

    ffmpegProcess.stderr.on('data', (data) => {
      console.error(`arecord/ffmpeg stderr: ${data}`);
    });

    ffmpegProcess.on('close', (code) => {
      console.log(`Audio process exited with code ${code}`);
      if (wsClient.readyState === WebSocket.OPEN) {
        wsClient.close(); // Close WebSocket if audio process ends
      }
    });
  };

  wsClient.onmessage = (event) => {
    // This is where you'll receive real-time transcript, summary, and action items updates
    console.log('Received message from WebSocket backend:', event.data);
    try {
      const message = JSON.parse(event.data);
      if (message.type === 'transcript') {
        mainWindow.webContents.send('transcript-update', message.data);
      } else if (message.type === 'summary') {
        mainWindow.webContents.send('summary-update', message.data);
      } else if (message.type === 'action_items') {
        mainWindow.webContents.send('action-items-update', message.data);
      }
    } catch (e) {
      console.error('Failed to parse WebSocket message:', e);
    }
  };

  wsClient.onerror = (error) => {
    console.error('WebSocket error:', error);
  };

  wsClient.onclose = () => {
    console.log('WebSocket client disconnected from backend.');
  };
}

// Function to stop audio capture
function stopAudioCapture() {
  console.log('Stopping audio capture...');
  if (ffmpegProcess) {
    ffmpegProcess.kill();
    ffmpegProcess = null;
  }
  if (wsClient) { // Now referring to wsClient
    wsClient.close(); // Use close() for WebSockets
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
  }
});

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false, // nodeIntegration should be false when using preload
      contextIsolation: true, // contextIsolation should be true when using preload
    },
  });

  mainWindow.loadFile('index.html');

  // Open the DevTools.
  // mainWindow.webContents.openDevTools(); // Uncomment this line to open DevTools for debugging Electron app

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