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

  window.loadAndRenderPieChart = async function(urlOrRows, ctx, opts = {}){
    try{
      let rows, filename = '';
      if(typeof urlOrRows === 'string'){
        filename = urlOrRows;
        rows = await d3.csv(urlOrRows);
        console.log(`[pie_chart] loaded ${rows.length} rows from ${urlOrRows}`);
      } else {
        rows = Array.isArray(urlOrRows) ? urlOrRows : [];
      }
      if(!rows.length){ console.warn('[pie_chart] no rows to render'); return; }

      const headers = Object.keys(rows[0]);
      const catCol = findColumn(headers, opts.categoryColHint || ['category','type','label','name']);
      const valCol = findColumn(headers, opts.valueColHint || ['value','count','tests','amount','number','total']);
      if(!catCol || !valCol){ console.error('[pie_chart] missing required columns. Found headers:', headers); return; }

      // process values
      let total = 0;
      const items = [];
      rows.forEach(r => {
        const cat = (r[catCol] || 'Unknown').toString().trim() || 'Unknown';
        const raw = String(r[valCol]||'').replace(/[^0-9.\-]/g,'')
        const n = Number(raw);
        if(!Number.isFinite(n) || n <= 0) return;
        items.push({cat, val: n}); total += n;
      });
      if(!items.length){ console.warn('[pie_chart] no positive values found'); return; }

      // combine small slices (< threshold percent)
      const thresholdPct = opts.thresholdPct || 2;
      const sorted = items.sort((a,b)=>b.val-a.val);
      const big = [], small = [];
      sorted.forEach(it => (it.val / total * 100) < thresholdPct ? small.push(it) : big.push(it));
      if(small.length){
        const otherSum = small.reduce((s,i)=>s+i.val,0);
        big.push({cat:'Other', val: otherSum});
        console.log(`[pie_chart] combined ${small.length} small categories into Other (sum=${otherSum})`);
      }

      const labels = big.map(i=>i.cat);
      const values = big.map(i=>i.val);

      if(_chart) try{ _chart.destroy(); }catch(e){}
      _chart = new Chart(ctx, {
        type: 'pie',
        data: { labels, datasets: [{ data: values, backgroundColor: labels.map((_,i)=>`hsl(${(i*55)%360} 65% 55%)`), hoverOffset: 12 }] },
        options: {
          responsive:true,
          maintainAspectRatio:false,
          interaction: { mode: 'nearest', intersect: true },
          plugins: {
            title: { display: !!(opts.chartTitle || filename), text: opts.chartTitle || (filename ? `Pie — ${filename}` : 'Pie chart') },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const v = values[ctx.dataIndex];
                  const pct = total ? (v/total*100) : 0;
                  return `${labels[ctx.dataIndex]} — ${v.toLocaleString()} (${pct.toFixed(1)}%)`;
                }
              }
            },
            legend: { position: 'right' }
          },
          onHover: (evt, elements) => {
            evt.native.target.style.cursor = elements && elements.length ? 'pointer' : 'default';
          },
          animation: { duration: 350 }
        }
      });

      // clicking toggles selection (default toggles visibility) — log selection
      ctx.canvas.addEventListener('click', (ev) => {
        const points = _chart.getElementsAtEventForMode(ev, 'nearest', { intersect: true }, true);
        if(points.length) {
          const idx = points[0].index;
          console.log('[pie_chart] clicked slice:', labels[idx]);
        }
      });

      console.log(`[pie_chart] rendered ${labels.length} slices (total=${total})`);
      return _chart;
    }catch(err){
      console.error('[pie_chart] error', err);
    }
  };
})();
