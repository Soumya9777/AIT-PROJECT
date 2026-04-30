document.addEventListener('DOMContentLoaded', () => {
    
    const startForm = document.getElementById('startSessionForm');
    if (startForm) {
        startForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const subject = document.getElementById('subject').value;

            const res = await fetch('/api/attendance/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subject })
            });

            if (res.ok) {
                const data = await res.json();
                // Redirect to the live kiosk page with the session ID
                window.location.href = `/attendance.html?session=${data.sessionId}`;
            } else {
                alert('Failed to start session');
            }
        });
    }

    async function loadReports() {
        const res = await fetch('/api/attendance/reports');
        if (res.ok) {
            const data = await res.json();
            const tbody = document.querySelector('#reportsTable tbody');
            tbody.innerHTML = '';
            
            if (data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No attendance records found.</td></tr>';
                return;
            }

            data.forEach(r => {
                const time = new Date(r.timestamp).toLocaleString();
                tbody.innerHTML += `
                    <tr>
                        <td>${r.id}</td>
                        <td><strong>${r.student_name}</strong></td>
                        <td>${r.subject}</td>
                        <td>${time}</td>
                    </tr>
                `;
            });
        }
    }

    loadReports();
});
