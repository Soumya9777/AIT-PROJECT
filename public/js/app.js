// Basic Utilities and Auth Logic

document.addEventListener('DOMContentLoaded', () => {
    // Login Form Handler
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            const errorDiv = document.getElementById('loginError');

            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const data = await res.json();

                if (res.ok) {
                    if (data.requiresPasswordChange) {
                        // Switch to Change Password form
                        document.getElementById('loginSection').classList.add('hidden');
                        document.getElementById('changePasswordSection').classList.remove('hidden');
                        document.getElementById('cpUsername').value = data.username;
                        document.getElementById('cpTempPassword').value = password;
                    } else {
                        // Redirect based on role
                        if (data.role === 'admin') window.location.href = '/admin.html';
                        else if (data.role === 'teacher') window.location.href = '/faculty.html';
                        else if (data.role === 'student') window.location.href = '/student.html';
                    }
                } else {
                    errorDiv.textContent = data.error;
                    errorDiv.classList.remove('hidden');
                }
            } catch (err) {
                errorDiv.textContent = 'Server error. Try again.';
                errorDiv.classList.remove('hidden');
            }
        });
    }

    // Change Password Form Handler
    const cpForm = document.getElementById('changePasswordForm');
    if (cpForm) {
        cpForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('cpUsername').value;
            const temporaryPassword = document.getElementById('cpTempPassword').value;
            const newPassword = document.getElementById('newPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            const cpError = document.getElementById('cpError');

            if (newPassword !== confirmPassword) {
                cpError.textContent = "Passwords do not match.";
                cpError.classList.remove('hidden');
                return;
            }

            try {
                const res = await fetch('/api/change-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, temporaryPassword, newPassword })
                });

                const data = await res.json();

                if (res.ok) {
                    // Redirect based on role
                    if (data.role === 'admin') window.location.href = '/admin.html';
                    else if (data.role === 'teacher') window.location.href = '/faculty.html';
                    else if (data.role === 'student') window.location.href = '/student.html';
                } else {
                    cpError.textContent = data.error;
                    cpError.classList.remove('hidden');
                }
            } catch (err) {
                cpError.textContent = 'Server error. Try again.';
                cpError.classList.remove('hidden');
            }
        });
    }

    // Logout Handler
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await fetch('/api/logout');
            window.location.href = '/index.html';
        });
    }

    // Session Check (if not on login page)
    if (!window.location.pathname.endsWith('index.html') && window.location.pathname !== '/') {
        checkSession();
    }
});

async function checkSession() {
    try {
        const res = await fetch('/api/session');
        if (!res.ok) {
            window.location.href = '/index.html';
        } else {
            const data = await res.json();
            const nameDisplay = document.getElementById('userNameDisplay');
            if (nameDisplay) nameDisplay.textContent = data.name;
        }
    } catch (err) {
        window.location.href = '/index.html';
    }
}
