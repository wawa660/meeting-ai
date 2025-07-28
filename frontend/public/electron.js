const { app, BrowserWindow, ipcMain } = require("electron")
const path = require("path")
const isDev = require("electron-is-dev")
const fs = require('fs');
const fetch = require('node-fetch').default;
const FormData = require('form-data');

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
  width: 1400,
  height: 900,
  minWidth: 1200,
  minHeight: 800,
  frame: false,
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    enableRemoteModule: false,
    preload: path.join(__dirname, "preload.js"),
  },
  show: false,
  backgroundColor: "#f8fafc",
})

    const startUrl = isDev ? "http://localhost:3000" : `file://${path.join(__dirname, "../out/index.html")}`

    mainWindow.loadURL(startUrl)

    mainWindow.once("ready-to-show", () => {
      mainWindow.show()
    })

    if (isDev) {
      mainWindow.webContents.openDevTools()
    }

    mainWindow.on("closed", () => {
      mainWindow = null
    })
  }

const { spawn } = require("child_process");

let backendProcess;

app.whenReady().then(() => {
  // Start the FastAPI backend
  backendProcess = spawn("uvicorn", ["main:app", "--reload", "--host", "127.0.0.1", "--port", "8000"], {
    cwd: path.join(__dirname, "../../backend"), // Navigate to the backend directory
    stdio: "inherit", // Pipe output to Electron's console
  });

  backendProcess.on("error", (err) => {
    console.error("Failed to start backend process:", err);
  });

  backendProcess.on("close", (code) => {
    console.log(`Backend process exited with code ${code}`);
  });

  createWindow();
});

app.on("before-quit", () => {
  if (backendProcess) {
    console.log("Stopping backend process...");
    backendProcess.kill();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

ipcMain.on("minimize", () => mainWindow.minimize());
ipcMain.on("maximize", () => mainWindow.maximize());
ipcMain.on("close", () => app.quit());


ipcMain.handle("start-transcript-capture", async () => {
    console.log("Main process received start-transcript-capture");
    return { success: true };
});

ipcMain.handle("stop-transcript-capture", async () => {
    console.log("Main process received stop-transcript-capture");
    return { success: true };
});

ipcMain.handle("send-audio-for-analysis", async (event, arrayBuffer) => {
  console.log('Received audio data in main process for analysis.');

  const audioBuffer = Buffer.from(arrayBuffer);

  if (audioBuffer.length === 0) {
    console.warn('No audio data received.');
    return { success: false, error: 'No audio data recorded.' };
  }

  const tempFilePath = path.join(app.getPath('temp'), `recording_${Date.now()}.webm`);
  
  try {
    fs.writeFileSync(tempFilePath, audioBuffer);
    console.log(`Audio saved temporarily to ${tempFilePath}`);

    const form = new FormData();
    form.append('audio_file', fs.createReadStream(tempFilePath), {
      filename: 'recording.webm',
      contentType: 'audio/webm',
    });

    const response = await fetch('http://127.0.0.1:8000/analyze', {
      method: 'POST',
      body: form,
    });

    if (response.ok) {
      const result = await response.json();
      console.log('Backend analysis successful:', result);
      return { success: true, summary: result.summary, action_items: result.action_items, transcript: result.transcript };
    } else {
      const errorText = await response.text();
      console.error('Backend analysis failed:', response.status, errorText);
      return { success: false, error: `Analysis failed: ${response.status} - ${errorText}` };
    }
  } catch (error) {
    console.error('Error sending audio to backend:', error);
    return { success: false, error: `Error during audio processing or sending: ${error.message}` };
  } finally {
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
      console.log(`Temporary file deleted: ${tempFilePath}`);
    }
  }
});

ipcMain.handle("process-ai-summary", async (event, transcript) => {
  console.log("Main process received text transcript for AI summary.");
  try {
    const response = await fetch("http://127.0.0.1:8000/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: transcript }),
    });

    if (response.ok) {
      const result = await response.json();
      console.log("Text analysis result:", result);
      return { success: true, summary: result.summary, action_items: result.action_items, transcript: result.transcript };
    } else {
      const errorText = await response.text();
      console.error("Text analysis failed:", response.status, errorText);
      return { success: false, error: `Text analysis failed: ${response.status} - ${errorText}` };
    }
  } catch (error) {
    console.error("Error processing AI summary (text):", error);
    return { success: false, error: error.message };
  }
});


ipcMain.handle("export-to-notion", async (event, config, data) => {
  try {
    const { Client } = require("@notionhq/client")

    const notion = new Client({ auth: config.apiKey })
    const pageId = config.databaseId

    const response = await notion.blocks.children.append({
      block_id: pageId,
      children: [
        {
          object: "block",
          type: "heading_2",
          heading_2: {
            rich_text: [{ type: "text", text: { content: "Meeting Summary" } }],
          },
        },
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [{ type: "text", text: { content: data.summary } }],
          },
        },
        {
          object: "block",
          type: "heading_3",
          heading_3: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: "Action Items",
                },
              },
            ],
          },
        },
        ...data.tasks.map((task) => ({
          object: "block",
          type: "to_do",
          to_do: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: `${task.title} (Assigned to: ${task.owner || "Unassigned"})${task.deadline ? ` (Deadline: ${task.deadline})` : ''}`,
                },
              },
            ],
            checked: false,
          },
        })),
        {
          object: "block",
          type: "heading_3",
          heading_3: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: "Full Transcript",
                },
              },
            ],
          },
        },
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [{ type: "text", text: { content: data.transcript || "No transcript available." } }],
          },
        },
      ],
    });

    console.log("Notion export successful:", response);
    return { success: true, pageId: response.id };
  } catch (error) {
    console.error("Notion export error:", error);
    return { success: false, error: error.message || "An unknown error occurred during Notion export." };
  }
});


ipcMain.handle("fetch-notion-databases", async (event, apiKey) => {
  try {
    const { Client } = require("@notionhq/client")

    const notion = new Client({
      auth: apiKey,
    })

    // >>> FIX STARTS HERE <<<
    const response = await notion.search({
      filter: {
        value: "database",
        property: "object",
      }, // This comma is crucial
    }); // This closing brace and parenthesis are crucial
    // >>> FIX ENDS HERE <<<

    const databases = response.results.map((db) => ({
      id: db.id,
      title: db.title?.[0]?.plain_text || "Untitled Database",
    }))

    return { success: true, databases }
  } catch (error) {
    console.error("Notion fetch databases error:", error)
    return { success: false, error: error.message }
  }
})