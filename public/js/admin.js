document.addEventListener('DOMContentLoaded', async () => {
    // 1. Load Models for Face API
    const faceMsg = document.getElementById('faceMsg');
    try {
        faceMsg.textContent = 'Loading AI Models...';
        await faceapi.nets.ssdMobilenetv1.loadFromUri('/models');
        await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
        await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
        faceMsg.textContent = 'Models Loaded. Ready.';
        faceMsg.style.color = 'var(--success)';
    } catch (e) {
        faceMsg.textContent = 'Error loading models.';
        faceMsg.style.color = 'var(--danger)';
        console.error(e);
    }

    // 2. Fetch Users for Dropdown and Table
    async function loadUsers() {
        const res = await fetch('/api/users');
        const users = await res.json();
        
        const select = document.getElementById('userSelect');
        if (select) {
            select.innerHTML = '<option value="">Select a user...</option>';
            users.forEach(u => {
                select.innerHTML += `<option value="${u.id}">${u.name} (${u.role}) - ${u.username}</option>`;
            });
        }

        const tbody = document.querySelector('#usersTable tbody');
        if (tbody) {
            tbody.innerHTML = '';
            users.forEach((u, index) => {
                const rowClass = index % 2 === 0 ? 'row-light' : 'row-dark';
                tbody.innerHTML += `
                    <tr class="${rowClass}">
                        <td>${u.id}</td>
                        <td>${u.name}</td>
                        <td>${u.username}</td>
                        <td>${u.role}</td>
                        <td><button class="btn-secondary" onclick="resetPassword(${u.id}, '${u.username}')">Reset Password</button></td>
                    </tr>
                `;
            });
        }
    }
    loadUsers();

    // Global reset password function
    window.resetPassword = async function(userId, username) {
        const newTempPassword = prompt(`Enter new temporary password for ${username}:`);
        if (!newTempPassword) return;

        const res = await fetch('/api/users/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, newTempPassword })
        });
        const data = await res.json();
        if (res.ok) {
            alert('Password reset successfully. The user must change it on their next login.');
        } else {
            alert('Failed to reset password: ' + data.error);
        }
    };

    // 3. Add User Handler
    document.getElementById('addUserForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('addName').value;
        const username = document.getElementById('addUsername').value;
        const password = document.getElementById('addPassword').value;
        const role = document.getElementById('addRole').value;
        const msgDiv = document.getElementById('addMsg');

        const res = await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, username, password, role })
        });
        
        const data = await res.json();
        if (res.ok) {
            msgDiv.textContent = 'User created successfully!';
            msgDiv.style.color = 'var(--success)';
            document.getElementById('addUserForm').reset();
            loadUsers(); // refresh dropdown
        } else {
            msgDiv.textContent = data.error;
            msgDiv.style.color = 'var(--danger)';
        }
    });

    // 4. Face Registration Handler
    const video = document.getElementById('video');
    const startBtn = document.getElementById('startCamBtn');
    const captureBtn = document.getElementById('captureBtn');
    const camContainer = document.getElementById('camContainer');
    let stream = null;

    startBtn.addEventListener('click', async () => {
        if (!stream) {
            stream = await navigator.mediaDevices.getUserMedia({ video: true });
            video.srcObject = stream;
            camContainer.classList.remove('hidden');
            captureBtn.classList.remove('hidden');
            startBtn.textContent = 'Stop Camera';
        } else {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
            camContainer.classList.add('hidden');
            captureBtn.classList.add('hidden');
            startBtn.textContent = 'Start Camera';
        }
    });

    captureBtn.addEventListener('click', async () => {
        const userId = document.getElementById('userSelect').value;
        if (!userId) {
            faceMsg.textContent = 'Please select a user first.';
            faceMsg.style.color = 'var(--danger)';
            return;
        }

        faceMsg.textContent = 'Detecting face... Please wait.';
        faceMsg.style.color = 'white';

        const detection = await faceapi.detectSingleFace(video).withFaceLandmarks().withFaceDescriptor();
        
        if (!detection) {
            faceMsg.textContent = 'No face detected. Please look clearly at the camera.';
            faceMsg.style.color = 'var(--danger)';
            return;
        }

        // Send descriptor to server
        const descriptor = Array.from(detection.descriptor); // Convert Float32Array to normal array
        
        const res = await fetch('/api/faces', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, descriptor })
        });

        if (res.ok) {
            faceMsg.textContent = 'Face registered successfully!';
            faceMsg.style.color = 'var(--success)';
        } else {
            const data = await res.json();
            faceMsg.textContent = data.error || 'Failed to save face.';
            faceMsg.style.color = 'var(--danger)';
        }
    });
});
