
Health Centre Fullstack Project
===============================

What this includes:
- Express backend (server.js) using SQLite (better-sqlite3)
- File upload endpoint (/api/upload) that accepts .xlsx/.csv and inserts into patients table
- SQL execution endpoint (/api/query) which runs queries against the patients table (basic safety checks)
- Frontend served from /public (index.html, css, js)

Requirements:
- Node.js (14+)
- npm

Quick start:
1. Unzip project and open folder in terminal.
2. Run: npm install
3. Start server: npm start
4. Open http://localhost:3000 in your browser.

Notes:
- Uploaded files are parsed and data inserted into SQLite DB at /data/patients.db
- For safety, /api/query requires the SQL to reference the 'patients' table and only allows SELECT/INSERT/UPDATE/DELETE.
- This is a demo project — do not expose to untrusted networks without adding authentication and input sanitation.

Generated on: 2025-09-11T18:44:42.201485 UTC
