# AIT Smart Attendance System

A modern, web-based attendance management system for educational institutions with QR code and face recognition support.

## Features

### Core Features
- **QR Code Based Attendance**: Teachers generate time-sensitive QR codes that students scan to mark attendance
- **Face Recognition**: Biometric verification using face-api.js for enhanced security
- **Role-Based Access**: Separate dashboards for Administrators, Teachers, and Students
- **Real-Time Attendance**: Live attendance tracking during active sessions

### Admin Features
- Dashboard with comprehensive statistics
- User management (add, edit, delete users)
- Bulk upload students via CSV/Excel
- Subject and section management
- Face data management for all users
- System settings (dark mode, face verification toggle, etc.)
- **Audit Logs**: Track all system activities
- **Analytics Dashboard**: Visual attendance trends and at-risk student identification
- **Backup & Restore**: Database backup and restore functionality

### Teacher Features
- Create attendance sessions with subject, topic, and time slots
- Auto-refreshing QR codes (every 5 seconds)
- View active sessions
- Attendance reports with present/absent students
- **Review Attendance Corrections**: Handle student correction requests
- Export attendance data to Excel/CSV

### Student Features
- Face verification before portal access
- Scan QR codes to mark attendance
- View attendance percentage (overall and by subject)
- Visual attendance charts
- Attendance history records
- **Request Attendance Corrections**: Submit correction requests for missing/incorrect attendance
- Export personal attendance data

### New Features Added
- **Audit Logging**: Complete tracking of user actions (login, logout, corrections, backups)
- **Attendance Correction System**: Students can request corrections, teachers/admins can review and approve
- **Advanced Analytics**: Interactive charts showing attendance trends, at-risk students identification
- **Data Export**: Export attendance data to Excel/CSV format
- **Backup & Restore**: Database backup creation and restoration
- **Notification System**: In-app notifications for users
- **At-Risk Monitoring**: Automatically identify students with attendance below 75%

## Technology Stack

### Backend
- **Node.js** (v20.11.1)
- **Express.js** - Web framework
- **SQLite3** - Database
- **bcryptjs** - Password hashing
- **jsonwebtoken** - JWT authentication
- **qrcode** - QR code generation
- **XLSX** - Excel/CSV export

### Frontend
- **HTML5, CSS3, Vanilla JavaScript**
- **Face-api.js** - Face recognition
- **Html5-qrcode** - QR code scanning
- **Chart.js** - Analytics visualizations
- **Google Fonts (Inter)** - Typography

## Installation

1. Clone the repository
```bash
git clone <repository-url>
cd "AIT PROJECT"
```

2. Install dependencies
```bash
npm install
```

3. Start the server
```bash
npm start
```

For development with auto-restart:
```bash
npm run dev
```

4. Access the application
Open your browser and navigate to `http://localhost:3001`

## Default Login Credentials

- **Admin**
  - Username: `admin`
  - Password: `admin123`

- **Students and Teachers**: Create through admin panel or use bulk upload

## Database Schema

### Tables
- **users** - User accounts (students, teachers, admins)
- **face_descriptors** - Face recognition data
- **attendance_sessions** - Attendance sessions created by teachers
- **attendance_records** - Attendance marking records
- **subjects** - Subject management
- **sections** - Section/class management
- **audit_logs** - System activity logs
- **attendance_corrections** - Correction requests
- **notifications** - User notifications

## API Endpoints

### Authentication
- `POST /api/login` - User login
- `POST /api/logout` - User logout
- `POST /api/change-password` - Change password
- `GET /api/session` - Get current session info

### Users (Admin)
- `GET /api/users` - List all users
- `POST /api/users` - Create new user
- `DELETE /api/users/:id` - Delete user
- `POST /api/users/reset-password` - Reset user password

### Attendance
- `POST /api/attendance/start` - Start attendance session (Teacher)
- `POST /api/attendance/stop` - Stop attendance session (Teacher)
- `POST /api/attendance/verify-mark` - Verify and mark attendance (Student)
- `GET /api/attendance/reports` - Get attendance reports
- `GET /api/attendance/percentage` - Get attendance percentage (Student)
- `GET /api/attendance/sessions/active` - Get active sessions

### New API Endpoints
- `POST /api/attendance/correction` - Submit correction request (Student)
- `GET /api/attendance/corrections` - Get correction requests
- `POST /api/attendance/correction/review` - Review correction (Teacher/Admin)
- `GET /api/audit-logs` - Get audit logs (Admin)
- `GET /api/analytics/attendance` - Get attendance analytics
- `GET /api/analytics/at-risk` - Get at-risk students
- `GET /api/export/attendance` - Export attendance data
- `GET /api/backup` - Create database backup (Admin)
- `POST /api/restore` - Restore database (Admin)
- `GET /api/backups` - List available backups (Admin)
- `GET /api/notifications` - Get user notifications

## File Structure

```
AIT PROJECT/
├── server.js                 # Main Express.js backend
├── database.js               # SQLite database initialization
├── package.json              # Node.js dependencies
├── render.yaml               # Render.com deployment config
├── data/
│   └── attendance.db        # SQLite database
├── public/                   # Frontend files
│   ├── index.html           # Login page
│   ├── admin.html           # Admin dashboard
│   ├── admin-analytics.html # Analytics dashboard
│   ├── admin-audit-logs.html # Audit logs
│   ├── admin-settings.html  # System settings
│   ├── teacher.html         # Teacher dashboard
│   ├── student.html         # Student portal
│   ├── attendance-correction.html # Student corrections
│   ├── corrections-review.html # Review corrections
│   ├── scan.html            # QR code scanner
│   ├── face-verify.html    # Face verification
│   └── css/
│       └── styles.css       # Main stylesheet
└── node_modules/
```

## Deployment

The project is configured for deployment on Render.com using the `render.yaml` file.

## License

ISC

## Author

Developed for NIST (National Institute of Science and Technology)
