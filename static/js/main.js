let isDrawing = false;
let startX, startY;
let boundingBoxes = [];
let mediaRecorder = null;
let audioChunks = [];
let recordedAudios = [];
let isRecording = false;
let currentBoxIndex = null;

document.getElementById('upload-form').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const formData = new FormData();
    const imageFile = document.getElementById('image-input').files[0];
    formData.append('image', imageFile);

    fetch('/upload', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            const img = document.getElementById('uploaded-image');
            img.src = data.image_url;
            img.style.display = 'block';
            
            // Set up canvas after image loads
            img.onload = function() {
                setupCanvas(img);
            };
        } else {
            alert('Error uploading image');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Error uploading image');
    });
});

document.getElementById('record-button').addEventListener('click', toggleRecording);

async function toggleRecording() {
    const recordButton = document.getElementById('record-button');
    const statusElement = document.getElementById('recording-status');
    const nameInput = document.getElementById('audio-name');

    if (!isRecording) {
        if (!nameInput.value.trim()) {
            alert('Please enter a name for the audio clip');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/m4a' });
                const audioUrl = URL.createObjectURL(audioBlob);
                
                recordedAudios.push({
                    name: nameInput.value,
                    url: audioUrl
                });

                addAudioToList(nameInput.value, audioUrl);
                nameInput.value = '';
            };

            mediaRecorder.start();
            isRecording = true;
            recordButton.textContent = 'Stop';
            statusElement.textContent = '🔴 Recording...';
            recordButton.classList.add('recording');
        } catch (err) {
            console.error('Error accessing microphone:', err);
            alert('Error accessing microphone');
        }
    } else {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        isRecording = false;
        recordButton.textContent = 'Record';
        statusElement.textContent = '';
        recordButton.classList.remove('recording');
    }
}

function addAudioToList(name, url) {
    const audioList = document.getElementById('audio-list');
    const audioItem = document.createElement('div');
    audioItem.className = 'audio-item';
    
    audioItem.innerHTML = `
        <span>${name}</span>
        <audio controls src="${url}"></audio>
    `;
    
    audioList.appendChild(audioItem);
}

function setupCanvas(img) {
    const canvas = document.getElementById('drawing-canvas');
    const audio = document.getElementById('box-audio');
    canvas.width = img.width;
    canvas.height = img.height;
    
    const ctx = canvas.getContext('2d');
    
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', endDrawing);
    canvas.addEventListener('mouseout', endDrawing);
    
    function handleMouseDown(e) {
        const rect = canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        
        // Check if click is inside any existing box
        const clickedBox = boundingBoxes.find(box => 
            clickX >= box.x && 
            clickX <= box.x + box.width &&
            clickY >= box.y && 
            clickY <= box.y + box.height
        );
        
        if (clickedBox && clickedBox.audioUrl) {
            const audio = new Audio(clickedBox.audioUrl);
            audio.play();
        } else if (!clickedBox) {
            // Start drawing new box only if not clicking an existing box
            isDrawing = true;
            startX = clickX;
            startY = clickY;
        }
    }
    
    function draw(e) {
        if (!isDrawing) return;
        
        const rect = canvas.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;
        
        // Clear the canvas and redraw all existing boxes
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawExistingBoxes();
        
        // Draw the current box
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.rect(
            startX,
            startY,
            currentX - startX,
            currentY - startY
        );
        ctx.stroke();
    }
    
    function endDrawing(e) {
        if (!isDrawing) return;
        
        const rect = canvas.getBoundingClientRect();
        const endX = e.clientX - rect.left;
        const endY = e.clientY - rect.top;
        
        // Save the box without audio first
        currentBoxIndex = boundingBoxes.length;
        boundingBoxes.push({
            x: Math.min(startX, endX),
            y: Math.min(startY, endY),
            width: Math.abs(endX - startX),
            height: Math.abs(endY - startY),
            audioUrl: null,
            audioName: null
        });
        
        isDrawing = false;
        showAudioSelection();
    }
    
    function drawExistingBoxes() {
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2;
        boundingBoxes.forEach(box => {
            ctx.beginPath();
            ctx.rect(box.x, box.y, box.width, box.height);
            ctx.stroke();
        });
    }
}

function showAudioSelection() {
    const dialog = document.getElementById('audio-selection-dialog');
    const select = document.getElementById('audio-select');
    
    // Clear existing options
    select.innerHTML = '';
    
    // Add options for each recorded audio
    recordedAudios.forEach((audio, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = audio.name;
        select.appendChild(option);
    });
    
    dialog.style.display = 'block';
}

document.getElementById('confirm-audio').addEventListener('click', () => {
    const select = document.getElementById('audio-select');
    const selectedAudio = recordedAudios[select.value];
    
    if (selectedAudio) {
        boundingBoxes[currentBoxIndex].audioUrl = selectedAudio.url;
        boundingBoxes[currentBoxIndex].audioName = selectedAudio.name;
    }
    
    document.getElementById('audio-selection-dialog').style.display = 'none';
});

document.getElementById('cancel-box').addEventListener('click', () => {
    boundingBoxes.pop(); // Remove the last box
    document.getElementById('audio-selection-dialog').style.display = 'none';
    
    // Redraw remaining boxes
    const canvas = document.getElementById('drawing-canvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawExistingBoxes();
});