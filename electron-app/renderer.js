document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.createElement('button');
    startButton.textContent = 'Start Recording';
    startButton.id = 'startButton';
    document.getElementById('content').appendChild(startButton);

    const stopButton = document.createElement('button');
    stopButton.textContent = 'Stop Recording';
    stopButton.id = 'stopButton';
    stopButton.disabled = true; // Initially disabled
    document.getElementById('content').appendChild(stopButton);

    const replayButton = document.createElement('button');
    replayButton.textContent = 'Replay Last Recording';
    replayButton.id = 'replayButton';
    replayButton.disabled = true; // Initially disabled
    document.getElementById('content').appendChild(replayButton);

    const transcriptDiv = document.createElement('div');
    transcriptDiv.id = 'transcript';
    transcriptDiv.innerHTML = '<h2>Live Transcript:</h2><p></p>';
    document.getElementById('content').appendChild(transcriptDiv);

    const summaryDiv = document.createElement('div');
    summaryDiv.id = 'summary';
    summaryDiv.innerHTML = '<h2>Summary:</h2><p></p>';
    document.getElementById('content').appendChild(summaryDiv);

    const actionItemsDiv = document.createElement('div');
    actionItemsDiv.id = 'actionItems';
    actionItemsDiv.innerHTML = '<h2>Action Items:</h2><ul></ul>';
    document.getElementById('content').appendChild(actionItemsDiv);

    startButton.addEventListener('click', () => {
        console.log('Start button clicked');
        window.electronAPI.startAudioCapture();
        startButton.disabled = true;
        stopButton.disabled = false;
    });

    stopButton.addEventListener('click', () => {
        console.log('Stop button clicked');
        window.electronAPI.stopAudioCapture();
        startButton.disabled = false;
        stopButton.disabled = true;
        replayButton.disabled = false; // Enable replay after stopping
    });

    replayButton.addEventListener('click', () => {
        console.log('Replay button clicked');
        window.electronAPI.replayAudio();
    });

    window.electronAPI.onTranscript((transcript) => {
        transcriptDiv.querySelector('p').textContent = transcript;
    });

    window.electronAPI.onSummary((summary) => {
        summaryDiv.querySelector('p').textContent = summary;
    });

    window.electronAPI.onActionItems((actionItems) => {
        const ul = actionItemsDiv.querySelector('ul');
        ul.innerHTML = ''; // Clear previous items
        actionItems.forEach(item => {
            const li = document.createElement('li');
            li.textContent = `Task: ${item.task}, Owner: ${item.owner}, Deadline: ${item.deadline}`;
            ul.appendChild(li);
        });
    });

    window.electronAPI.onReplayAudioData(async (audioData) => {
        console.log('Received audio data for replay.');
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        // Decode the audio data (assuming it's raw PCM S16_LE, 16kHz, mono)
        // Need to convert Buffer to ArrayBuffer for decodeAudioData
        const arrayBuffer = audioData.buffer.slice(audioData.byteOffset, audioData.byteOffset + audioData.byteLength);

        // Create an AudioBuffer from the raw PCM data
        // This requires manual decoding as decodeAudioData expects encoded formats (e.g., WAV, MP3)
        // For raw PCM, we need to create an AudioBuffer and copy data.
        const sampleRate = 16000;
        const numberOfChannels = 1;
        const length = audioData.length / 2; // 2 bytes per sample for S16_LE

        const audioBufferNode = audioContext.createBuffer(numberOfChannels, length, sampleRate);
        const nowBuffering = audioBufferNode.getChannelData(0);
        const dataView = new DataView(arrayBuffer);

        for (let i = 0; i < length; i++) {
            // Read 16-bit signed integer and normalize to -1.0 to 1.0
            nowBuffering[i] = dataView.getInt16(i * 2, true) / 32768.0;
        }

        const source = audioContext.createBufferSource();
        source.buffer = audioBufferNode;
        source.connect(audioContext.destination);
        source.start();

        source.onended = () => {
            console.log('Audio replay finished.');
            audioContext.close();
        };
    });
});
