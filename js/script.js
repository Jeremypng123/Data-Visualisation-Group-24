// js/script.js

document.addEventListener('DOMContentLoaded', () => {
  const fileInput = document.getElementById('csvFile');
  const loadSampleBtn = document.getElementById('loadSample');
  const statusEl = document.getElementById('status');
  const ctx = document.getElementById('departmentChart').getContext('2d');
  let chart = null;

  function setStatus(msg, isError = false) {
    statusEl.textContent = msg || '';
    statusEl.style.color = isError ? '#b91c1c' : '';
  }

  // split CSV line by commas not inside quotes
  function splitCSVLine(line) {
    return line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(s => {
      s = s.trim();
      if (s.startsWith('"') && s.endsWith('"')) {
        s = s.slice(1, -1).replace(/""/g, '"');
      }
      return s;
    });
  }

  function parseCSV(text) {
    const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim() !== '');
    if (lines.length === 0) return { header: [], rows: [] };
    const header = splitCSVLine(lines[0]).map(h => h.trim());
    const rows = lines.slice(1).map(line => {
      const cells = splitCSVLine(line);
      const obj = {};
      for (let i = 0; i < header.length; i++) {
        obj[header[i]] = cells[i] !== undefined ? cells[i] : '';
      }
      return obj;
    });
    return { header, rows };
  }

  function findColumn(headers, matchers) {
    const lower = headers.map(h => (h || '').toLowerCase());
    for (const m of matchers) {
      const idx = lower.findIndex(h => h.includes(m));
      if (idx >= 0) return headers[idx];
    }
    return null;
  }

  function aggregateByDepartment(rows, deptCol, billCol) {
    const totals = {};
    rows.forEach(r => {
      const dept = (r[deptCol] || 'Unknown').trim() || 'Unknown';
      const raw = (r[billCol] || '').replace(/[^0-9.\-]/g, '');
      const num = parseFloat(raw);
      const val = Number.isFinite(num) ? num : 0;
      totals[dept] = (totals[dept] || 0) + val;
    });
    return totals;
  }

  function renderChart(totals) {
    const labels = Object.keys(totals).sort((a,b) => totals[b] - totals[a]);
    const data = labels.map(l => Math.round((totals[l] + Number.EPSILON) * 100) / 100);
    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Total Bill',
          data,
          backgroundColor: labels.map((_, i) => `hsl(${(i*50)%360} 65% 55%)`),
          borderRadius: 6,
          barPercentage: 0.7,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            ticks: { color: '#0f172a' },
            grid: { display: false }
          },
          y: {
            beginAtZero: true,
            ticks: { color: '#0f172a' },
            grid: { color: 'rgba(15,23,42,0.06)' }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => `Total: $${ctx.formattedValue}`
            }
          }
        }
      }
    });
  }

  function processCSVText(text) {
    try {
      const { header, rows } = parseCSV(text);
      if (header.length === 0 || rows.length === 0) {
        setStatus('CSV appears empty or invalid.', true);
        return;
      }

      const deptCol = findColumn(header, ['department', 'dept']);
      const billCol = findColumn(header, ['bill', 'amount', 'charge', 'total']);
      if (!deptCol || !billCol) {
        setStatus('Could not detect Department or Bill column. Ensure CSV headers contain "Department" and "Bill/Amount".', true);
        return;
      }

      const totals = aggregateByDepartment(rows, deptCol, billCol);
      renderChart(totals);
      setStatus(`Loaded ${rows.length} rows. Displaying ${Object.keys(totals).length} departments.`);
    } catch (err) {
      console.error(err);
      setStatus('Error parsing CSV.', true);
    }
  }

  // load sample CSV from data folder
  async function loadSample() {
    try {
      setStatus('Loading sample...');
      const res = await fetch('data/dataset.csv');
      if (!res.ok) throw new Error('Failed to fetch sample CSV');
      const text = await res.text();
      processCSVText(text);
    } catch (err) {
      console.error(err);
      setStatus('Could not load sample CSV.', true);
    }
  }

  // file input handler
  fileInput.addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      processCSVText(String(ev.target.result || ''));
    };
    reader.onerror = () => setStatus('Failed to read file.', true);
    reader.readAsText(f);
  });

  loadSampleBtn.addEventListener('click', () => loadSample());

  // Load sample on first open
  loadSample();
});
