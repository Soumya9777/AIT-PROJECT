const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
const fs = require('fs');

// Use DB_PATH environment variable if available (for Render.com persistent disk)
const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'attendance.db');
const dbDir = path.dirname(dbPath);

// Create database directory if it doesn't exist
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

console.log(`Database path: ${dbPath}`);
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        initDb();
    }
});

function initDb() {
    db.serialize(() => {
        // Users Table
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            name TEXT,
            role TEXT,
            section TEXT,
            is_temp_password INTEGER DEFAULT 1
        )`, () => {
            // Add section column if not exists (for existing databases)
            db.run(`ALTER TABLE users ADD COLUMN section TEXT`, () => {});
        });

        // Face Descriptors Table
        db.run(`CREATE TABLE IF NOT EXISTS face_descriptors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            descriptor TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`);

        // Attendance Sessions Table
        db.run(`CREATE TABLE IF NOT EXISTS attendance_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            faculty_id INTEGER,
            section_name TEXT,
            topic TEXT,
            subject TEXT,
            start_time TIME,
            end_time TIME,
            session_token TEXT,
            last_qr_time DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'active',
            FOREIGN KEY(faculty_id) REFERENCES users(id)
        )`, () => {
            // Add subject column if not exists (for existing databases)
            db.run(`ALTER TABLE attendance_sessions ADD COLUMN subject TEXT`, () => {});
        });

        // Subjects Table
        db.run(`CREATE TABLE IF NOT EXISTS subjects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Sections Table
        db.run(`CREATE TABLE IF NOT EXISTS sections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Attendance Records Table
        db.run(`CREATE TABLE IF NOT EXISTS attendance_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER,
            student_id INTEGER,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'present',
            FOREIGN KEY(session_id) REFERENCES attendance_sessions(id),
            FOREIGN KEY(student_id) REFERENCES users(id)
        )`);

        // Audit Logs Table
        db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            username TEXT,
            action TEXT,
            details TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`);

        // Attendance Corrections Table
        db.run(`CREATE TABLE IF NOT EXISTS attendance_corrections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER,
            session_id INTEGER,
            request_type TEXT,
            reason TEXT,
            document_path TEXT,
            status TEXT DEFAULT 'pending',
            reviewed_by INTEGER,
            review_comment TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            reviewed_at DATETIME,
            FOREIGN KEY(student_id) REFERENCES users(id),
            FOREIGN KEY(session_id) REFERENCES attendance_sessions(id),
            FOREIGN KEY(reviewed_by) REFERENCES users(id)
        )`);

        // Notifications Table
        db.run(`CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            title TEXT,
            message TEXT,
            type TEXT,
            is_read INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`);

        // Insert default admin if not exists
        db.get("SELECT * FROM users WHERE username = 'admin'", (err, row) => {
            if (!row) {
                const hash = bcrypt.hashSync('admin123', 10);
                db.run("INSERT INTO users (username, password, name, role, is_temp_password) VALUES (?, ?, ?, ?, 0)", 
                    ['admin', hash, 'System Administrator', 'admin']);
            }
        });
    });
}

module.exports = db;
