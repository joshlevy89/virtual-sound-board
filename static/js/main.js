let isDrawing = false;
let startX, startY;
let boundingBoxes = [];
let mediaRecorder = null;
let audioChunks = [];
let recordedAudios = [];
let isRecording = false;
let currentBoxIndex = null;

// Add touch detection
const isTouchDevice = ('ontouchstart' in window) || 
                     (navigator.maxTouchPoints > 0) ||
                     (navigator.msMaxTouchPoints > 0);

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
            // Reset mediaRecorder and chunks before starting new recording
            mediaRecorder = null;
            audioChunks = [];

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log('Got media stream:', stream);
            
            // Try different MIME types for better mobile compatibility
            const mimeTypes = [
                'audio/webm;codecs=opus',
                'audio/webm',
                'audio/mp4',
                'audio/ogg;codecs=opus'
            ];
            
            let options;
            for (const mimeType of mimeTypes) {
                if (MediaRecorder.isTypeSupported(mimeType)) {
                    options = { mimeType };
                    console.log('Using MIME type:', mimeType);
                    break;
                }
            }
            
            mediaRecorder = new MediaRecorder(stream, options);
            console.log('MediaRecorder created:', mediaRecorder);
            
            // Set up all event handlers before starting
            mediaRecorder.ondataavailable = (event) => {
                console.log('Data available event, size:', event.data.size);
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                console.log('MediaRecorder stopped, chunks:', audioChunks);
                
                const audioBlob = new Blob(audioChunks, { type: options.mimeType || 'audio/webm' });
                console.log('Created audio blob, size:', audioBlob.size);
                
                const audioUrl = URL.createObjectURL(audioBlob);
                const audioName = nameInput.value.trim();
                
                // Add to recordedAudios array
                recordedAudios.push({
                    name: audioName,
                    url: audioUrl,
                    blob: audioBlob
                });
                
                // Create audio element
                const audioElement = document.createElement('div');
                audioElement.className = 'audio-item';
                
                const label = document.createElement('span');
                label.textContent = audioName;
                
                const audio = document.createElement('audio');
                audio.controls = true;
                audio.src = audioUrl;
                
                audio.onloadeddata = () => console.log('Audio loaded successfully');
                audio.onerror = (e) => console.error('Audio error:', e);
                
                audioElement.appendChild(label);
                audioElement.appendChild(audio);
                
                const audioList = document.getElementById('audio-list');
                audioList.appendChild(audioElement);
                console.log('Added audio element to list');
                
                // Clean up
                stream.getTracks().forEach(track => track.stop());
                nameInput.value = '';
            };

            mediaRecorder.onerror = (event) => {
                console.error('MediaRecorder error:', event);
                alert('Recording error: ' + event.error);
            };

            // Start recording
            mediaRecorder.start();
            console.log('MediaRecorder started');
            isRecording = true;
            recordButton.textContent = 'Stop';
            statusElement.textContent = 'Recording...';
            
        } catch (err) {
            console.error('MediaRecorder setup error:', err);
            alert(`Recording error: ${err.message}`);
        }
    } else {
        console.log('Stopping recording...');
        // Only try to stop if mediaRecorder exists and is recording
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
            console.log('MediaRecorder stop called');
        }
        recordButton.textContent = 'Record';
        statusElement.textContent = '';
        isRecording = false;
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        
        // Stop all tracks on the active stream
        if (mediaRecorder.stream) {
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
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
    const ctx = canvas.getContext('2d');
    
    // Make canvas same size as image
    canvas.width = img.width;
    canvas.height = img.height;
    
    // Prevent default touch actions on canvas (prevents scrolling while drawing)
    canvas.style.touchAction = 'none';
    
    if (isTouchDevice) {
        canvas.addEventListener('touchstart', handleStart, { passive: false });
        canvas.addEventListener('touchmove', handleMove, { passive: false });
        canvas.addEventListener('touchend', handleEnd, { passive: false });
        canvas.addEventListener('touchcancel', handleEnd, { passive: false });
    } else {
        canvas.addEventListener('mousedown', handleMouseDown);
        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('mouseup', handleMouseUp);
        canvas.addEventListener('mouseout', endDrawing);
    }

    function handleStart(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        
        // Calculate touch position relative to canvas
        startX = (touch.clientX - rect.left) * (canvas.width / rect.width);
        startY = (touch.clientY - rect.top) * (canvas.height / rect.height);
        
        // Check if touch is inside any existing box
        const touchedBox = boundingBoxes.find(box => 
            startX >= box.x && 
            startX <= box.x + box.width &&
            startY >= box.y && 
            startY <= box.y + box.height
        );
        
        if (touchedBox && touchedBox.audioUrl) {
            // Play audio if box has associated audio
            const audio = new Audio(touchedBox.audioUrl);
            audio.play();
        } else {
            // Start drawing new box
            isDrawing = true;
            console.log('Drawing started at:', startX, startY);
        }
    }

    function handleMove(e) {
        if (!isDrawing) return;
        e.preventDefault();
        
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        
        // Calculate current touch position
        const currentX = (touch.clientX - rect.left) * (canvas.width / rect.width);
        const currentY = (touch.clientY - rect.top) * (canvas.height / rect.height);
        
        // Clear canvas and redraw
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawExistingBoxes();
        
        // Draw current box
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
        
        console.log('Drawing box:', startX, startY, currentX - startX, currentY - startY);
    }

    function handleEnd(e) {
        if (!isDrawing) return;
        e.preventDefault();
        
        const touch = e.changedTouches[0];
        const rect = canvas.getBoundingClientRect();
        
        // Calculate end position
        const endX = (touch.clientX - rect.left) * (canvas.width / rect.width);
        const endY = (touch.clientY - rect.top) * (canvas.height / rect.height);
        
        // Only create box if it has some size
        const width = Math.abs(endX - startX);
        const height = Math.abs(endY - startY);
        
        if (width > 5 && height > 5) {  // Minimum size threshold
            currentBoxIndex = boundingBoxes.length;
            boundingBoxes.push({
                x: Math.min(startX, endX),
                y: Math.min(startY, endY),
                width: width,
                height: height,
                audioUrl: null,
                audioName: null
            });
            
            console.log('Box created:', boundingBoxes[currentBoxIndex]);
            showAudioSelection();
        } else {
            // If box is too small, just clear it
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawExistingBoxes();
        }
        
        isDrawing = false;
    }

    function drawExistingBoxes() {
        boundingBoxes.forEach(box => {
            ctx.strokeStyle = 'red';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.rect(box.x, box.y, box.width, box.height);
            ctx.stroke();
        });
    }

    function handleMouseDown(e) {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        
        // Calculate mouse position relative to canvas
        startX = (e.clientX - rect.left) * (canvas.width / rect.width);
        startY = (e.clientY - rect.top) * (canvas.height / rect.height);
        
        // Check if click is inside any existing box
        const clickedBox = boundingBoxes.find(box => 
            startX >= box.x && 
            startX <= box.x + box.width &&
            startY >= box.y && 
            startY <= box.y + box.height
        );
        
        if (clickedBox && clickedBox.audioUrl) {
            // Play audio if box has associated audio
            const audio = new Audio(clickedBox.audioUrl);
            audio.play();
        } else {
            // Start drawing new box
            isDrawing = true;
            console.log('Drawing started at:', startX, startY);
        }
    }

    function handleMouseMove(e) {
        if (!isDrawing) return;
        e.preventDefault();
        
        const rect = canvas.getBoundingClientRect();
        
        // Calculate current mouse position
        const currentX = (e.clientX - rect.left) * (canvas.width / rect.width);
        const currentY = (e.clientY - rect.top) * (canvas.height / rect.height);
        
        // Clear canvas and redraw
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawExistingBoxes();
        
        // Draw current box
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
        
        console.log('Drawing box:', startX, startY, currentX - startX, currentY - startY);
    }

    function handleMouseUp(e) {
        if (!isDrawing) return;
        e.preventDefault();
        
        const rect = canvas.getBoundingClientRect();
        
        // Calculate end position
        const endX = (e.clientX - rect.left) * (canvas.width / rect.width);
        const endY = (e.clientY - rect.top) * (canvas.height / rect.height);
        
        // Only create box if it has some size
        const width = Math.abs(endX - startX);
        const height = Math.abs(endY - startY);
        
        if (width > 5 && height > 5) {  // Minimum size threshold
            currentBoxIndex = boundingBoxes.length;
            boundingBoxes.push({
                x: Math.min(startX, endX),
                y: Math.min(startY, endY),
                width: width,
                height: height,
                audioUrl: null,
                audioName: null
            });
            
            console.log('Box created:', boundingBoxes[currentBoxIndex]);
            showAudioSelection();
        } else {
            // If box is too small, just clear it
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawExistingBoxes();
        }
        
        isDrawing = false;
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

// Add this helper function to check browser compatibility
function checkBrowserCompatibility() {
    console.log('MediaRecorder supported:', !!window.MediaRecorder);
    console.log('getUserMedia supported:', !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia));
    if (window.MediaRecorder) {
        console.log('Supported MIME types:');
        ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].forEach(mimeType => {
            console.log(`${mimeType}: ${MediaRecorder.isTypeSupported(mimeType)}`);
        });
    }
}

// Call this when the page loads
document.addEventListener('DOMContentLoaded', checkBrowserCompatibility);

// Add this helper function to display the audio list
function updateAudioList() {
    const audioList = document.getElementById('audio-list');
    audioList.innerHTML = ''; // Clear current list
    
    recordedAudios.forEach((audio, index) => {
        const audioElement = document.createElement('div');
        audioElement.className = 'audio-item';
        
        const label = document.createElement('span');
        label.textContent = audio.name;
        
        const audioPlayer = document.createElement('audio');
        audioPlayer.controls = true;
        audioPlayer.src = audio.url;
        
        audioElement.appendChild(label);
        audioElement.appendChild(audioPlayer);
        audioList.appendChild(audioElement);
    });
}

// Add some basic styles to make sure the audio list is visible
document.head.insertAdjacentHTML('beforeend', `
    <style>
        .audio-item {
            margin: 10px 0;
            padding: 10px;
            background: #f5f5f5;
            border-radius: 4px;
        }
        .audio-item span {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
        }
        #audio-list {
            margin-top: 20px;
        }
    </style>
`);

// Add this CSS to ensure the canvas is properly sized on mobile
document.head.insertAdjacentHTML('beforeend', `
    <style>
        #drawing-canvas {
            touch-action: none;
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
        }
        
        .image-container {
            position: relative;
            width: 100%;
            height: auto;
        }
        
        #uploaded-image {
            width: 100%;
            height: auto;
            display: block;
        }
    </style>
`);

document.getElementById('choose-file-btn').addEventListener('click', () => {
    document.getElementById('image-input').click();
});

document.getElementById('image-input').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = document.getElementById('uploaded-image');
            img.src = e.target.result;
            img.style.display = 'block';
            document.getElementById('choose-file-btn').style.display = 'none';
            
            // Set up canvas after image loads
            img.onload = function() {
                setupCanvas(img);
            };
        };
        reader.readAsDataURL(file);
    }
});