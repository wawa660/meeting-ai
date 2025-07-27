const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const FormData = require('form-data');

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

  // Open the DevTools for debugging
  // mainWindow.webContents.openDevTools();
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

// IPC handler for sending audio to the main process for analysis
ipcMain.on('send-audio-to-main', async (event, arrayBuffer) => {
  console.log('Received audio data in main process.');

  const audioBuffer = Buffer.from(arrayBuffer);

  if (audioBuffer.length === 0) {
    console.warn('No audio data received.');
    event.sender.send('analysis-error', 'No audio data recorded.');
    return;
  }

  const tempFilePath = path.join(app.getPath('temp'), `recording_${Date.now()}.webm`);
  try {
    fs.writeFileSync(tempFilePath, audioBuffer);
    console.log(`Audio saved to ${tempFilePath}`);

    const form = new FormData();
    form.append('audio_file', fs.createReadStream(tempFilePath), 'recording.webm');

    const response = await fetch('http://127.0.0.1:8000/analyze', {
      method: 'POST',
      body: form,
    });

    if (response.ok) {
      const result = await response.json();
      console.log('Analysis Result:', result);
      event.sender.send('analysis-result', result);
    } else {
      const errorText = await response.text();
      console.error('Backend analysis failed:', response.status, errorText);
      event.sender.send('analysis-error', `Analysis failed: ${response.status} - ${errorText}`);
    }
  } catch (error) {
    console.error('Error sending audio to backend:', error);
    event.sender.send('analysis-error', `Error sending audio to backend: ${error.message}`);
  } finally {
    // Clean up the temporary file
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
      console.log(`Temporary file ${tempFilePath} deleted.`);
    }
  }
});