let currentSessionId = null;
let qrInterval = null;

// Load subjects and active sessions on page load
(async () => {
    const res = await fetch('/api/session', { credentials: 'same-origin' });
    const data = await res.json();
    if (!data.role || data.role !== 'teacher') location.href = '/';
    
    loadSubjects();
    loadActiveSessions();
})();

async function loadSubjects() {
    const res = await fetch('/api/subjects', { credentials: 'same-origin' });
    const subjects = await res.json();
    const select = document.getElementById('subjectSelect');
    select.innerHTML = subjects.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
}

// Create session
document.getElementById('sessionForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
        sectionName: sectionName.value,
        subject: subjectSelect.value,
        topic: topic.value,
        startTime: startTime.value,
        endTime: endTime.value
    };
    
    const res = await fetch('/api/attendance/start', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data),
        credentials: 'same-origin'
    });
    
    const result = await res.json();
    if (res.ok) {
        currentSessionId = result.sessionId;
        startQrRefresh();
        document.getElementById('sessionMsg').textContent = 'Session started!';
        document.getElementById('sessionMsg').className = 'text-success';
        document.getElementById('sessionMsg').classList.remove('hidden');
        loadActiveSessions();
    }
});

// Auto-refresh QR every 5 seconds
function startQrRefresh() {
    const qrSection = document.getElementById('qrSection');
    qrSection.classList.remove('hidden');
    
    // Clear existing interval
    if (qrInterval) clearInterval(qrInterval);
    
    // Load initial QR
    loadQr();
    
    // Refresh every 5 seconds
    qrInterval = setInterval(loadQr, 5000);
}

async function loadQr() {
    if (!currentSessionId) return;
    
    const res = await fetch(`/api/attendance/qr/${currentSessionId}`, { credentials: 'same-origin' });
    const data = await res.json();
    
    if (res.ok) {
        document.getElementById('qrImage').src = data.qrCode;
        document.getElementById('sessionInfo').innerHTML = `
            <p>Session ID: ${currentSessionId}</p>
            <p>Token expires in: ${data.expiresIn} seconds</p>
        `;
    } else {
        stopSession();
    }
}

async function stopSession() {
    if (!currentSessionId) return;
    
    await fetch('/api/attendance/stop', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({sessionId: currentSessionId}),
        credentials: 'same-origin'
    });
    
    clearInterval(qrInterval);
    qrInterval = null;
    currentSessionId = null;
    document.getElementById('qrSection').classList.add('hidden');
    loadActiveSessions();
}

async function loadActiveSessions() {
    const res = await fetch('/api/attendance/sessions/active', { credentials: 'same-origin' });
    const sessions = await res.json();
    const sessionRes = await fetch('/api/session', { credentials: 'same-origin' });
    const userData = await sessionRes.json();
    const container = document.getElementById('activeSessions');
    
    const mySessions = sessions.filter(s => s.teacher_name === userData.name);
    
    container.innerHTML = mySessions.length ? 
        mySessions.map(s => `
            <div class="card" style="padding:10px;margin:5px 0">
                <strong>${s.section_name}</strong> - ${s.topic} (${s.subject})<br>
                ${s.start_time} to ${s.end_time}
            </div>
        `).join('') : 
        '<p>No active sessions.</p>';
}

function logout() {
    fetch('/api/logout', { credentials: 'same-origin' }).then(() => location.href = '/');
}
