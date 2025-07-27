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

    const playButton = document.createElement('button');
    playButton.textContent = 'Play Recording';
    playButton.id = 'playButton';
    playButton.disabled = true; // Initially disabled
    document.getElementById('content').appendChild(playButton);

    const transcriptDiv = document.createElement('div');
    transcriptDiv.id = 'transcript';
    transcriptDiv.innerHTML = '<h2>Transcript:</h2><p></p>';
    document.getElementById('content').appendChild(transcriptDiv);

    const summaryDiv = document.createElement('div');
    summaryDiv.id = 'summary';
    summaryDiv.innerHTML = '<h2>Summary:</h2><p></p>';
    document.getElementById('content').appendChild(summaryDiv);

    const actionItemsDiv = document.createElement('div');
    actionItemsDiv.id = 'actionItems';
    actionItemsDiv.innerHTML = '<h2>Action Items:</h2><ul></ul>';
    document.getElementById('content').appendChild(actionItemsDiv);

    let mediaRecorder;
    let audioChunks = [];
    let audioBlob = null;

    startButton.addEventListener('click', async () => {
        console.log('Start button clicked');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            audioBlob = null;

            mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = async () => {
                audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const arrayBuffer = await audioBlob.arrayBuffer();
                window.electronAPI.sendAudioToMain(arrayBuffer);
                playButton.disabled = false;
            };

            mediaRecorder.start();
            startButton.disabled = true;
            stopButton.disabled = false;
            playButton.disabled = true;
            // Clear previous results
            transcriptDiv.querySelector('p').textContent = '';
            summaryDiv.querySelector('p').textContent = '';
            actionItemsDiv.querySelector('ul').innerHTML = '';
        } catch (error) {
            console.error('Error accessing microphone:', error);
            alert('Error accessing microphone. Please ensure you have a microphone and have granted permission.');
        }
    });

    stopButton.addEventListener('click', () => {
        console.log('Stop button clicked');
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
            // Stop all tracks in the stream to release microphone
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
        startButton.disabled = false;
        stopButton.disabled = true;
        transcriptDiv.querySelector('p').textContent = 'Recording stopped. Sending for analysis...';
    });

    playButton.addEventListener('click', () => {
        console.log('Play button clicked');
        if (audioBlob) {
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            audio.play();
            audio.onended = () => {
                URL.revokeObjectURL(audioUrl);
            };
        } else {
            console.warn('No audio recorded to play.');
        }
    });

    window.electronAPI.onAnalysisResult((result) => {
        console.log('Received analysis result:', result);
        transcriptDiv.querySelector('p').textContent = result.transcript || 'No transcript available.';
        summaryDiv.querySelector('p').textContent = result.summary;
        const ul = actionItemsDiv.querySelector('ul');
        ul.innerHTML = ''; // Clear previous items
        result.action_items.forEach(item => {
            const li = document.createElement('li');
            li.textContent = `Task: ${item.task}, Owner: ${item.owner}, Deadline: ${item.deadline}`;
            ul.appendChild(li);
        });
    });

    window.electronAPI.onAnalysisError((errorMessage) => {
        console.error('Analysis error:', errorMessage);
        transcriptDiv.querySelector('p').textContent = `Error: ${errorMessage}`;
        summaryDiv.querySelector('p').textContent = '';
        actionItemsDiv.querySelector('ul').innerHTML = '';
    });
});