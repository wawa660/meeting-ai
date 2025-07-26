const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');

let ffmpegProcess = null;
let tcpClient = null;
let audioBuffer = []; // Buffer to store audio data for replay

// Function to start audio capture
function startAudioCapture(mainWindow) {
  console.log('Starting audio capture...');

  // Clear previous audio buffer
  audioBuffer = [];

  // Close any existing TCP connection before starting a new one
  if (tcpClient) {
    tcpClient.destroy();
    tcpClient = null;
  }

  // Ensure ffmpegProcess is stopped if it's still running
  if (ffmpegProcess) {
    ffmpegProcess.kill();
    ffmpegProcess = null;
  }

  // For Linux, you might need to find the correct audio source.
  // This example uses 'arecord' for simplicity, which captures from the default microphone.
  // For system audio, you'd typically need to configure PulseAudio or ALSA loopback devices.
  ffmpegProcess = spawn('arecord', [
    '-f', 'S16_LE',
    '-r', '16000',
    '-c', '1',
    '-t', 'raw',
    '-' // Output to stdout
  ]);

  // Connect to raw TCP server
  tcpClient = net.connect({ port: 8001, host: 'localhost' }, () => {
    console.log('TCP client connected to backend.');
    ffmpegProcess.stdout.on('data', (data) => {
      console.log(`Electron: Received ${data.length} bytes from arecord stdout.`);
      audioBuffer.push(data); // Store data in buffer
      if (tcpClient) {
        tcpClient.write(data);
        console.log(`Electron: Sent ${data.length} bytes to TCP server.`);
      }
    });

    ffmpegProcess.stderr.on('data', (data) => {
      console.error(`Electron: ffmpeg stderr: ${data}`);
    });

    ffmpegProcess.on('close', (code) => {
      console.log(`Electron: ffmpeg process exited with code ${code}`);
      // Clean up TCP client if ffmpeg closes unexpectedly
      if (tcpClient) {
        tcpClient.destroy();
        tcpClient = null;
      }
    });
  });

  tcpClient.on('data', (data) => {
    console.log(`Electron: Received data from TCP server: ${data.toString()}`);
    // In a real scenario, this would be parsed as JSON for transcripts/summaries
  });

  tcpClient.on('end', () => {
    console.log('TCP client disconnected from backend.');
    tcpClient = null;
  });

  tcpClient.on('error', (err) => {
    console.error('TCP client error:', err);
    tcpClient = null;
  });
}

// Function to stop audio capture
function stopAudioCapture() {
  console.log('Stopping audio capture...');
  if (ffmpegProcess) {
    ffmpegProcess.kill();
    ffmpegProcess = null;
  }
  if (tcpClient) {
    tcpClient.destroy();
    tcpClient = null;
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
