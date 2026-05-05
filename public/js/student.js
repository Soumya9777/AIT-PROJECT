// Check auth
(async () => {
    const res = await fetch('/api/session', { credentials: 'same-origin' });
    const data = await res.json();
    if (!data.role || data.role !== 'student') location.href = '/';
    loadAttendancePercentage();
    loadAttendance();
})();

async function loadAttendancePercentage() {
    const res = await fetch('/api/attendance/percentage', { credentials: 'same-origin' });
    const data = await res.json();
    
    document.getElementById('overallPercentage').textContent = data.overall.percentage + '%';
    document.getElementById('overallDetails').textContent = 
        `Attended ${data.overall.attended} out of ${data.overall.total} sessions`;
    
    const subjectDiv = document.getElementById('subjectPercentages');
    if (data.bySubject.length > 0) {
        subjectDiv.innerHTML = '<h4>By Subject</h4>' + 
            data.bySubject.map(s => `
                <div class="card" style="padding:10px;margin:5px 0; display: flex; justify-content: space-between; align-items: center;">
                    <span><strong>${s.subject}</strong></span>
                    <span style="color: ${s.percentage >= 75 ? '#28a745' : '#dc3545'}; font-weight: 600;">
                        ${s.percentage}% (${s.attended}/${s.total})
                    </span>
                </div>
            `).join('');
    }
}

async function loadAttendance() {
    const res = await fetch('/api/attendance/reports', { credentials: 'same-origin' });
    const records = await res.json();
    const container = document.getElementById('attendanceList');
    
    container.innerHTML = records.length ? 
        records.map(r => `
            <div class="card" style="padding:10px;margin:5px 0">
                <strong>${r.section_name}</strong> - ${r.topic} (${r.subject})<br>
                <small>${new Date(r.timestamp).toLocaleString()}</small>
            </div>
        `).join('') : 
        '<p>No attendance records yet.</p>';
}

// Check if face data is registered on page load
(async () => {
    try {
        const res = await fetch('/api/faces', { credentials: 'same-origin' });
        const faces = await res.json();
        const currentUserRes = await fetch('/api/session', { credentials: 'same-origin' });
        const currentUser = await currentUserRes.json();
        const hasFaceData = faces.some(f => f.userId === currentUser.id);
        
        if (!hasFaceData) {
            const scanLink = document.querySelector('a[href="scan.html"]');
            if (scanLink) {
                scanLink.style.pointerEvents = 'none';
                scanLink.style.opacity = '0.5';
                scanLink.insertAdjacentHTML('afterend', 
                    '<div style="color: #dc3545; margin-top: 10px; padding: 10px; background: #f8d7da; border-radius: 8px;">' +
                    '⚠️ Face data not registered! Contact admin to register your face before marking attendance.' +
                    '</div>');
            }
        }
    } catch (err) {
        console.error('Error checking face data:', err);
    }
})();

function logout() {
    fetch('/api/logout', { credentials: 'same-origin' }).then(() => location.href = '/');
}
