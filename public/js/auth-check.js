// Auto-logout and session management
let sessionCheckInterval;
let warningShown = false;

function startSessionCheck() {
    // Check session every 60 seconds
    sessionCheckInterval = setInterval(checkSession, 60000);
    checkSession(); // Initial check
}

async function checkSession() {
    try {
        const res = await fetch('/api/session', { credentials: 'same-origin' });
        const data = await res.json();
        
        if (!data.id) {
            // Session expired
            clearInterval(sessionCheckInterval);
            if (!window.location.href.includes('/')) {
                alert('Your session has expired. Please login again.');
                window.location.href = '/';
            }
            return;
        }
        
        // Get session timeout from settings
        const settings = JSON.parse(localStorage.getItem('ait-settings') || '{}');
        const timeout = (settings.sessionTimeout || 60) * 60000; // Convert to milliseconds
        
        // If we have session creation time, check against timeout
        // For now, we'll just verify the session exists
        
    } catch (err) {
        console.error('Session check failed:', err);
    }
}

// Start session check on pages that need auth
if (!window.location.pathname.endsWith('index.html') && window.location.pathname !== '/') {
    // Wait for DOM to load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startSessionCheck);
    } else {
        startSessionCheck();
    }
}

// Warn user before closing if they have unsaved changes
window.addEventListener('beforeunload', (e) => {
    const forms = document.querySelectorAll('form');
    let hasUnsaved = false;
    
    forms.forEach(form => {
        const inputs = form.querySelectorAll('input, textarea, select');
        inputs.forEach(input => {
            if (input.value && input.type !== 'hidden') {
                hasUnsaved = true;
            }
        });
    });
    
    if (hasUnsaved) {
        e.preventDefault();
        e.returnValue = '';
    }
});
