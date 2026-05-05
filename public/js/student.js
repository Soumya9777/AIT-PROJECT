// Check auth and face verification
(async () => {
    const res = await fetch('/api/session', { credentials: 'same-origin' });
    const data = await res.json();
    if (!data.role || data.role !== 'student') location.href = '/';
    
    if (!data.faceVerified) {
        location.href = '/face-verify.html';
        return;
    }
    
    // Update welcome message
    if (data.name) {
        document.getElementById('welcomeHeader').innerHTML = `
            <img src="images/college-logo.jpg" alt="Logo" class="header-logo">
            Welcome back, ${data.name}!
        `;
    }
    
    loadAttendancePercentage();
    loadAttendance();
})();

async function loadAttendancePercentage() {
    const res = await fetch('/api/attendance/percentage', { credentials: 'same-origin' });
    const data = await res.json();
    
    document.getElementById('overallPercentage').textContent = data.overall.percentage + '%';
    document.getElementById('overallDetails').textContent = 
        `Attended ${data.overall.attended} out of ${data.overall.total} sessions`;
    
    // Render chart
    renderChart(data.bySubject);
    
    const subjectDiv = document.getElementById('subjectPercentages');
    if (data.bySubject.length > 0) {
        subjectDiv.innerHTML = data.bySubject.map(s => `
            <div class="list-item">
                <div>
                    <strong style="font-size: 15px;">${s.subject}</strong><br>
                    <span style="color: var(--gray-500); font-size: 13px;">
                        ${s.attended} / ${s.total} sessions
                    </span>
                </div>
                <span class="badge ${s.percentage >= 75 ? 'badge-success' : 'badge-danger'}">
                    ${s.percentage}%
                </span>
            </div>
        `).join('');
    } else {
        subjectDiv.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--gray-400);">
                <div style="font-size: 48px; margin-bottom: 12px;">📭</div>
                <p>No attendance records yet</p>
            </div>
        `;
    }
}

async function loadAttendance() {
    const res = await fetch('/api/attendance/reports', { credentials: 'same-origin' });
    const records = await res.json();
    const container = document.getElementById('attendanceList');
    
    if (records.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--gray-400);">
                <div style="font-size: 48px; margin-bottom: 12px;">📋</div>
                <p>No attendance records yet</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = records.map(r => `
        <div class="list-item">
            <div>
                <strong style="font-size: 15px;">${r.section_name}</strong><br>
                <span style="color: var(--gray-600);">${r.topic}</span>
                <span class="badge badge-success" style="margin-left: 8px;">${r.subject}</span><br>
                <small style="color: var(--gray-400); font-size: 13px;">
                    🕐 ${new Date(r.timestamp).toLocaleString()}
                </small>
            </div>
        </div>
    `).join('');
}

function renderChart(subjects) {
    const chartDiv = document.getElementById('attendanceChart');
    
    if (!subjects || subjects.length === 0) {
        chartDiv.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--gray-400);">
                <div style="font-size: 48px; margin-bottom: 12px;">📊</div>
                <p>No data to display</p>
            </div>
        `;
        return;
    }
    
    const maxPercentage = 100;
    
    chartDiv.innerHTML = subjects.map(s => `
        <div style="margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-size: 14px; font-weight: 600; color: var(--dark);">${s.subject}</span>
                <span style="font-size: 13px; color: var(--gray-500);">${s.percentage}%</span>
            </div>
            <div style="width: 100%; height: 24px; background: var(--gray-100); border-radius: 12px; overflow: hidden;">
                <div style="
                    width: ${s.percentage}%;
                    height: 100%;
                    background: linear-gradient(90deg, ${s.percentage >= 75 ? 'var(--success)' : 'var(--danger)'}, ${s.percentage >= 75 ? '#34d399' : '#f87171'});
                    border-radius: 12px;
                    transition: width 1s ease-out;
                    display: flex;
                    align-items: center;
                    justify-content: flex-end;
                    padding-right: 8px;
                    font-size: 12px;
                    font-weight: 600;
                    color: white;
                    min-width: 40px;
                ">${s.percentage >= 10 ? s.percentage + '%' : ''}</div>
            </div>
        </div>
    `).join('');
}

function logout() {
    fetch('/api/logout', { credentials: 'same-origin' }).then(() => location.href = '/');
}
