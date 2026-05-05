const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./database');
const crypto = require('crypto');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Static files FIRST (before API routes)
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: 'attendance_secret_key_123',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    },
    proxy: true // Trust Render's reverse proxy
}));

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

function generateSessionToken() {
    return crypto.randomBytes(16).toString('hex');
}

function faceDistance(desc1, desc2) {
    let sum = 0;
    for (let i = 0; i < desc1.length; i++) {
        sum += Math.pow(desc1[i] - desc2[i], 2);
    }
    return Math.sqrt(sum);
}

// ============ AUTH API ============

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        if (bcrypt.compareSync(password, user.password)) {
            if (user.is_temp_password === 1) {
                return res.json({ requiresPasswordChange: true, username: user.username });
            }
            
            req.session.userId = user.id;
            req.session.role = user.role;
            req.session.name = user.name;
            req.session.faceVerified = false; // Reset face verification flag
            
            // Students must verify face first, others go directly
            const roleToPage = {
                'admin': 'admin.html',
                'teacher': 'teacher.html',
                'student': 'face-verify.html'  // Force face verification for students
            };
            
            res.json({ message: 'Login successful', role: user.role, name: user.name, redirect: roleToPage[user.role] });
        } else {
            res.status(401).json({ error: 'Invalid credentials' });
        }
    });
});

// Face verification endpoint - sets flag after successful face match
app.post('/api/face-verify', requireAuth, (req, res) => {
    if (req.session.role !== 'student') {
        return res.status(403).json({ error: 'Only students need face verification' });
    }
    
    req.session.faceVerified = true;
    res.json({ message: 'Face verified' });
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
    req.session.destroy((err) => {
        if (err) return res.status(500).json({ error: 'Logout failed' });
        res.json({ message: 'Logged out' });
    });
});

app.get('/api/session', (req, res) => {
    if (req.session.userId) {
        res.json({
            id: req.session.userId,
            username: req.session.username,
            name: req.session.name,
            role: req.session.role,
            faceVerified: req.session.faceVerified || false
        });
    } else {
        res.status(401).json({ error: 'Not logged in' });
    }
});

// ============ USER MANAGEMENT API ============

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
    db.all("SELECT id, username, name, role FROM users", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/users/reset-password', requireAuth, requireRole('admin'), (req, res) => {
    const { userId, newTempPassword } = req.body;
    const hash = bcrypt.hashSync(newTempPassword, 10);
    db.run("UPDATE users SET password = ?, is_temp_password = 1 WHERE id = ?", [hash, userId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Password reset' });
    });
});

app.delete('/api/users/:id', requireAuth, requireRole('admin'), (req, res) => {
    const userId = parseInt(req.params.id);
    
    if (req.session.userId === userId) {
        return res.status(400).json({ error: 'Cannot delete yourself' });
    }
    
    db.serialize(() => {
        db.run("DELETE FROM face_descriptors WHERE user_id = ?", [userId]);
        db.run("DELETE FROM attendance_records WHERE student_id = ?", [userId], (err) => {});
        db.run("DELETE FROM attendance_sessions WHERE faculty_id = ?", [userId], (err) => {});
        db.run("DELETE FROM users WHERE id = ?", [userId], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Deleted' });
        });
    });
});

// ============ FACE DATA API ============

app.post('/api/faces', requireAuth, (req, res) => {
    const { userId, descriptor } = req.body;
    
    // Allow if admin, or if user is saving their own face
    if (req.session.role !== 'admin' && req.session.userId != userId) {
        return res.status(403).json({ error: 'Forbidden: You can only save your own face data' });
    }
    
    db.run("INSERT OR REPLACE INTO face_descriptors (user_id, descriptor) VALUES (?, ?)",
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

app.get('/api/users/without-faces', requireAuth, requireRole('admin'), (req, res) => {
    db.all("SELECT id, name, role FROM users WHERE id NOT IN (SELECT user_id FROM face_descriptors)", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ============ ATTENDANCE API ============

app.post('/api/attendance/start', requireAuth, requireRole('teacher'), (req, res) => {
    const { sectionName, topic, startTime, endTime, subject } = req.body;
    const sessionToken = generateSessionToken();
    db.run("INSERT INTO attendance_sessions (faculty_id, section_name, topic, subject, start_time, end_time, session_token) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [req.session.userId, sectionName, topic, subject, startTime, endTime, sessionToken],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ sessionId: this.lastID, sessionToken: sessionToken, message: 'Session started' });
        });
});

// ============ SUBJECTS API ============
app.get('/api/subjects', requireAuth, (req, res) => {
    db.all("SELECT * FROM subjects ORDER BY name", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/subjects', requireAuth, requireRole('admin'), (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Subject name required' });
    db.run("INSERT INTO subjects (name) VALUES (?)", [name], function(err) {
        if (err) return res.status(400).json({ error: 'Subject already exists' });
        res.json({ id: this.lastID, message: 'Subject added' });
    });
});

// ============ SECTIONS API ============
app.get('/api/sections', requireAuth, (req, res) => {
    db.all("SELECT * FROM sections ORDER BY name", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/sections', requireAuth, requireRole('admin'), (req, res) => {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Section name required' });
    db.run("INSERT INTO sections (name, description) VALUES (?, ?)", [name, description], function(err) {
        if (err) return res.status(400).json({ error: 'Section already exists' });
        res.json({ id: this.lastID, message: 'Section added' });
    });
});

app.delete('/api/sections/:id', requireAuth, requireRole('admin'), (req, res) => {
    db.run("DELETE FROM sections WHERE id = ?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Section deleted' });
    });
});

app.get('/api/attendance/qr/:sessionId', requireAuth, requireRole('teacher'), (req, res) => {
    const { sessionId } = req.params;
    db.get("SELECT id, session_token, topic, status FROM attendance_sessions WHERE id = ? AND faculty_id = ? AND status = 'active'",
        [sessionId, req.session.userId],
        (err, session) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!session) return res.status(404).json({ error: 'Session not found or closed' });
            
            const newToken = generateSessionToken();
            db.run("UPDATE attendance_sessions SET session_token = ?, last_qr_time = CURRENT_TIMESTAMP WHERE id = ?",
                [newToken, sessionId],
                (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    
                    const qrData = JSON.stringify({ sessionId: sessionId, token: newToken });
                    
                    QRCode.toDataURL(qrData, { width: 200, margin: 2 }, (err, qrCodeDataUrl) => {
                        if (err) return res.status(500).json({ error: 'QR generation failed' });
                        res.json({ qrCode: qrCodeDataUrl, token: newToken, expiresIn: 3 });
                    });
                });
        });
});

app.post('/api/attendance/verify-mark', requireAuth, (req, res) => {
    const { sessionId, token } = req.body;
    
    db.get("SELECT * FROM attendance_sessions WHERE id = ? AND status = 'active'",
        [sessionId],
        (err, session) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!session) return res.status(400).json({ error: 'Session not active' });
            if (session.session_token !== token) return res.status(400).json({ error: 'Invalid or expired QR token' });
            
            if (req.session.role !== 'student') {
                return res.status(403).json({ error: 'Only students can mark attendance' });
            }
            
            db.get("SELECT * FROM attendance_records WHERE session_id = ? AND student_id = ?",
                [sessionId, req.session.userId],
                (err, existing) => {
                    if (err) return res.status(500).json({ error: err.message });
                    if (existing) return res.status(400).json({ error: 'Attendance already marked' });
                    
                    // Mark attendance (face verification was done at login)
                    db.run("INSERT INTO attendance_records (session_id, student_id) VALUES (?, ?)",
                        [sessionId, req.session.userId],
                        (err) => {
                            if (err) return res.status(500).json({ error: err.message });
                            res.json({ message: 'Attendance marked successfully' });
                        });
                });
        });
});

app.post('/api/attendance/stop', requireAuth, requireRole('teacher'), (req, res) => {
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

app.get('/api/attendance/percentage', requireAuth, (req, res) => {
    if (req.session.role !== 'student') {
        return res.status(403).json({ error: 'Only students can view their attendance percentage' });
    }
    
    // Get all sessions and count attended sessions
    db.all(`SELECT s.id as session_id, s.subject, s.section_name
            FROM attendance_sessions s`, 
        [], (err, sessions) => {
            if (err) return res.status(500).json({ error: err.message });
            
            db.all(`SELECT session_id FROM attendance_records WHERE student_id = ?`, 
                [req.session.userId], 
                (err, attended) => {
                    if (err) return res.status(500).json({ error: err.message });
                    
                    const attendedSet = new Set(attended.map(a => a.session_id));
                    const totalSessions = sessions.length;
                    const attendedCount = attended.length;
                    const overallPercentage = totalSessions > 0 ? ((attendedCount / totalSessions) * 100).toFixed(2) : 0;
                    
                    // Calculate per subject
                    const subjectMap = {};
                    sessions.forEach(s => {
                        if (!subjectMap[s.subject]) {
                            subjectMap[s.subject] = { total: 0, attended: 0 };
                        }
                        subjectMap[s.subject].total++;
                        if (attendedSet.has(s.session_id)) {
                            subjectMap[s.subject].attended++;
                        }
                    });
                    
                    const subjectPercentages = Object.keys(subjectMap).map(subject => ({
                        subject,
                        total: subjectMap[subject].total,
                        attended: subjectMap[subject].attended,
                        percentage: ((subjectMap[subject].attended / subjectMap[subject].total) * 100).toFixed(2)
                    }));
                    
                    res.json({
                        overall: {
                            total: totalSessions,
                            attended: attendedCount,
                            percentage: overallPercentage
                        },
                        bySubject: subjectPercentages
                    });
                });
        });
});

app.get('/api/attendance/reports', requireAuth, (req, res) => {
    let query = `
        SELECT r.id, s.section_name, s.topic, s.start_time, s.end_time, u.name as student_name, r.timestamp
        FROM attendance_records r
        JOIN attendance_sessions s ON r.session_id = s.id
        JOIN users u ON r.student_id = u.id
    `;
    let params = [];
    
    if (req.session.role === 'student') {
        query += " WHERE r.student_id = ?";
        params.push(req.session.userId);
    } else if (req.session.role === 'teacher') {
        query += " WHERE s.faculty_id = ?";
        params.push(req.session.userId);
    }
    
    query += " ORDER BY r.timestamp DESC";
    
    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/attendance/sessions/active', requireAuth, (req, res) => {
    db.all("SELECT s.id, s.section_name, s.topic, s.start_time, s.end_time, u.name as teacher_name FROM attendance_sessions s JOIN users u ON s.faculty_id = u.id WHERE s.status = 'active' ORDER BY s.created_at DESC",
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
});

// Health check endpoint (important for Render)
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Serve index.html for root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});