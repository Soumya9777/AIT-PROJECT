// Tab management
function showTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    event.target.classList.add('active');
    
    if (tabId === 'addSubject') loadSubjects();
    if (tabId === 'addFace') loadUsersForFace();
    if (tabId === 'manageUsers') loadUsers();
}

// Logout
function logout() {
    fetch('/api/logout', { credentials: 'same-origin' }).then(() => location.href = '/');
}

// Add User
document.getElementById('addUserForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
        username: newUsername.value,
        password: newPassword.value,
        name: newName.value,
        role: newRole.value
    };
    
    const res = await fetch('/api/users', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data),
        credentials: 'same-origin'
    });
    
    const msgEl = document.getElementById('userMsg');
    if (res.ok) {
        msgEl.textContent = 'User added! Temporary password: ' + data.password;
        msgEl.className = 'text-success';
        e.target.reset();
    } else {
        msgEl.textContent = 'Error adding user';
        msgEl.className = 'text-danger';
    }
    msgEl.classList.remove('hidden');
});

// Add Subject
document.getElementById('addSubjectForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const res = await fetch('/api/subjects', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({name: subjectName.value}),
        credentials: 'same-origin'
    });
    
    const msgEl = document.getElementById('subjectMsg');
    if (res.ok) {
        msgEl.textContent = 'Subject added!';
        msgEl.className = 'text-success';
        e.target.reset();
        loadSubjects();
    } else {
        msgEl.textContent = 'Error adding subject';
        msgEl.className = 'text-danger';
    }
    msgEl.classList.remove('hidden');
});

async function loadSubjects() {
    const res = await fetch('/api/subjects', { credentials: 'same-origin' });
    const subjects = await res.json();
    const list = document.getElementById('subjectsList');
    list.innerHTML = '<h4>Available Subjects</h4>' + 
        subjects.map(s => `<div class="card" style="padding:10px;margin:5px 0">${s.name}</div>`).join('');
}

// Add Face
let faceDescriptor = null;
let detectionInterval = null;

async function loadUsersForFace() {
    const res = await fetch('/api/users/without-faces', { credentials: 'same-origin' });
    const users = await res.json();
    const select = document.getElementById('faceUserId');
    select.innerHTML = users.map(u => `<option value="${u.id}">${u.name} (${u.role})</option>`).join('');
    
    // Load face-api models
    await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
        faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
        faceapi.nets.faceLandmark68Net.loadFromUri('/models')
    ]);
    
    const video = document.getElementById('faceVideo');
    const stream = await navigator.mediaDevices.getUserMedia({video: {}});
    video.srcObject = stream;
}

function startFaceDetection() {
    const video = document.getElementById('faceVideo');
    const canvas = document.getElementById('faceCanvas');
    const captureBtn = document.getElementById('captureBtn');
    const faceStatus = document.getElementById('faceStatus');
    
    // Reduce video resolution for faster processing
    video.width = 160;
    video.height = 120;
    canvas.width = 160;
    canvas.height = 120;
    
    detectionInterval = setInterval(async () => {
        if (video.readyState !== 4) return;
        
        canvas.getContext('2d').drawImage(video, 0, 0, 160, 120);
        
        // Use faster detection with reduced options
        const detection = await faceapi.detectSingleFace(canvas, 
            new faceapi.TinyFaceDetectorOptions({ inputSize: 160 }))
            .withFaceLandmarks()
            .withFaceDescriptor();
        
        if (detection) {
            faceDescriptor = Array.from(detection.descriptor);
            captureBtn.style.display = 'inline-block';
            captureBtn.textContent = 'Face Detected! Click to Capture';
            faceStatus.textContent = 'Face detected!';
            faceStatus.className = 'text-success';
        } else {
            faceDescriptor = null;
            captureBtn.style.display = 'none';
            faceStatus.textContent = 'Position your face in front of the camera...';
            faceStatus.className = '';
        }
    }, 300); // Check every 300ms for faster response
}

function captureFace() {
    if (!faceDescriptor) {
        alert('No face detected. Position your face in the camera.');
        return;
    }
    alert('Face captured successfully!');
}

document.getElementById('addFaceForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!faceDescriptor) return alert('Capture face first!');
    
    const res = await fetch('/api/faces', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            userId: faceUserId.value,
            descriptor: faceDescriptor
        }),
        credentials: 'same-origin'
    });
    
    const msgEl = document.getElementById('faceMsg');
    if (res.ok) {
        msgEl.textContent = 'Face data saved!';
        msgEl.className = 'text-success';
        faceDescriptor = null;
    } else {
        msgEl.textContent = 'Error saving face data';
        msgEl.className = 'text-danger';
    }
    msgEl.classList.remove('hidden');
});

// Check auth
(async () => {
    const res = await fetch('/api/session', { credentials: 'same-origin' });
    const data = await res.json();
    if (!data.role || data.role !== 'admin') location.href = '/';
})();

async function loadUsers() {
    const res = await fetch('/api/users', { credentials: 'same-origin' });
    const users = await res.json();
    const list = document.getElementById('usersList');
    
    list.innerHTML = users.map(u => `
        <div class="card" style="padding:10px;margin:5px 0; display: flex; justify-content: space-between; align-items: center;">
            <div>
                <strong>${u.name}</strong> (@${u.username})<br>
                <small style="color: #666;">${u.role}</small>
            </div>
            <div style="display: flex; gap: 8px;">
                <button onclick="resetPassword(${u.id})" class="btn-secondary" style="padding: 6px 12px; font-size: 12px;">Reset PW</button>
                <button onclick="deleteUser(${u.id}, '${u.name}')" class="btn-secondary" style="padding: 6px 12px; font-size: 12px; background: #dc3545; color: white;">Delete</button>
            </div>
        </div>
    `).join('');
}

async function resetPassword(userId) {
    const newTempPassword = prompt('Enter new temporary password:');
    if (!newTempPassword) return;
    
    const res = await fetch('/api/users/reset-password', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({userId, newTempPassword}),
        credentials: 'same-origin'
    });
    
    if (res.ok) {
        alert(`Password reset! New temporary password: ${newTempPassword}`);
        loadUsers();
    } else {
        alert('Error resetting password');
    }
}

async function deleteUser(userId, userName) {
    if (!confirm(`Delete user "${userName}"? This cannot be undone.`)) return;
    
    const res = await fetch(`/api/users/${userId}`, {
        method: 'DELETE',
        credentials: 'same-origin'
    });
    
    if (res.ok) {
        alert('User deleted!');
        loadUsers();
    } else {
        alert('Error deleting user');
    }
}
