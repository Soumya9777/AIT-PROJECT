const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

const dbPath = path.resolve(__dirname, 'data', 'attendance.db');
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
            is_temp_password INTEGER DEFAULT 1
        )`);

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
            subject TEXT,
            start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'active',
            FOREIGN KEY(faculty_id) REFERENCES users(id)
        )`);

        // Attendance Records Table
        db.run(`CREATE TABLE IF NOT EXISTS attendance_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER,
            student_id INTEGER,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(session_id) REFERENCES attendance_sessions(id),
            FOREIGN KEY(student_id) REFERENCES users(id)
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
