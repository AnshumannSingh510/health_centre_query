
let databasePreview = [];

document.getElementById('fileInput').addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  if (!file) return;
  const form = new FormData();
  form.append('file', file);
  showMessage('Uploading file to server...', 'info');
  try {
    const res = await fetch('/api/upload', { method: 'POST', body: form });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || JSON.stringify(j));
    showMessage(`Server processed file: ${j.rows} rows inserted`, 'success');
    await loadSample(); // refresh preview
  } catch(err) {
    showMessage('Upload error: ' + err.message, 'error');
  }
});

async function loadSample(){
  try {
    const res = await fetch('/api/sample');
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || JSON.stringify(j));
    databasePreview = j.rows || [];
    renderPreview(databasePreview);
    showMessage('Loaded sample data from server', 'success');
  } catch(err){
    showMessage('Could not load sample: ' + err.message, 'error');
  }
}

function clearClientData(){
  databasePreview = [];
  document.getElementById('dataInfo').style.display = 'none';
  document.getElementById('resultsArea').innerHTML = '<div class="message info"><span>ℹ️</span><span>Cleared client view</span></div>';
  document.getElementById('resultsStats').textContent = 'Ready';
}

function exportClientData(){
  if (!databasePreview || databasePreview.length===0) { showMessage('No data to export', 'error'); return; }
  const cols = Object.keys(databasePreview[0]);
  const csv = [cols.join(',')].concat(databasePreview.map(r=>cols.map(c=>`"${(r[c]||'')}"`).join(','))).join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'export.csv';
  a.click();
  URL.revokeObjectURL(a.href);
  showMessage('Exported client preview as CSV', 'success');
}

function renderPreview(rows){
  const dataInfo = document.getElementById('dataInfo');
  if (!rows || rows.length===0) {
    dataInfo.style.display='none';
    document.getElementById('resultsArea').innerHTML = '<div class="message info"><span>ℹ️</span><span>No data loaded</span></div>';
    document.getElementById('resultsStats').textContent = '0 rows';
    return;
  }
  const cols = Object.keys(rows[0]);
  dataInfo.innerHTML = `<p><strong>Table:</strong> patients</p><p><strong>Columns:</strong> ${cols.join(', ')}</p>`;
  dataInfo.style.display='block';
  const table = ['<div class="table-container"><table class="results-table"><thead><tr>',
    cols.map(c=>`<th>${c}</th>`).join(''),
    '</tr></thead><tbody>',
    rows.map(r=>'<tr>'+cols.map(c=>`<td>${r[c]||''}</td>`).join('')+'</tr>').join(''),
    '</tbody></table></div>'].join('');
  document.getElementById('resultsArea').innerHTML = table;
  document.getElementById('resultsStats').textContent = `${rows.length} rows, ${cols.length} cols`;
}

function setQuery(q){ document.getElementById('queryInput').value = q; }

async function executeQuery(){
  const q = document.getElementById('queryInput').value.trim();
  if (!q) { showMessage('Enter SQL', 'error'); return; }
  const btn = document.getElementById('executeBtn'); btn.disabled=true; btn.innerText='Executing...';
  try {
    const res = await fetch('/api/query', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ sql: q }) });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || JSON.stringify(j));
    if (j.rows) {
      databasePreview = j.rows;
      renderPreview(databasePreview);
      showMessage('Query returned ' + j.rows.length + ' rows', 'success');
    } else if (j.info) {
      showMessage('Query executed: ' + JSON.stringify(j.info), 'success');
      // refresh preview
      await loadSample();
    } else {
      showMessage('Query executed', 'success');
    }
  } catch(err) {
    showMessage('Query error: ' + err.message, 'error');
  } finally {
    btn.disabled=false; btn.innerText='⚡ Execute Query';
  }
}

// UI helpers and theme
function showMessage(m, type='info'){
  const container = document.querySelector('.container');
  const div = document.createElement('div');
  div.className = 'message ' + (type||'info');
  const icon = type==='success'?'✅':type==='error'?'❌':'ℹ️';
  div.innerHTML = '<span>'+icon+'</span><span>'+m+'</span>';
  container.insertBefore(div, document.querySelector('.main-content'));
  setTimeout(()=>div.remove(), 4000);
}
function toggleTheme(){
  const body = document.body;
  const icon = document.getElementById('theme-icon');
  const text = document.getElementById('theme-text');
  if (body.getAttribute('data-theme')==='light'){ body.setAttribute('data-theme','dark'); icon.textContent='☀️'; text.textContent='Light Mode'; }
  else { body.setAttribute('data-theme','light'); icon.textContent='🌙'; text.textContent='Dark Mode'; }
}

// initial load
window.addEventListener('load', ()=>{ loadSample(); });
