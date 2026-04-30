document.addEventListener('DOMContentLoaded', () => {
    async function loadMyReports() {
        const res = await fetch('/api/attendance/reports');
        if (res.ok) {
            const data = await res.json();
            const tbody = document.querySelector('#reportsTable tbody');
            tbody.innerHTML = '';
            
            if (data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">No attendance records found yet.</td></tr>';
                return;
            }

            data.forEach(r => {
                const time = new Date(r.timestamp).toLocaleString();
                tbody.innerHTML += `
                    <tr>
                        <td><strong>${r.subject}</strong></td>
                        <td>${time}</td>
                        <td><span style="color: var(--success);">✔ Present</span></td>
                    </tr>
                `;
            });
        }
    }

    loadMyReports();
});
