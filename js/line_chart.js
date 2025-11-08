(function(){
  let _chart = null;

  function findColumn(headers, hints){
    const lower = headers.map(h => (h||'').toLowerCase());
    for(const h of hints){
      const idx = lower.findIndex(x => x.includes(h));
      if(idx >= 0) return headers[idx];
    }
    return null;
  }

  function toDateOrYear(val){
    if(val === undefined || val === null) return null;
    const s = String(val).trim();
    if(!s) return null;
    // try year only (YYYY)
    const y = parseInt(s,10);
    if(!isNaN(y) && String(y).length === 4) return { type:'year', value: String(y) };
    // try full date
    const d = new Date(s);
    if(!isNaN(d)) return { type:'date', value: d.toISOString().slice(0,10) };
    return null;
  }

  function cleanNumber(raw){
    const n = Number(String(raw||'').replace(/[^0-9.\-]/g,''));
    return Number.isFinite(n) ? n : NaN;
  }

  function distinctColors(n){
    const colors = [];
    for(let i=0;i<n;i++){
      const h = (i * 47) % 360; // varied hues
      colors.push(`hsl(${h} 65% 50%)`);
    }
    return colors;
  }

  // Accepts either a CSV URL or an array of parsed rows
  window.loadAndRenderLineChart = async function(urlOrRows, ctx, opts = {}){
    try{
      let rows = [];
      let filename = '';
      if(typeof urlOrRows === 'string'){
        filename = urlOrRows;
        rows = await d3.csv(urlOrRows);
        console.log(`[line_chart] loaded ${rows.length} rows from ${urlOrRows}`);
      } else {
        rows = Array.isArray(urlOrRows) ? urlOrRows : [];
      }
      if(!rows.length){ console.warn('[line_chart] no rows to render'); return; }

      const headers = Object.keys(rows[0] || {});
      // detect date/year column; fallback to first column
      const dateCol = findColumn(headers, opts.dateColHint || ['date','year','period','month']) || headers[0];
      // value columns: all other columns besides dateCol
      const valueCols = headers.filter(h => h !== dateCol);
      if(!valueCols.length){
        console.error('[line_chart] no value columns detected. Headers:', headers);
        return;
      }

      // Build labels (x axis) and per-series values
      const parsedPoints = []; // array of {label: string, raw: row}
      rows.forEach(r=>{
        const parsedDate = toDateOrYear(r[dateCol]);
        const label = parsedDate ? parsedDate.value : String(r[dateCol]||'').trim();
        parsedPoints.push({ label, raw: r });
      });

      // unique labels and sort (numeric-friendly)
      const labels = parsedPoints.map(p => p.label).slice();
      // sort labels using localeCompare numeric to ensure years ascend
      labels.sort((a,b) => a.localeCompare(b, undefined, { numeric: true }));

      // For each value column, build series aligned to sorted labels
      const series = valueCols.map(col => {
        const valuesByLabel = new Map();
        parsedPoints.forEach(p => {
          const val = cleanNumber(p.raw[col]);
          valuesByLabel.set(p.label, Number.isNaN(val) ? NaN : val);
        });
        const values = labels.map(lbl => valuesByLabel.get(lbl) ?? NaN);
        const validCount = values.filter(v => !Number.isNaN(v)).length;
        return { col, values, validCount };
      });

      // Filter out series with no valid numeric values
      const filteredSeries = series.filter(s => s.validCount > 0);
      if(!filteredSeries.length){
        console.warn('[line_chart] no valid numeric series to plot after parsing.');
        return;
      }

      // Optionally compute moving average per series
      const computeMovingAverage = (arr) => arr.map((_,i,ary) => {
        const window = [ary[i-1], ary[i], ary[i+1]].filter(v => v !== undefined && !Number.isNaN(v));
        if(!window.length) return NaN;
        const avg = window.reduce((s,v)=>s+v,0)/window.length;
        return Math.round((avg + Number.EPSILON) * 100) / 100;
      });

      // assign colors
      const colors = distinctColors(filteredSeries.length);

      // prepare datasets (build iteratively to avoid referencing dataset variable inside its own creation)
      const datasets = [];
      filteredSeries.forEach((s, i) => {
        const label = opts.labelMapper ? opts.labelMapper(s.col) : s.col;
        const mainData = s.values.map(v => Number.isNaN(v) ? null : v); // Chart.js treats null as gap
        datasets.push({
          label,
          data: mainData,
          borderColor: colors[i],
          backgroundColor: colors[i].replace('50%)', '15%)') || colors[i],
          tension: opts.tension ?? 0.2,
          fill: false,
          pointRadius: 4,
          pointHoverRadius: 7,
          pointHoverBorderWidth: 2
        });

        if(opts.movingAverage){
          const smooth = computeMovingAverage(s.values).map(v => Number.isNaN(v) ? null : v);
          datasets.push({
            label: label + ' (MA)',
            data: smooth,
            borderColor: '#888',
            backgroundColor: 'rgba(136,136,136,0.08)',
            tension: opts.tension ?? 0.2,
            fill: false,
            borderDash: [4,4],
            pointRadius: 0,
            pointHoverRadius: 4
          });
        }
      });

      // destroy previous
      if(_chart) try{ _chart.destroy(); }catch(e){}

      _chart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'nearest', intersect: false },
          plugins: {
            title: { display: !!(opts.chartTitle || filename), text: opts.chartTitle || (filename ? `Line — ${filename}` : 'Line chart') },
            tooltip: {
              callbacks: {
                // show label and formatted value
                label: (ctx) => {
                  const v = ctx.raw;
                  return `${ctx.dataset.label}: ${v === null ? 'N/A' : v.toLocaleString()}`;
                }
              }
            },
            legend: { position: 'top' }
          },
          scales: {
            x: {
              title: { display: true, text: opts.xLabel || dateCol },
              ticks: { maxRotation: 0, autoSkip: true }
            },
            y: {
              beginAtZero: true,
              title: { display: true, text: opts.yLabel || (valueCols.length === 1 ? valueCols[0] : 'Value') }
            }
          },
          onHover: (evt, elements) => {
            evt.native.target.style.cursor = elements && elements.length ? 'pointer' : 'default';
          },
          animation: { duration: 400 }
        }
      });

      console.log(`[line_chart] rendered ${datasets.length} dataset series (labels=${labels.length})`);
      return _chart;

    }catch(err){
      console.error('[line_chart] error', err);
    }
  };
})();
