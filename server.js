const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./database');
const crypto = require('crypto');
const QRCode = require('qrcode');
const fs = require('fs');
const XLSX = require('xlsx');

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
            req.session.username = user.username;
            req.session.faceVerified = false;
            
            const roleToPage = {
                'admin': 'admin.html',
                'teacher': 'teacher.html',
                'student': 'face-verify.html'
            };
            
            res.json({ message: 'Login successful', role: user.role, name: user.name, redirect: roleToPage[user.role] });
        } else {
            res.status(401).json({ error: 'Invalid credentials' });
        }
    });
});

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
                req.session.username = user.username;
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
    const { username, password, name, role, section } = req.body;
    const hash = bcrypt.hashSync(password, 10);
    db.run("INSERT INTO users (username, password, name, role, section) VALUES (?, ?, ?, ?, ?)",
        [username, hash, name, role, section || null],
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
        db.run("DELETE FROM attendance_records WHERE student_id = ?", [userId]);
        db.run("DELETE FROM attendance_sessions WHERE faculty_id = ?", [userId]);
        db.run("DELETE FROM users WHERE id = ?", [userId], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Deleted' });
        });
    });
});

// ============ FACE DATA API ============

app.post('/api/faces', requireAuth, (req, res) => {
    const { userId, descriptor } = req.body;
    
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

app.delete('/api/subjects/:id', requireAuth, requireRole('admin'), (req, res) => {
    db.run("DELETE FROM subjects WHERE id = ?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Subject deleted' });
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
    
    db.all(`SELECT s.id as session_id, s.subject, s.section_name FROM attendance_sessions s`, 
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
        SELECT r.id, s.id as session_id, s.section_name, s.topic, s.subject, s.start_time, s.end_time, u.section, u.name as student_name, r.timestamp
        FROM attendance_records r
        JOIN attendance_sessions s ON r.session_id = s.id
        JOIN users u ON r.student_id = u.id
    `;
    let params = [];
    
    if (req.session.role === 'student') {
        query += ` WHERE r.student_id = ?`;
        params.push(req.session.userId);
    } else if (req.session.role === 'teacher') {
        query += ` WHERE s.faculty_id = ?`;
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

// ============ AUDIT LOGS API ============

function logAudit(userId, username, action, details) {
    db.run("INSERT INTO audit_logs (user_id, username, action, details) VALUES (?, ?, ?, ?)",
        [userId, username, action, details]);
}

app.get('/api/audit-logs', requireAuth, requireRole('admin'), (req, res) => {
    const { limit = 100, offset = 0 } = req.query;
    db.all("SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ? OFFSET ?",
        [parseInt(limit), parseInt(offset)],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            db.get("SELECT COUNT(*) as total FROM audit_logs", [], (err, count) => {
                res.json({ logs: rows, total: count ? count.total : 0 });
            });
        });
});

// ============ ATTENDANCE CORRECTIONS API ============

app.post('/api/attendance/correction', requireAuth, (req, res) => {
    if (req.session.role !== 'student') {
        return res.status(403).json({ error: 'Only students can request corrections' });
    }
    const { sessionId, requestType, reason } = req.body;
    db.run("INSERT INTO attendance_corrections (student_id, session_id, request_type, reason, status) VALUES (?, ?, ?, ?, 'pending')",
        [req.session.userId, sessionId, requestType, reason],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            logAudit(req.session.userId, req.session.username, 'CORRECTION_REQUEST', `Session ${sessionId}: ${requestType}`);
            
            // Notify all teachers about the correction request
            db.all("SELECT id FROM users WHERE role IN ('teacher', 'admin')", [], (err, teachers) => {
                if (!err && teachers) {
                    teachers.forEach(t => {
                        createNotification(t.id, 'New Correction Request', 
                            `Student ${req.session.name} submitted a correction request for session ${sessionId}`, 'info');
                    });
                }
            });
            
            res.json({ id: this.lastID, message: 'Correction request submitted' });
        });
});

app.get('/api/attendance/corrections', requireAuth, (req, res) => {
    let query = `SELECT c.*, u.name as student_name, s.topic, s.subject, s.section_name 
                 FROM attendance_corrections c 
                 JOIN users u ON c.student_id = u.id 
                 JOIN attendance_sessions s ON c.session_id = s.id`;
    let params = [];
    
    if (req.session.role === 'student') {
        query += " WHERE c.student_id = ?";
        params.push(req.session.userId);
    } else if (req.session.role === 'teacher') {
        query += " WHERE s.faculty_id = ?";
        params.push(req.session.userId);
    }
    
    query += " ORDER BY c.created_at DESC";
    
    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/attendance/correction/review', requireAuth, (req, res) => {
    if (req.session.role === 'student') {
        return res.status(403).json({ error: 'Students cannot review corrections' });
    }
    const { correctionId, status, comment } = req.body;
    db.run(`UPDATE attendance_corrections SET status = ?, reviewed_by = ?, review_comment = ?, reviewed_at = CURRENT_TIMESTAMP 
            WHERE id = ?`,
        [status, req.session.userId, comment, correctionId],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            
            if (status === 'approved') {
                db.get("SELECT session_id, student_id FROM attendance_corrections WHERE id = ?", [correctionId], (err, row) => {
                    if (row) {
                        db.run("INSERT OR IGNORE INTO attendance_records (session_id, student_id) VALUES (?, ?)",
                            [row.session_id, row.student_id]);
                    }
                });
            }
            
            logAudit(req.session.userId, req.session.username, 'CORRECTION_REVIEW', `Correction ${correctionId}: ${status}`);
            res.json({ message: `Correction ${status}` });
        });
});

// ============ DATA EXPORT API ============

app.get('/api/export/attendance', requireAuth, (req, res) => {
    const { format = 'xlsx', section, subject } = req.query;
    
    let query = `
        SELECT u.username, u.name, u.section, s.subject, s.topic, s.start_time, s.section_name, r.timestamp
        FROM attendance_records r
        JOIN attendance_sessions s ON r.session_id = s.id
        JOIN users u ON r.student_id = u.id
        WHERE 1=1
    `;
    let params = [];
    
    if (req.session.role === 'student') {
        query += " AND r.student_id = ?";
        params.push(req.session.userId);
    } else if (req.session.role === 'teacher') {
        query += " AND s.faculty_id = ?";
        params.push(req.session.userId);
    }
    
    if (section) {
        query += " AND s.section_name = ?";
        params.push(section);
    }
    if (subject) {
        query += " AND s.subject = ?";
        params.push(subject);
    }
    
    query += " ORDER BY r.timestamp DESC";
    
    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (format === 'csv') {
            const ws = XLSX.utils.json_to_sheet(rows);
            const csv = XLSX.utils.sheet_to_csv(ws);
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=attendance.csv');
            res.send(csv);
        } else {
            const ws = XLSX.utils.json_to_sheet(rows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
            const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=attendance.xlsx');
            res.send(buffer);
        }
    });
});

// ============ BACKUP/RESTORE API ============

app.get('/api/backup', requireAuth, requireRole('admin'), (req, res) => {
    const dataDir = path.resolve(__dirname, 'data');
    const backupDir = path.resolve(__dirname, 'backups');
    const dbPath = path.join(dataDir, 'attendance.db');
    
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `backup-${timestamp}.db`);
    
    try {
        fs.copyFileSync(dbPath, backupPath);
        logAudit(req.session.userId, req.session.username, 'BACKUP', `Backup created: backup-${timestamp}.db`);
        res.json({ message: 'Backup created successfully', filename: `backup-${timestamp}.db` });
    } catch (err) {
        res.status(500).json({ error: 'Backup failed: ' + err.message });
    }
});

app.post('/api/restore', requireAuth, requireRole('admin'), (req, res) => {
    const { backupFile } = req.body;
    const backupDir = path.resolve(__dirname, 'backups');
    const backupPath = path.join(backupDir, backupFile);
    
    if (!fs.existsSync(backupPath)) {
        return res.status(404).json({ error: 'Backup file not found' });
    }
    
    const dbPath = path.join(__dirname, 'data', 'attendance.db');
    fs.copyFileSync(backupPath, dbPath);
    
    logAudit(req.session.userId, req.session.username, 'RESTORE', `Restored from: ${backupFile}`);
    res.json({ message: 'Database restored successfully. Please restart the server.' });
});

app.get('/api/backups', requireAuth, requireRole('admin'), (req, res) => {
    const backupDir = path.resolve(__dirname, 'backups');
    if (!fs.existsSync(backupDir)) {
        return res.json([]);
    }
    fs.readdir(backupDir, (err, files) => {
        if (err) return res.status(500).json({ error: err.message });
        const backups = files.filter(f => f.endsWith('.db')).map(f => ({
            filename: f,
            path: path.join(backupDir, f)
        }));
        res.json(backups);
    });
});

// ============ NOTIFICATIONS API ============

app.get('/api/notifications', requireAuth, (req, res) => {
    db.all("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
        [req.session.userId],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
});

app.post('/api/notifications/read', requireAuth, (req, res) => {
    const { notificationId } = req.body;
    db.run("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?",
        [notificationId, req.session.userId],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Notification marked as read' });
        });
});

app.post('/api/notifications/read-all', requireAuth, (req, res) => {
    db.run("UPDATE notifications SET is_read = 1 WHERE user_id = ?",
        [req.session.userId],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'All notifications marked as read' });
        });
});

function createNotification(userId, title, message, type = 'info') {
    db.run("INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)",
        [userId, title, message, type]);
}

app.get('/api/notifications/unread-count', requireAuth, (req, res) => {
    db.get("SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0",
        [req.session.userId],
        (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ count: row ? row.count : 0 });
        });
});

// ============ ATTENDANCE ANALYTICS API ============

app.get('/api/analytics/attendance', requireAuth, (req, res) => {
    const { section, subject, startDate, endDate } = req.query;
    
    let query = `
        SELECT 
            DATE(r.timestamp) as date,
            s.subject,
            s.section_name,
            COUNT(DISTINCT r.student_id) as present_count,
            (SELECT COUNT(*) FROM users WHERE role = 'student' AND (section = s.section_name OR ? IS NULL)) as total_students
        FROM attendance_records r
        JOIN attendance_sessions s ON r.session_id = s.id
        WHERE 1=1
    `;
    let params = [section];
    
    if (req.session.role === 'teacher') {
        query += " AND s.faculty_id = ?";
        params.push(req.session.userId);
    }
    if (section) {
        query += " AND s.section_name = ?";
        params.push(section);
    }
    if (subject) {
        query += " AND s.subject = ?";
        params.push(subject);
    }
    if (startDate) {
        query += " AND DATE(r.timestamp) >= ?";
        params.push(startDate);
    }
    if (endDate) {
        query += " AND DATE(r.timestamp) <= ?";
        params.push(endDate);
    }
    
    query += " GROUP BY DATE(r.timestamp), s.subject ORDER BY date DESC";
    
    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/analytics/at-risk', requireAuth, (req, res) => {
    if (req.session.role === 'student') {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    const threshold = req.query.threshold || 75;
    const { section } = req.query;
    
    let query = `
        SELECT 
            u.id, u.name, u.section,
            COUNT(DISTINCT s.id) as total_sessions,
            COUNT(DISTINCT r.session_id) as attended_sessions,
            CASE 
                WHEN COUNT(DISTINCT s.id) > 0 
                THEN (COUNT(DISTINCT r.session_id) * 100.0 / COUNT(DISTINCT s.id)) 
                ELSE 0 
            END as attendance_percentage
        FROM users u
        LEFT JOIN attendance_sessions s ON (u.section = s.section_name OR ? IS NULL)
        LEFT JOIN attendance_records r ON r.student_id = u.id AND r.session_id = s.id
        WHERE u.role = 'student'
    `;
    let params = [section];
    
    if (section) {
        query += " AND u.section = ?";
        params.push(section);
    }
    
    query += " GROUP BY u.id HAVING attendance_percentage < ? ORDER BY attendance_percentage ASC";
    params.push(threshold);
    
    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Update login to log audit
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) {
            logAudit(null, username, 'LOGIN_FAILED', 'User not found');
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        if (bcrypt.compareSync(password, user.password)) {
            if (user.is_temp_password === 1) {
                return res.json({ requiresPasswordChange: true, username: user.username });
            }
            
            req.session.userId = user.id;
            req.session.role = user.role;
            req.session.name = user.name;
            req.session.username = user.username;
            req.session.faceVerified = false;
            
            logAudit(user.id, user.username, 'LOGIN', 'User logged in');
            
            const roleToPage = {
                'admin': 'admin.html',
                'teacher': 'teacher.html',
                'student': 'face-verify.html'
            };
            
            res.json({ message: 'Login successful', role: user.role, name: user.name, redirect: roleToPage[user.role] });
        } else {
            logAudit(user.id, user.username, 'LOGIN_FAILED', 'Wrong password');
            res.status(401).json({ error: 'Invalid credentials' });
        }
    });
});

// Update logout to log audit
app.get('/api/logout', (req, res) => {
    if (req.session.userId) {
        logAudit(req.session.userId, req.session.username, 'LOGOUT', 'User logged out');
    }
    req.session.destroy((err) => {
        if (err) return res.status(500).json({ error: 'Logout failed' });
        res.json({ message: 'Logged out' });
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