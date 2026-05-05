// Check auth
(async () => {
    const res = await fetch('/api/session');
    const data = await res.json();
    if (!data.role || data.role !== 'student') location.href = '/';
    loadAttendancePercentage();
    loadAttendance();
})();

async function loadAttendancePercentage() {
    const res = await fetch('/api/attendance/percentage');
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
    const res = await fetch('/api/attendance/reports');
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

function logout() {
    fetch('/api/logout').then(() => location.href = '/');
}
