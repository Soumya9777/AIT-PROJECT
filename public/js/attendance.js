document.addEventListener('DOMContentLoaded', async () => {
    // Check auth, but `app.js` already does. We need session ID from URL.
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session');

    if (!sessionId) {
        alert('No active session ID provided.');
        window.location.href = '/faculty.html';
        return;
    }

    const video = document.getElementById('video');
    const overlay = document.getElementById('overlay');
    const statusMsg = document.getElementById('statusMsg');
    const scanLog = document.getElementById('scanLog');
    const emptyLogMsg = document.getElementById('emptyLogMsg');
    
    let faceMatcher = null;
    const markedStudents = new Set();

    // 1. Load Models
    statusMsg.textContent = 'Loading AI Models...';
    await faceapi.nets.ssdMobilenetv1.loadFromUri('/models');
    await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
    await faceapi.nets.faceRecognitionNet.loadFromUri('/models');

    // 2. Fetch Face Descriptors
    statusMsg.textContent = 'Loading Student Face Data...';
    try {
        const res = await fetch('/api/faces');
        const faceData = await res.json();
        
        if (faceData.length === 0) {
            statusMsg.textContent = 'Warning: No registered faces found in database.';
            statusMsg.style.color = 'var(--warning)';
        } else {
            const labeledDescriptors = faceData.map(fd => {
                // Convert array back to Float32Array
                const descriptorArray = new Float32Array(fd.descriptor);
                // The label is a string containing ID and Name e.g., "12|John Doe"
                return new faceapi.LabeledFaceDescriptors(`${fd.userId}|${fd.name}`, [descriptorArray]);
            });
            faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6); // 0.6 is max descriptor distance
            statusMsg.textContent = 'System Ready. Step up to the camera.';
            statusMsg.style.color = 'var(--success)';
        }
    } catch (err) {
        statusMsg.textContent = 'Error loading face data.';
        console.error(err);
    }

    // 3. Start Camera
    let stream;
    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: {} });
        video.srcObject = stream;
    } catch (err) {
        statusMsg.textContent = 'Webcam access denied or unavailable.';
        return;
    }

    // 4. Live Recognition Loop
    video.addEventListener('play', () => {
        const displaySize = { width: video.videoWidth, height: video.videoHeight };
        faceapi.matchDimensions(overlay, displaySize);

        setInterval(async () => {
            if (!faceMatcher) return;

            const detections = await faceapi.detectAllFaces(video)
                .withFaceLandmarks()
                .withFaceDescriptors();

            const resizedDetections = faceapi.resizeResults(detections, displaySize);
            
            // Clear previous drawings
            overlay.getContext('2d').clearRect(0, 0, overlay.width, overlay.height);
            faceapi.draw.drawDetections(overlay, resizedDetections);

            const results = resizedDetections.map(d => faceMatcher.findBestMatch(d.descriptor));

            results.forEach((result, i) => {
                const box = resizedDetections[i].detection.box;
                const drawBox = new faceapi.draw.DrawBox(box, { label: result.toString() });
                drawBox.draw(overlay);

                // If a match is found and not "unknown"
                if (result.label !== 'unknown') {
                    const [studentId, studentName] = result.label.split('|');
                    
                    if (!markedStudents.has(studentId)) {
                        markAttendance(studentId, studentName);
                    }
                }
            });

        }, 500); // Check every 500ms
    });

    // 5. API Call to Mark Attendance
    async function markAttendance(studentId, studentName) {
        // Prevent multiple simultaneous calls for the same student
        markedStudents.add(studentId); 

        try {
            const res = await fetch('/api/attendance/mark', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId, studentId })
            });

            if (res.ok) {
                // Add to UI log
                if (emptyLogMsg) emptyLogMsg.style.display = 'none';
                
                const time = new Date().toLocaleTimeString();
                const logHTML = `
                    <div class="log-entry">
                        <div class="avatar">${studentName.charAt(0).toUpperCase()}</div>
                        <div>
                            <div style="font-weight: 600;">${studentName}</div>
                            <div style="font-size: 0.85rem; color: var(--success);">✔ Marked Present at ${time}</div>
                        </div>
                    </div>
                `;
                scanLog.insertAdjacentHTML('afterbegin', logHTML);
                
            } else {
                // If it failed (maybe already marked in DB), we might want to let them try again later
                // But for now we just leave them in markedStudents to prevent spam
                const data = await res.json();
                console.log(`Failed to mark ${studentName}:`, data.error);
            }
        } catch (err) {
            console.error('API Error marking attendance:', err);
            markedStudents.delete(studentId); // Let them try again
        }
    }

    // 6. End Session
    document.getElementById('endSessionBtn').addEventListener('click', async () => {
        if (confirm("Are you sure you want to close this attendance session?")) {
            await fetch('/api/attendance/stop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId })
            });
            
            if (stream) stream.getTracks().forEach(track => track.stop());
            window.location.href = '/faculty.html';
        }
    });

    // Adjust canvas size when video resizes
    window.addEventListener('resize', () => {
        if (video.videoWidth) {
            faceapi.matchDimensions(overlay, { width: video.videoWidth, height: video.videoHeight });
        }
    });
});
