const { app, BrowserWindow, ipcMain } = require('electron'); // Import ipcMain
const { spawn } = require('child_process');
const path = require('path');
const { WebSocket } = require('ws');

let mainWindow;
let ws;
let recProcess;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    mainWindow.loadFile('index.html');

    // Initialize WebSocket connection (do not start audio here)
    ws = new WebSocket('ws://127.0.0.1:8000/ws');

    ws.onopen = () => {
        console.log('WebSocket client connected to backend.');
        // Don't start audio capture immediately here anymore.
        // It will be started by the 'start-recording' IPC event.
    };

    ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            if (message.type === 'transcript') {
                mainWindow.webContents.send('transcript-update', message.data);
            } else if (message.type === 'summary') {
                console.log('Received Summary:', message.data); // Log for debugging
                mainWindow.webContents.send('summary-update', message.data);
            } else if (message.type === 'action_items') { // New type for action items
                console.log('Received Action Items:', message.data); // Log for debugging
                mainWindow.webContents.send('action-items-update', message.data);
            }
            else if (message.type === 'error') {
                console.error('Backend Error:', message.data);
                mainWindow.webContents.send('error-message', message.data);
            }
        } catch (e) {
            console.error('Failed to parse WebSocket message:', e, event.data);
        }
    };

    ws.onclose = (event) => {
        console.log('WebSocket disconnected from backend:', event.code, event.reason);
        if (recProcess) {
            recProcess.kill();
            console.log('Stopping audio capture...');
        }
        // Consider re-establishing connection or informing user
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        mainWindow.webContents.send('error-message', `WebSocket Error: ${error.message}`);
    };

    // IPC Main handlers for renderer process communication
    ipcMain.on('start-recording', () => {
        if (!recProcess || recProcess.killed) { // Only start if not already running
            recProcess = startAudioCapture(ws);
        } else {
            console.log('Recording already active.');
        }
    });

    ipcMain.on('stop-recording', () => {
        if (recProcess && !recProcess.killed) {
            recProcess.kill(); // Stop the audio process
            console.log('Sending stop signal to backend...');
            // Send a specific message to the backend to signal recording stopped
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'stop_recording' }));
            }
        } else {
            console.log('No active recording to stop.');
        }
    });
}

function startAudioCapture(websocket) {
    console.log('Starting audio capture...');

    const recProcess = spawn('rec', [
        '-q',
        '-b', '16',
        '-e', 'signed-integer',
        '-c', '1',
        '-t', 'raw',
        '--buffer', '2000',
        '-',
        'rate', '16000'
    ]);

    recProcess.stdout.on('data', (data) => {
        if (websocket.readyState === WebSocket.OPEN) {
            websocket.send(data);
        }
    });

    recProcess.stderr.on('data', (data) => {
        console.error(`rec stderr: ${data}`);
    });

    recProcess.on('close', (code) => {
        console.log(`Audio capture process exited with code ${code}`);
        recProcess = null; // Clear the process reference
    });

    recProcess.on('error', (err) => {
        console.error(`Failed to start rec process: ${err.message}`);
        mainWindow.webContents.send('error-message', `Audio capture failed: ${err.message}. Is SoX installed and in your PATH?`);
    });

    return recProcess;
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

app.on('before-quit', () => {
    if (recProcess) {
        recProcess.kill();
        console.log('Killed audio capture process before quitting.');
    }
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
        console.log('Closed WebSocket connection before quitting.');
    }
});