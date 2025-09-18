const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend
app.use(express.static(path.join(__dirname, 'public')));

const dbFile = path.join(__dirname, 'data', 'patients.db');
const dbDir = path.join(__dirname, 'data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

let db;

// ================= DATE FORMATTING HELPER =================
function formatDateString(dateValue) {
  if (!dateValue) return null;
  
  const str = String(dateValue).trim();
  
  // If it's already in YYYY-MM-DD format, return as is
  if (str.match(/^\d{4}-\d{2}-\d{2}$/)) return str;
  
  // Handle DD-MM-YYYY format (your data format)
  if (str.match(/^\d{2}-\d{2}-\d{4}$/)) {
    const [day, month, year] = str.split('-');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  // Handle MM/DD/YYYY format
  if (str.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
    const [month, day, year] = str.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  // Handle DD/MM/YYYY format (alternative interpretation)
  if (str.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
    const parts = str.split('/');
    // Assume DD/MM/YYYY if day > 12, otherwise MM/DD/YYYY
    if (parseInt(parts[0]) > 12) {
      const [day, month, year] = parts;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }
  
  // Check if it's an Excel date serial number
  const num = parseFloat(str);
  if (!isNaN(num) && num > 1 && num < 100000) {
    // Convert Excel serial to date
    const excelEpoch = new Date(1900, 0, 1);
    const jsDate = new Date(excelEpoch.getTime() + (num - 2) * 24 * 60 * 60 * 1000);
    return jsDate.toISOString().split('T')[0];
  }
  
  // Try to parse as a regular date
  try {
    const date = new Date(str);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  } catch (e) {
    // ignore parsing errors
  }
  
  return str; // Return original if can't parse
}

// ================= INIT DB =================
async function initDb() {
  db = await open({
    filename: dbFile,
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS patients (
      ID TEXT PRIMARY KEY,
      Name TEXT,
      Age INTEGER,
      Gender TEXT,
      Date TEXT,
      Department TEXT,
      Diagnosis TEXT,
      Treatment TEXT,
      Doctor TEXT,
      Cost REAL,
      Total REAL
    );
  `);

  await loadSampleData();
}

async function loadSampleData() {
  const row = await db.get("SELECT COUNT(*) as c FROM patients");
  if (row.c > 0) return;

  const sample = [
    {ID:'P00001', Name:'John Smith', Age:35, Gender:'Male', Date:'2024-01-15', Department:'Cardiology', Diagnosis:'Hypertension', Treatment:'Medication', Doctor:'Dr. Wilson', Cost:5500, Total:5500},
    {ID:'P00002', Name:'Sarah Johnson', Age:28, Gender:'Female', Date:'2024-01-16', Department:'Neurology', Diagnosis:'Migraine', Treatment:'Pain Relief', Doctor:'Dr. Brown', Cost:3500, Total:3500},
    {ID:'P00003', Name:'Mike Davis', Age:45, Gender:'Male', Date:'2024-01-17', Department:'Orthopedics', Diagnosis:'Fracture', Treatment:'Surgery', Doctor:'Dr. Davis', Cost:15000, Total:15000}
  ];

  const insert = await db.prepare(`
    INSERT INTO patients (ID,Name,Age,Gender,Date,Department,Diagnosis,Treatment,Doctor,Cost,Total)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `);

  for (const r of sample) {
    await insert.run([r.ID, r.Name, r.Age, r.Gender, r.Date, r.Department, r.Diagnosis, r.Treatment, r.Doctor, r.Cost, r.Total]);
  }
  await insert.finalize();
  console.log(`Loaded ${sample.length} sample records into database`);
}

// ================= UPLOAD =================
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const filePath = req.file.path;
    const wb = XLSX.readFile(filePath);
    const sname = wb.SheetNames[0];
    const rawRows = XLSX.utils.sheet_to_json(wb.Sheets[sname], {
      header: 1,
      defval: "",
      blankrows: false
    });

    if (rawRows.length <= 1) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: 'No data rows found in sheet' });
    }

    const headers = rawRows[0].map((h, idx) => (h ? h.toString().trim() : `Column${idx + 1}`));
    const dataRows = rawRows.slice(1).filter(r => r && r.some(val => val !== "" && val !== null && val !== undefined));

    const insert = await db.prepare(`
      INSERT OR REPLACE INTO patients (ID,Name,Age,Gender,Date,Department,Diagnosis,Treatment,Doctor,Cost,Total)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `);

    let insertedCount = 0;
    for (const r of dataRows) {
      const row = {};
      headers.forEach((h, i) => {
        row[h] = r[i] !== undefined && r[i] !== null ? String(r[i]).trim() : "";
      });

      const getField = (possibleNames) => {
        for (const name of possibleNames) {
          if (row[name] && row[name].trim()) return row[name].trim();
          const key = Object.keys(row).find(k => k.toLowerCase() === name.toLowerCase());
          if (key && row[key] && row[key].trim()) return row[key].trim();
        }
        return null;
      };

      const patientData = {
        ID: getField(['PATIENT_ID','ID','PatientID','Patient_ID']),
        Name: getField(['NAME','Name','FullName','PatientName']),
        Age: parseInt(getField(['AGE','Age','patient_age','PatientAge'])) || null,
        Gender: getField(['GENDER','Gender','Sex']),
        Date: formatDateString(getField(['APPOINTMENT_DATE','Date','VisitDate','AdmissionDate'])),
        Department: getField(['DEPARTMENT','Department','dept']),
        Diagnosis: getField(['DIAGNOSIS','Diagnosis','Condition','Disease']),
        Treatment: getField(['TREATMENT','Treatment','Therapy','Procedure']),
        Doctor: getField(['DOCTOR_NAME','Doctor','Physician']),
        Cost: parseFloat(getField(['COST','Cost','Amount','Fee','Charge'])) || null,
        Total: parseFloat(getField(['TOTAL_COST','Total','TotalAmount'])) || null
      };

      // Skip if no ID or Name (junk rows)
      if (!patientData.ID || !patientData.Name) continue;

      if (!patientData.Total && patientData.Cost) {
        patientData.Total = patientData.Cost;
      }

      await insert.run([
        patientData.ID,
        patientData.Name,
        patientData.Age,
        patientData.Gender,
        patientData.Date,
        patientData.Department,
        patientData.Diagnosis,
        patientData.Treatment,
        patientData.Doctor,
        patientData.Cost,
        patientData.Total
      ]);
      insertedCount++;
    }

    await insert.finalize();
    fs.unlinkSync(filePath);

    res.json({ message: 'File processed successfully', rows: insertedCount });
  } catch (err) {
    console.error('Upload error:', err);
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: err.message });
  }
});

// ================= QUERY =================
app.post('/api/query', async (req, res) => {
  try {
    const { sql } = req.body;
    if (!sql || !sql.trim()) return res.status(400).json({ error: 'SQL query required' });

    const lowered = sql.toLowerCase().trim();
    if (!lowered.includes('patients')) {
      return res.status(400).json({ error: 'Queries must reference the "patients" table' });
    }

    const allowed = ['select', 'insert', 'update', 'delete'];
    const verb = lowered.split(/\s+/)[0];
    if (!allowed.includes(verb)) {
      return res.status(400).json({ error: 'Only SELECT, INSERT, UPDATE, DELETE queries allowed' });
    }

    if (verb === 'select') {
      const rows = await db.all(sql);
      return res.json({ rows });
    } else {
      const info = await db.run(sql);
      return res.json({ info: { changes: info.changes, lastID: info.lastID } });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= SAMPLE =================
app.get('/api/sample', async (req, res) => {
  try {
    const rows = await db.all("SELECT * FROM patients LIMIT 100");
    res.json({ rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= CLEAR DATA =================
app.delete('/api/clear', async (req, res) => {
  try {
    const info = await db.run('DELETE FROM patients');
    res.json({ message: `Cleared ${info.changes} records` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= HEALTH CHECK =================
app.get('/api/health', async (req, res) => {
  try {
    const row = await db.get("SELECT COUNT(*) as count FROM patients");
    res.json({ status: 'ok', totalRecords: row.count });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// ================= FALLBACK =================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
initDb().then(() => {
  console.log(`Database initialized at ${dbFile}`);
  app.listen(PORT, () => {
    console.log(`Health Centre server listening on port ${PORT}`);
    console.log(`Visit http://localhost:${PORT} to use the interface`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});