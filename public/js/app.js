// Login form handler
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    const res = await fetch('/api/login', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({username, password}),
        credentials: 'same-origin' // Send cookies
    });
    
    const data = await res.json();
    
     if (res.ok) {
        if (data.requiresPasswordChange) {
            document.getElementById('loginSection').classList.add('hidden');
            document.getElementById('changePasswordSection').classList.remove('hidden');
            document.getElementById('cpUsername').value = data.username;
            document.getElementById('cpTempPassword').value = password; // Store temp password
        } else {
            window.location.href = data.redirect || data.role + '.html';
        }
    } else {
        document.getElementById('loginError').textContent = data.error;
        document.getElementById('loginError').classList.remove('hidden');
    }
});

// Change password handler
document.getElementById('changePasswordForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    if (newPassword !== confirmPassword) {
        document.getElementById('cpError').textContent = 'Passwords do not match';
        document.getElementById('cpError').classList.remove('hidden');
        return;
    }
    
    const res = await fetch('/api/change-password', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            username: document.getElementById('cpUsername').value,
            temporaryPassword: document.getElementById('cpTempPassword').value,
            newPassword
        }),
        credentials: 'same-origin'
    });
    
     const data = await res.json();
     
     if (res.ok) {
         window.location.href = data.redirect || data.role + '.html';
     } else {
        document.getElementById('cpError').textContent = data.error;
        document.getElementById('cpError').classList.remove('hidden');
    }
});

// Check existing session on page load
(async () => {
    try {
        const res = await fetch('/api/session', {
            credentials: 'same-origin'
        });
         const data = await res.json();
         if (data.id) {
             window.location.href = data.redirect || data.role + '.html';
         }
    } catch (err) {
        console.error('Session check failed:', err);
    }
})();
