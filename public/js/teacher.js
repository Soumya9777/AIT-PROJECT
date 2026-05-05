let currentSessionId = null;
let qrInterval = null;
let currentUser = null;

// Load data on page load
(async () => {
    const res = await fetch('/api/session', { credentials: 'same-origin' });
    currentUser = await res.json();
    if (!currentUser.role || currentUser.role !== 'teacher') location.href = '/';
    
    // Update header with user name
    document.querySelector('#welcomeHeader').innerHTML = `
        <img src="images/college-logo.jpg" alt="Logo" class="header-logo">
        Welcome, ${currentUser.name}
    `;
    
    loadSubjects();
    loadSections();
    loadActiveSessions();
    loadStats();
})();

async function loadStats() {
    // Load subjects count
    const subjectsRes = await fetch('/api/subjects', { credentials: 'same-origin' });
    const subjects = await subjectsRes.json();
    document.getElementById('subjectCount').textContent = subjects.length;
    
    // Load active sessions count
    const sessionsRes = await fetch('/api/attendance/sessions/active', { credentials: 'same-origin' });
    const sessions = await sessionsRes.json();
    const mySessions = sessions.filter(s => s.teacher_name === currentUser.name);
    document.getElementById('activeSessionCount').textContent = mySessions.length;
    
    // Load student count
    const usersRes = await fetch('/api/users', { credentials: 'same-origin' });
    const users = await usersRes.json();
    const studentCount = users.filter(u => u.role === 'student').length;
    document.getElementById('studentCount').textContent = studentCount;
}

async function loadSubjects() {
    const res = await fetch('/api/subjects', { credentials: 'same-origin' });
    const subjects = await res.json();
    const select = document.getElementById('subjectSelect');
    select.innerHTML = '<option value="">Select Subject</option>' + 
        subjects.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
}

async function loadSections() {
    const res = await fetch('/api/sections', { credentials: 'same-origin' });
    const sections = await res.json();
    const select = document.getElementById('sectionSelect');
    select.innerHTML = '<option value="">Select Section</option>' + 
        sections.map(s => `<option value="${s.name}">${s.name} ${s.description ? '(' + s.description + ')' : ''}</option>`).join('');
}

// Create session
document.getElementById('sessionForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const btn = e.target.querySelector('button[type="submit"]');
    btn.classList.add('loading');
    btn.disabled = true;
    
    const data = {
        sectionName: sectionSelect.value,
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
    
    btn.classList.remove('loading');
    btn.disabled = false;
    
    const result = await res.json();
    if (res.ok) {
        currentSessionId = result.sessionId;
        startQrRefresh();
        document.getElementById('sessionMsg').textContent = 'Session started successfully!';
        document.getElementById('sessionMsg').className = 'text-success';
        document.getElementById('sessionMsg').classList.remove('hidden');
        loadActiveSessions();
        loadStats();
    }
});

// Auto-refresh QR every 5 seconds
function startQrRefresh() {
    const qrSection = document.getElementById('qrSection');
    qrSection.classList.remove('hidden');
    
    if (qrInterval) clearInterval(qrInterval);
    
    loadQr();
    qrInterval = setInterval(loadQr, 5000);
}

async function loadQr() {
    if (!currentSessionId) return;
    
    const res = await fetch(`/api/attendance/qr/${currentSessionId}`, { credentials: 'same-origin' });
    const data = await res.json();
    
    if (res.ok) {
        document.getElementById('qrImage').src = data.qrCode;
        document.getElementById('sessionInfo').innerHTML = `
            <div style="display: flex; justify-content: center; gap: 24px; margin-top: 16px;">
                <div>
                    <div style="font-size: 24px; font-weight: 700; color: var(--primary);">${currentSessionId}</div>
                    <div style="font-size: 13px; color: var(--gray-500);">Session ID</div>
                </div>
                <div>
                    <div style="font-size: 24px; font-weight: 700; color: var(--warning);">${data.expiresIn}s</div>
                    <div style="font-size: 13px; color: var(--gray-500);">Refreshes in</div>
                </div>
            </div>
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
    loadStats();
}

async function loadActiveSessions() {
    const res = await fetch('/api/attendance/sessions/active', { credentials: 'same-origin' });
    const sessions = await res.json();
    const container = document.getElementById('activeSessions');
    
    const mySessions = sessions.filter(s => s.teacher_name === currentUser.name);
    
    if (mySessions.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--gray-400);">
                <div style="font-size: 48px; margin-bottom: 12px;">📭</div>
                <p>No active sessions</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = mySessions.map(s => `
        <div class="list-item">
            <div>
                <strong style="font-size: 16px;">${s.section_name}</strong><br>
                <span style="color: var(--gray-500); font-size: 14px;">
                    ${s.topic} • ${s.subject}
                </span><br>
                <span style="color: var(--gray-400); font-size: 13px;">
                    🕐 ${s.start_time} - ${s.end_time}
                </span>
            </div>
            <span class="badge badge-success">Active</span>
        </div>
    `).join('');
}

function logout() {
    fetch('/api/logout', { credentials: 'same-origin' }).then(() => location.href = '/');
}
