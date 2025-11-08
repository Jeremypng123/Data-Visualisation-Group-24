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

  function aggregate(rows, labelCol, valueCol){
    const map = new Map();
    let dropped = 0;
    rows.forEach(r => {
      const label = (r[labelCol] || '').toString().trim() || null;
      if(!label){ dropped++; return; }
      const raw = String(r[valueCol] || '').replace(/[^0-9.\-]/g,'')
      const n = Number(raw);
      const val = Number.isFinite(n) ? n : NaN;
      if(Number.isNaN(val)){ dropped++; return; }
      map.set(label, (map.get(label) || 0) + val);
    });
    console.log(`[bar_chart] rows=${rows.length} aggregatedLabels=${map.size} droppedRows=${dropped}`);
    return {map, dropped};
  }

  function topNAndOther(map, topN){
    const items = Array.from(map.entries()).sort((a,b)=>b[1]-a[1]);
    if(items.length <= topN) return {labels: items.map(i=>i[0]), values: items.map(i=>i[1]), othersCount:0};
    const top = items.slice(0, topN);
    const rest = items.slice(topN);
    const otherSum = rest.reduce((s,[_k,v])=>s+v,0);
    const labels = top.map(i=>i[0]).concat(['Other']);
    const values = top.map(i=>i[1]).concat([otherSum]);
    console.log(`[bar_chart] collapsed ${rest.length} categories into Other (sum=${otherSum})`);
    return {labels, values, othersCount:rest.length};
  }

  window.loadAndRenderBarChart = async function(urlOrRows, ctx, opts = {}){
    // opts.labelColHint, opts.valueColHint, opts.topN
    try{
      let rows, filename = '';
      if(typeof urlOrRows === 'string'){
        filename = urlOrRows;
        rows = await d3.csv(urlOrRows);
        console.log(`[bar_chart] loaded ${rows.length} rows from ${urlOrRows}`);
      } else {
        rows = Array.isArray(urlOrRows) ? urlOrRows : [];
      }
      if(!rows.length){ console.warn('[bar_chart] no rows to render'); return; }

      const headers = Object.keys(rows[0]);
      const labelCol = findColumn(headers, opts.labelColHint || ['category','label','lga','name']);
      const valueCol = findColumn(headers, opts.valueColHint || ['value','count','tests','amount','number','total']);
      if(!labelCol || !valueCol){
        console.error('[bar_chart] missing required columns. Found headers:', headers);
        const missing = [];
        if(!labelCol) missing.push('labelCol');
        if(!valueCol) missing.push('valueCol');
        const msg = `Bar chart required columns missing: ${missing.join(', ')}`;
        // show friendly message in console and return
        console.error(msg);
        return;
      }

      // aggregate and cleanup
      const {map, dropped} = aggregate(rows, labelCol, valueCol);

      const topN = opts.topN || 12;
      const {labels, values} = topNAndOther(map, topN);

      const maxVal = Math.max(...values, 0);
      const yMax = Math.ceil(maxVal * 1.08) || 1;

      // destroy previous
      if(_chart) try{ _chart.destroy(); }catch(e){}

      _chart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: opts.valueLabel || valueCol,
            data: values,
            backgroundColor: labels.map((_,i)=>`hsl(${(i*40)%360} 65% 55%)`),
            borderColor: labels.map(()=> 'rgba(0,0,0,0.08)'),
            borderWidth: 1,
            hoverBorderWidth: 2
          }]
        },
        options: {
          responsive:true,
          maintainAspectRatio:false,
          interaction: { mode: 'nearest', intersect: false },
          plugins: {
            title: { display: !!(opts.chartTitle || filename), text: opts.chartTitle || (filename ? `Bar — ${filename}` : `Bar chart`) },
            tooltip: {
              enabled: true,
              callbacks: {
                label: ctx => {
                  const v = ctx.raw;
                  return `${ctx.label}: ${v.toLocaleString()}`;
                }
              }
            },
            legend: { display: false },
            datalabels: false
          },
          scales: {
            x: { title: { display:true, text: opts.xLabel || labelCol }, ticks: { autoSkip: true, maxRotation: 45, minRotation: 0 } },
            y: { beginAtZero:true, max: yMax, title: { display:true, text: opts.yLabel || valueCol } }
          },
          onHover: (evt, elements) => {
            evt.native.target.style.cursor = elements && elements.length ? 'pointer' : 'default';
          },
          onClick: (evt, elements) => {
            if(!elements.length) return;
            const idx = elements[0].index;
            const category = labels[idx];
            console.log('[bar_chart] clicked category:', category);
          },
          animation: { duration: 400 }
        }
      });

      // optional: show values on top for small number of categories
      if(labels.length <= 12){
        // draw values on bars using Chart.js plugin approach (simple)
        _chart.options.plugins.afterDatasetsDraw = function(chart){
          const ctx2 = chart.ctx;
          chart.data.datasets.forEach((ds, di) => {
            const meta = chart.getDatasetMeta(di);
            meta.data.forEach((bar, i) => {
              const val = ds.data[i];
              ctx2.save();
              ctx2.fillStyle = '#111827';
              ctx2.font = '12px sans-serif';
              ctx2.textAlign = 'center';
              ctx2.textBaseline = 'bottom';
              ctx2.fillText(val.toLocaleString(), bar.x, bar.y - 6);
              ctx2.restore();
            });
          });
        };
        _chart.update();
      }

      console.log(`[bar_chart] rendered ${labels.length} bars (source rows=${rows.length}, dropped=${dropped})`);
      return _chart;
    }catch(err){
      console.error('[bar_chart] error', err);
    }
  };
})();
