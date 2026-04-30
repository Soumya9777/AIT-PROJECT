const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: 'attendance_secret_key_123',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set to true if using https
}));

// Middleware to check authentication
const requireAuth = (req, res, next) => {
    if (req.session.userId) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

const requireRole = (role) => {
    return (req, res, next) => {
        if (req.session.role === role) {
            next();
        } else {
            res.status(403).json({ error: 'Forbidden' });
        }
    };
};

// --- AUTH API ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        if (bcrypt.compareSync(password, user.password)) {
            if (user.is_temp_password === 1) {
                // Do NOT set session yet. Force them to change password.
                return res.json({ requiresPasswordChange: true, username: user.username });
            }
            
            req.session.userId = user.id;
            req.session.role = user.role;
            req.session.name = user.name;
            res.json({ message: 'Login successful', role: user.role, name: user.name });
        } else {
            res.status(401).json({ error: 'Invalid credentials' });
        }
    });
});

app.post('/api/change-password', (req, res) => {
    const { username, temporaryPassword, newPassword } = req.body;
    db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(401).json({ error: 'User not found' });

        if (bcrypt.compareSync(temporaryPassword, user.password)) {
            const hash = bcrypt.hashSync(newPassword, 10);
            db.run("UPDATE users SET password = ?, is_temp_password = 0 WHERE id = ?", [hash, user.id], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                // Log them in automatically after changing
                req.session.userId = user.id;
                req.session.role = user.role;
                req.session.name = user.name;
                res.json({ message: 'Password updated', role: user.role, name: user.name });
            });
        } else {
            res.status(401).json({ error: 'Invalid temporary password' });
        }
    });
});

app.get('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ message: 'Logged out' });
});

app.get('/api/session', (req, res) => {
    if (req.session.userId) {
        res.json({
            id: req.session.userId,
            username: req.session.username,
            name: req.session.name,
            role: req.session.role
        });
    } else {
        res.status(401).json({ error: 'Not logged in' });
    }
});

// --- USER MANAGEMENT API (Admin only) ---
app.post('/api/users', requireAuth, requireRole('admin'), (req, res) => {
    const { username, password, name, role } = req.body;
    const hash = bcrypt.hashSync(password, 10);
    db.run("INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)",
        [username, hash, name, role],
        function(err) {
            if (err) return res.status(400).json({ error: 'Username may already exist' });
            res.json({ id: this.lastID, message: 'User created' });
        });
});

app.get('/api/users', requireAuth, (req, res) => {
    // Admin gets all, others get specific info if needed
    db.all("SELECT id, username, name, role FROM users WHERE role != 'admin'", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/users/reset-password', requireAuth, requireRole('admin'), (req, res) => {
    const { userId, newTempPassword } = req.body;
    const hash = bcrypt.hashSync(newTempPassword, 10);
    db.run("UPDATE users SET password = ?, is_temp_password = 1 WHERE id = ?", [hash, userId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Password reset to temporary' });
    });
});

// --- FACE DATA API ---
app.post('/api/faces', requireAuth, requireRole('admin'), (req, res) => {
    const { userId, descriptor } = req.body;
    // descriptor should be an array converted to string
    db.run("INSERT INTO face_descriptors (user_id, descriptor) VALUES (?, ?)",
        [userId, JSON.stringify(descriptor)],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Face data saved' });
        });
});

app.get('/api/faces', requireAuth, (req, res) => {
    db.all("SELECT face_descriptors.user_id, users.name, face_descriptors.descriptor FROM face_descriptors JOIN users ON users.id = face_descriptors.user_id", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows.map(row => ({
            userId: row.user_id,
            name: row.name,
            descriptor: JSON.parse(row.descriptor)
        })));
    });
});

// --- ATTENDANCE API ---
app.post('/api/attendance/start', requireAuth, requireRole('faculty'), (req, res) => {
    const { subject } = req.body;
    db.run("INSERT INTO attendance_sessions (faculty_id, subject) VALUES (?, ?)",
        [req.session.userId, subject],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ sessionId: this.lastID, message: 'Session started' });
        });
});

app.post('/api/attendance/stop', requireAuth, requireRole('faculty'), (req, res) => {
    const { sessionId } = req.body;
    db.run("UPDATE attendance_sessions SET status = 'closed' WHERE id = ? AND faculty_id = ?",
        [sessionId, req.session.userId],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Session closed' });
        });
});

app.post('/api/attendance/mark', requireAuth, (req, res) => {
    const { sessionId, studentId } = req.body;
    
    // Check if already marked
    db.get("SELECT * FROM attendance_records WHERE session_id = ? AND student_id = ?", [sessionId, studentId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row) return res.status(400).json({ error: 'Attendance already marked' });
        
        db.run("INSERT INTO attendance_records (session_id, student_id) VALUES (?, ?)",
            [sessionId, studentId],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: 'Attendance marked' });
            });
    });
});

app.get('/api/attendance/reports', requireAuth, (req, res) => {
    let query = `
        SELECT r.id, s.subject, s.start_time, u.name as student_name, r.timestamp
        FROM attendance_records r
        JOIN attendance_sessions s ON r.session_id = s.id
        JOIN users u ON r.student_id = u.id
    `;
    let params = [];
    
    if (req.session.role === 'student') {
        query += " WHERE r.student_id = ?";
        params.push(req.session.userId);
    } else if (req.session.role === 'faculty') {
        query += " WHERE s.faculty_id = ?";
        params.push(req.session.userId);
    }
    
    query += " ORDER BY r.timestamp DESC";
    
    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
