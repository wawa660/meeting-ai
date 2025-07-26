document.addEventListener('DOMContentLoaded', () => {
    // Select existing buttons and divs from index.html using their IDs
    const startBtn = document.getElementById('startRecordingBtn');
    const stopBtn = document.getElementById('stopRecordingBtn');
    const replayBtn = document.getElementById('replayLastRecordingBtn'); // Replay button
    
    const liveTranscriptDiv = document.getElementById('liveTranscript');
    const summaryOutputDiv = document.getElementById('summaryOutput');
    const actionItemsOutputDiv = document.getElementById('actionItemsOutput');

    // Initial button states
    startBtn.disabled = false;
    stopBtn.disabled = true;
    replayBtn.disabled = true; // Replay disabled until a recording is stopped

    // Event Listeners for buttons
    startBtn.addEventListener('click', () => {
        console.log('Start Recording button clicked');
        // Clear previous outputs
        liveTranscriptDiv.innerText = '';
        summaryOutputDiv.innerText = '';
        actionItemsOutputDiv.innerText = '';

        // Call the correct IPC channel exposed by preload.js
        window.electronAPI.startRecording(); // Corrected channel name

        // Update button states
        startBtn.disabled = true;
        stopBtn.disabled = false;
        replayBtn.disabled = true; // Disable replay when a new recording starts
    });

    stopBtn.addEventListener('click', () => {
        console.log('Stop Recording button clicked');
        // Call the correct IPC channel exposed by preload.js
        window.electronAPI.stopRecording(); // Corrected channel name

        // Update button states
        startBtn.disabled = false;
        stopBtn.disabled = true;
        replayBtn.disabled = false; // Enable replay after stopping
    });

    replayBtn.addEventListener('click', () => {
        console.log('Replay Last Recording button clicked');
        // Call the correct IPC channel exposed by preload.js
        window.electronAPI.replayAudio();
    });

    // IPC Renderers (listening for messages from main.js)
    // These channel names must match what main.js sends (e.g., mainWindow.webContents.send)
    window.electronAPI.onTranscriptUpdate((transcript) => { // Corrected channel name
        // Append transcript chunks, rather than replacing
        liveTranscriptDiv.innerText += transcript + ' ';
        // Auto-scroll to the bottom
        liveTranscriptDiv.scrollTop = liveTranscriptDiv.scrollHeight;
    });

    window.electronAPI.onSummaryUpdate((summary) => { // Corrected channel name
        summaryOutputDiv.innerText = summary;
    });

    window.electronAPI.onActionItemsUpdate((actionItems) => { // Corrected channel name
        // Assuming actionItems is now an array of strings as per backend (e.g., ["Item 1", "Item 2"])
        // If backend sends objects with task/owner/deadline, then adjust this part.
        // For now, let's assume simple string array based on the provided backend mock.
        actionItemsOutputDiv.innerHTML = ''; // Clear previous items
        if (Array.isArray(actionItems) && actionItems.length > 0) {
            const ul = document.createElement('ul');
            actionItems.forEach(item => {
                const li = document.createElement('li');
                li.textContent = item; // Directly use the string item
                ul.appendChild(li);
            });
            actionItemsOutputDiv.appendChild(ul);
        } else {
            actionItemsOutputDiv.innerText = 'No action items found.';
        }
    });

    window.electronAPI.onErrorMessage((message) => { // Added error message handler
        console.error('Frontend Error:', message);
        alert(`An error occurred: ${message}`); // Simple alert for now
    });

    // Replay Audio Data Handler (Simplified/Corrected based on typical raw PCM playback)
    window.electronAPI.onReplayAudioData(async (audioData) => {
        console.log('Received audio data for replay.');
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const sampleRate = 16000; // Assumed sample rate
            const numberOfChannels = 1; // Assumed mono

            // The 'audioData' received from 'main.js' would typically be a Node.js Buffer.
            // We need to convert it to an ArrayBuffer and then to Float32Array for Web Audio API.
            // Assuming audioData is raw 16-bit signed integer (S16_LE).
            const arrayBuffer = audioData.buffer.slice(audioData.byteOffset, audioData.byteOffset + audioData.byteLength);
            const int16Array = new Int16Array(arrayBuffer);

            const audioBuffer = audioContext.createBuffer(numberOfChannels, int16Array.length, sampleRate);
            const nowBuffering = audioBuffer.getChannelData(0);

            for (let i = 0; i < int16Array.length; i++) {
                // Normalize 16-bit integer to float32 range [-1.0, 1.0]
                nowBuffering[i] = int16Array[i] / 32768.0;
            }

            const source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);
            source.start(0); // Play immediately

            source.onended = () => {
                console.log('Audio replay finished.');
                audioContext.close();
            };
        } catch (error) {
            console.error('Error during audio replay:', error);
            alert(`Error replaying audio: ${error.message}`);
        }
    });
});