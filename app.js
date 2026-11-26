/* Voronoi Treegraph Maker
 * Left: editable table (Level 1, Level 2, Level 3, Value)
 * Right: circular Voronoi treemap rendered with d3-voronoi-treemap
 */
(function () {
  'use strict';

  const SIZE = 1000;              // SVG viewBox size
  const RADIUS = 440;             // circle radius inside the viewBox (room for outer labels)
  const STORAGE_KEY = 'voronoi-treegraph-v1';

  const PALETTES = {
    vivid:   ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ff924c', '#52a675', '#f15bb5', '#00bbf9', '#9b5de5'],
    pastel:  ['#ffadad', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff', '#bdb2ff', '#ffc6ff', '#b8e0d2', '#eac4d5'],
    ocean:   ['#03045e', '#0077b6', '#00b4d8', '#48cae4', '#0096c7', '#023e8a', '#90e0ef', '#2a9d8f', '#264653', '#4cc9f0'],
    sunset:  ['#f94144', '#f3722c', '#f8961e', '#f9844a', '#f9c74f', '#e76f51', '#d62828', '#ff7b00', '#c9184a', '#ffb703'],
    forest:  ['#2d6a4f', '#40916c', '#52b788', '#74c69d', '#1b4332', '#95d5b2', '#606c38', '#a7c957', '#386641', '#6a994e'],
    rainbow: null,                // generated from d3.interpolateRainbow
    mono:    ['#222831', '#393e46', '#4f5660', '#6b7280', '#8a919c', '#a3a9b3', '#5c6470', '#30353c', '#767d88', '#454b55'],
  };

  const SAMPLE = [
    ['Technology', 'Software', 'Cloud', 42],
    ['Technology', 'Software', 'Security', 18],
    ['Technology', 'Software', 'AI', 35],
    ['Technology', 'Hardware', 'Chips', 30],
    ['Technology', 'Hardware', 'Devices', 22],
    ['Healthcare', 'Pharma', 'Vaccines', 20],
    ['Healthcare', 'Pharma', 'Generics', 12],
    ['Healthcare', 'Devices', 'Imaging', 14],
    ['Healthcare', 'Services', '', 16],
    ['Finance', 'Banking', 'Retail', 24],
    ['Finance', 'Banking', 'Investment', 19],
    ['Finance', 'Insurance', 'Life', 11],
    ['Finance', 'Insurance', 'Property', 9],
    ['Energy', 'Renewables', 'Solar', 15],
    ['Energy', 'Renewables', 'Wind', 13],
    ['Energy', 'Oil & Gas', '', 17],
    ['Consumer', 'Retail', 'Online', 21],
    ['Consumer', 'Retail', 'Stores', 10],
    ['Consumer', 'Food & Drink', '', 14],
  ];

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const tbody = document.querySelector('#data-table tbody');
  const chart = $('chart');
  const tooltip = $('tooltip');
  const status = $('status');

  let seed = 1;
  let lastSvg = null;

  // ---------- Table ----------
  function addRow(values = ['', '', '', ''], focus = false) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="idx"></td>
      <td><input data-col="0" placeholder="e.g. Category"></td>
      <td><input data-col="1" placeholder="—"></td>
      <td><input data-col="2" placeholder="—"></td>
      <td class="num"><input data-col="3" inputmode="decimal" placeholder="1"></td>
      <td class="del"><button type="button" title="Delete row" aria-label="Delete row">×</button></td>`;
    const inputs = tr.querySelectorAll('input');
    values.forEach((v, i) => { if (inputs[i]) inputs[i].value = v == null ? '' : v; });
    tbody.appendChild(tr);
    renumber();
    if (focus) inputs[0].focus();
    return tr;
  }

  function renumber() {
    [...tbody.rows].forEach((tr, i) => {
      const cell = tr.cells[0];
      const sw = cell.querySelector('.swatch');
      cell.textContent = i + 1;
      if (sw) cell.prepend(sw);
    });
  }

  function readRows() {
    return [...tbody.rows].map((tr) => [...tr.querySelectorAll('input')].map((i) => i.value.trim()));
  }

  function setRows(rows) {
    tbody.innerHTML = '';
    rows.forEach((r) => addRow(r));
    if (!rows.length) addRow();
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        rows: readRows(),
        palette: $('palette').value,
        labels: $('labels').value,
        showValues: $('show-values').checked,
      }));
    } catch (e) { /* storage unavailable: ignore */ }
  }

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (s && Array.isArray(s.rows)) {
        setRows(s.rows);
        if (s.palette) $('palette').value = s.palette;
        if (s.labels) $('labels').value = s.labels;
        $('show-values').checked = !!s.showValues;
        return true;
      }
    } catch (e) { /* ignore */ }
    return false;
  }

  tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('.del button');
    if (!btn) return;
    btn.closest('tr').remove();
    if (!tbody.rows.length) addRow();
    renumber();
    save();
  });

  tbody.addEventListener('input', (e) => {
    e.target.classList.remove('invalid');
    save();
  });

  // Enter moves down a row (adds one at the end); Ctrl/Cmd+Enter generates.
  tbody.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.matches('input')) return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) { generate(); return; }
    const col = e.target.dataset.col;
    let next = e.target.closest('tr').nextElementSibling;
    if (!next) next = addRow();
    next.querySelector(`input[data-col="${col}"]`).focus();
  });

  // Paste from spreadsheets: tab/newline separated blocks fill rows & columns.
  tbody.addEventListener('paste', (e) => {
    if (!e.target.matches('input')) return;
    const text = (e.clipboardData || window.clipboardData).getData('text');
    if (!/[\t\n]/.test(text)) return;
    e.preventDefault();
    const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '');
    const startCol = +e.target.dataset.col;
    let tr = e.target.closest('tr');
    lines.forEach((line, li) => {
      if (li > 0) tr = tr.nextElementSibling || addRow();
      const cells = line.split('\t');
      cells.forEach((val, ci) => {
        const input = tr.querySelector(`input[data-col="${startCol + ci}"]`);
        if (input) input.value = val.trim();
      });
    });
    renumber();
    save();
  });

  $('add-row').addEventListener('click', () => { addRow(undefined, true); save(); });
  $('sample').addEventListener('click', () => { setRows(SAMPLE.map((r) => r.map(String))); save(); generate(); });
  $('clear').addEventListener('click', () => {
    if (!confirm('Clear all rows?')) return;
    setRows([]); save(); drawEmpty();
  });
  $('generate').addEventListener('click', () => generate());
  $('reshuffle').addEventListener('click', () => { seed++; generate(); });
  ['palette', 'labels', 'show-values'].forEach((id) =>
    $(id).addEventListener('change', () => { save(); if (lastSvg) generate(true); }));

  // ---------- Data -> hierarchy ----------
  function buildHierarchy() {
    const root = { name: 'root', children: [] };
    const errors = [];
    [...tbody.rows].forEach((tr, i) => {
      const inputs = tr.querySelectorAll('input');
      const [l1, l2, l3, rawVal] = [...inputs].map((x) => x.value.trim());
      inputs.forEach((x) => x.classList.remove('invalid'));
      if (!l1 && !l2 && !l3 && !rawVal) return;   // fully empty row: skip silently
      if (!l1) { inputs[0].classList.add('invalid'); errors.push(`Row ${i + 1}: Level 1 is required`); return; }
      if (!l2 && l3) { inputs[1].classList.add('invalid'); errors.push(`Row ${i + 1}: Level 3 needs a Level 2`); return; }
      let value = rawVal === '' ? 1 : Number(rawVal.replace(/,/g, ''));
      if (!isFinite(value) || value <= 0) { inputs[3].classList.add('invalid'); errors.push(`Row ${i + 1}: value must be a positive number`); return; }

      const path = [l1, l2, l3].filter(Boolean);
      let node = root;
      path.forEach((name, depth) => {
        node.children = node.children || [];
        let child = node.children.find((c) => c.name === name);
        if (!child) { child = { name }; node.children.push(child); }
        if (depth === path.length - 1) child.own = (child.own || 0) + value;
        node = child;
      });
    });

    // A node can't be both a leaf and a parent: move its own value into an "(other)" child.
    (function fix(n) {
      if (n.children && n.children.length) {
        if (n.own) { n.children.push({ name: n.name, own: n.own, isRemainder: true }); delete n.own; }
        n.children.forEach(fix);
      } else {
        delete n.children;
      }
    })(root);

    return { root, errors };
  }

  // ---------- Colour ----------
  function topColors(n) {
    const key = $('palette').value;
    if (key === 'rainbow') return d3.range(n).map((i) => d3.interpolateRainbow(i / Math.max(n, 1)));
    const p = PALETTES[key];
    return d3.range(n).map((i) => {
      if (i < p.length) return p[i];
      // more categories than swatches: rotate hue for extra variety
      const c = d3.hsl(p[i % p.length]); c.h += 25 * Math.floor(i / p.length); return c.formatHex();
    });
  }

  function assignColors(root) {
    const tops = root.children || [];
    const cols = topColors(tops.length);
    tops.forEach((t, i) => { t.color = d3.hsl(cols[i]); spread(t); });

    function spread(node) {
      if (!node.children) return;
      const k = node.children.length;
      const span = node.depth === 1 ? 0.2 : 0.1;       // lightness spread
      const hueSpan = node.depth === 1 ? 14 : 6;
      node.children.forEach((c, j) => {
        const t = k === 1 ? 0 : j / (k - 1) - 0.5;      // -0.5 .. 0.5
        const h = d3.hsl(node.color);
        h.l = Math.max(0.12, Math.min(0.9, h.l + t * span));
        h.h = h.h + t * hueSpan;
        h.s = Math.min(1, h.s * (1 - Math.abs(t) * 0.15));
        c.color = h;
        spread(c);
      });
    }
  }

  function textColorFor(c) {
    const rgb = d3.rgb(c);
    const lum = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
    return lum > 0.6 ? '#1d1d1f' : '#ffffff';
  }

  // ---------- Rendering ----------
  function circlePolygon(r, cx, cy, n = 96) {
    return d3.range(n).map((i) => {
      const a = (i / n) * 2 * Math.PI;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    });
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const fmt = (v) => (Number.isInteger(v) ? d3.format(',')(v) : d3.format(',.2~f')(v));

  function drawEmpty(msg = 'Enter some data on the left and hit <b>Generate</b>.') {
    lastSvg = null;
    chart.innerHTML = `<div class="empty">${msg}</div>`;
  }

  function setStatus(msg, isError = false) {
    status.textContent = msg;
    status.classList.toggle('error', isError);
  }

  let cachedLayout = null;   // reuse polygons when only styling changes

  function generate(styleOnly = false) {
    const { root: data, errors } = buildHierarchy();
    if (errors.length) { setStatus(errors[0] + (errors.length > 1 ? ` (+${errors.length - 1} more)` : ''), true); return; }
    if (!data.children || !data.children.length) { setStatus('Add at least one row with a Level 1 name.', true); drawEmpty(); return; }

    setStatus('Generating…');
    // Let the status paint before the (synchronous) layout runs.
    setTimeout(() => {
      try {
        const key = JSON.stringify(data) + '|' + seed;
        let hierarchy;
        if (styleOnly && cachedLayout && cachedLayout.key === key) {
          hierarchy = cachedLayout.hierarchy;
        } else {
          hierarchy = d3.hierarchy(data, (d) => d.children).sum((d) => (d.children ? 0 : d.own));
          d3.voronoiTreemap()
            .clip(circlePolygon(RADIUS, SIZE / 2, SIZE / 2))
            .prng(mulberry32(seed * 9973))
            .convergenceRatio(0.005)
            .maxIterationCount(80)
            .minWeightRatio(0.01)(hierarchy);
          cachedLayout = { key, hierarchy };
        }
        assignColors(hierarchy);
        render(hierarchy);
        updateSwatches(hierarchy);
        const leaves = hierarchy.leaves().length;
        setStatus(`${hierarchy.children.length} groups · ${leaves} cells · total ${fmt(hierarchy.value)}`);
      } catch (err) {
        console.error(err);
        setStatus('Could not lay out this data: ' + err.message, true);
      }
    }, 20);
  }

  function updateSwatches(h) {
    const colorByTop = new Map((h.children || []).map((c) => [c.data.name, c.color.formatHex()]));
    [...tbody.rows].forEach((tr) => {
      const l1 = tr.querySelector('input[data-col="0"]').value.trim();
      const cell = tr.cells[0];
      let sw = cell.querySelector('.swatch');
      const col = colorByTop.get(l1);
      if (col) {
        if (!sw) { sw = document.createElement('span'); sw.className = 'swatch'; cell.prepend(sw); }
        sw.style.background = col;
      } else if (sw) sw.remove();
    });
  }

  function render(h) {
    const labelMode = $('labels').value;
    const showValues = $('show-values').checked;
    const total = h.value;
    const maxDepth = d3.max(h.leaves(), (d) => d.depth);

    const svg = d3.create('svg')
      .attr('xmlns', 'http://www.w3.org/2000/svg')
      .attr('viewBox', `0 0 ${SIZE} ${SIZE}`)
      .attr('width', SIZE).attr('height', SIZE)
      .style('width', '100%').style('height', '100%')
      .attr('font-family', 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif');

    const defs = svg.append('defs');
    defs.append('filter').attr('id', 'shadow').attr('x', '-10%').attr('y', '-10%').attr('width', '120%').attr('height', '120%')
      .append('feDropShadow').attr('dx', 0).attr('dy', 6).attr('stdDeviation', 10).attr('flood-opacity', 0.18);

    // backdrop circle
    svg.append('circle').attr('cx', SIZE / 2).attr('cy', SIZE / 2).attr('r', RADIUS)
      .attr('fill', '#fff').attr('filter', 'url(#shadow)');

    const line = (poly) => 'M' + poly.join('L') + 'Z';

    // filled leaf cells
    svg.append('g').selectAll('path').data(h.leaves()).join('path')
      .attr('class', 'cell')
      .attr('d', (d) => line(d.polygon))
      .attr('fill', (d) => d.color.formatHex())
      .attr('stroke', (d) => d.color.formatHex())
      .attr('stroke-width', 0.5)
      .on('mousemove', (e, d) => showTip(e, d, total))
      .on('mouseleave', hideTip);

    // borders: deeper first, so level-1 borders sit on top
    const borders = svg.append('g').attr('fill', 'none').attr('stroke', '#fff').attr('stroke-linejoin', 'round')
      .style('pointer-events', 'none');
    const widths = { 1: 7, 2: 3.5, 3: 1.5 };
    [3, 2, 1].forEach((depth) => {
      borders.selectAll(null).data(h.descendants().filter((d) => d.depth === depth)).join('path')
        .attr('d', (d) => line(d.polygon))
        .attr('stroke-width', widths[depth]);
    });
    borders.append('circle').attr('cx', SIZE / 2).attr('cy', SIZE / 2).attr('r', RADIUS).attr('stroke-width', 8);

    // labels
    const labels = svg.append('g').attr('text-anchor', 'middle').style('pointer-events', 'none');

    if (labelMode === 'leaf' || labelMode === 'both') {
      h.leaves().forEach((d) => {
        if (labelMode === 'both' && d.depth === 1) return; // drawn as top label instead
        placeLabel(labels, d, d.data.name, showValues ? fmt(d.value) : null, {
          maxFont: 30, minFont: 9, weight: 500, fill: textColorFor(d.color),
        });
      });
    }
    if (labelMode === 'top') {
      (h.children || []).forEach((d) => {
        placeLabel(labels, d, d.data.name.toUpperCase(), showValues ? fmt(d.value) : null, {
          maxFont: 44, minFont: 12, weight: 800, fill: '#fff', halo: true, letterSpacing: 0.06,
        });
      });
    }
    if (labelMode === 'both') rimLabels(svg, defs, h, showValues);

    chart.innerHTML = '';
    chart.appendChild(svg.node());
    lastSvg = svg.node();
  }

  // Level-1 names curved around the outside of the circle, centred on each group's arc.
  function rimLabels(svg, defs, h, showValues) {
    const c = SIZE / 2;
    const g = svg.append('g').attr('text-anchor', 'middle').style('pointer-events', 'none');
    (h.children || []).forEach((d, i) => {
      const angle = rimAngle(d.polygon);
      if (angle == null) return;
      const text = d.data.name.toUpperCase() + (showValues ? ' · ' + fmt(d.value) : '');
      const size = 22;
      const bottom = Math.sin(angle) > 0.05;              // lower half: flip so text reads upright
      const r = RADIUS + (bottom ? 14 + size * 0.75 : 16);
      const span = Math.min(Math.PI * 0.9, (text.length * size * 0.66) / r + 0.3) / 2;
      const a0 = bottom ? angle + span : angle - span;
      const a1 = bottom ? angle - span : angle + span;
      const id = 'rim-' + i;
      defs.append('path').attr('id', id).attr('d',
        `M${c + r * Math.cos(a0)},${c + r * Math.sin(a0)} A${r},${r} 0 0 ${bottom ? 0 : 1} ${c + r * Math.cos(a1)},${c + r * Math.sin(a1)}`);
      const col = d3.hsl(d.color); col.l = Math.min(col.l, 0.34); col.s = Math.min(1, col.s * 1.1);
      g.append('text').attr('font-size', size).attr('font-weight', 800).attr('letter-spacing', 1.5)
        .attr('fill', col.formatHex())
        .append('textPath').attr('href', '#' + id).attr('startOffset', '50%').text(text);
    });
  }

  // Mean angle of the polygon's vertices that lie on the outer circle (null if it never touches it).
  function rimAngle(poly) {
    const c = SIZE / 2;
    let sx = 0, sy = 0, n = 0;
    poly.forEach(([x, y]) => {
      if (Math.hypot(x - c, y - c) > RADIUS - 2) { const a = Math.atan2(y - c, x - c); sx += Math.cos(a); sy += Math.sin(a); n++; }
    });
    if (!n) return null;
    return Math.atan2(sy, sx);
  }

  // Fit a label into a polygon: size by area, shrink until it fits the polygon's inner width.
  function placeLabel(g, d, text, sub, o) {
    const poly = d.polygon;
    const [cx, cy] = d3.polygonCentroid(poly);
    const area = Math.abs(d3.polygonArea(poly));
    const width = innerWidthAt(poly, cy) * 0.86;
    const charW = 0.58 + (o.letterSpacing || 0);
    let size = Math.min(o.maxFont, Math.sqrt(area) / 5.5);
    const fitW = width / Math.max(1, text.length * charW);
    size = Math.min(size, fitW);

    let display = text;
    if (size < o.minFont) {
      // try truncating before giving up
      const maxChars = Math.floor(width / (o.minFont * charW));
      if (maxChars < 3) return;
      display = text.slice(0, maxChars - 1) + '…';
      size = o.minFont;
    }
    const height = Math.sqrt(area);
    if (size * (sub ? 2.2 : 1.1) > height * 0.8) return;

    const t = g.append('text')
      .attr('x', cx).attr('y', cy)
      .attr('font-size', size.toFixed(1))
      .attr('font-weight', o.weight)
      .attr('fill', o.fill)
      .attr('dominant-baseline', 'central');
    if (o.letterSpacing) t.attr('letter-spacing', (o.letterSpacing * size).toFixed(1));
    if (o.halo) {
      t.attr('stroke', 'rgba(0,0,0,0.35)').attr('stroke-width', size / 6).attr('paint-order', 'stroke')
        .attr('stroke-linejoin', 'round');
    }
    if (sub) {
      t.append('tspan').attr('x', cx).attr('dy', -size * 0.45).text(display);
      t.append('tspan').attr('x', cx).attr('dy', size * 1.1).attr('font-size', (size * 0.78).toFixed(1))
        .attr('font-weight', 400).attr('opacity', 0.85).text(sub);
    } else {
      t.text(display);
    }
  }

  // Horizontal width of a convex polygon at a given y.
  function innerWidthAt(poly, y) {
    const xs = [];
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i];
      const [x2, y2] = poly[(i + 1) % poly.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
    }
    if (xs.length < 2) return 0;
    return Math.max(...xs) - Math.min(...xs);
  }

  // ---------- Tooltip ----------
  function showTip(e, d, total) {
    const path = d.ancestors().reverse().slice(1).map((a) => a.data.name);
    tooltip.innerHTML =
      `<div class="path">${path.slice(0, -1).map(esc).join(' › ') || '&nbsp;'}</div>` +
      `<div><b>${esc(path[path.length - 1])}</b></div>` +
      `<div class="val">${fmt(d.value)} · ${d3.format('.1%')(d.value / total)}</div>`;
    tooltip.hidden = false;
    const pad = 14;
    let x = e.clientX + pad, y = e.clientY + pad;
    const r = tooltip.getBoundingClientRect();
    if (x + r.width > innerWidth) x = e.clientX - r.width - pad;
    if (y + r.height > innerHeight) y = e.clientY - r.height - pad;
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
  }
  function hideTip() { tooltip.hidden = true; }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- Export ----------
  function svgString() {
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(lastSvg);
  }
  function download(href, name) {
    const a = document.createElement('a');
    a.href = href; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  }
  $('dl-svg').addEventListener('click', () => {
    if (!lastSvg) return setStatus('Generate a graph first.', true);
    const url = URL.createObjectURL(new Blob([svgString()], { type: 'image/svg+xml' }));
    download(url, 'voronoi-treegraph.svg');
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('dl-png').addEventListener('click', () => {
    if (!lastSvg) return setStatus('Generate a graph first.', true);
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svgString()], { type: 'image/svg+xml' }));
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = SIZE * scale; canvas.height = SIZE * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        const purl = URL.createObjectURL(blob);
        download(purl, 'voronoi-treegraph.png');
        setTimeout(() => URL.revokeObjectURL(purl), 1000);
      }, 'image/png');
    };
    img.src = url;
  });

  // ---------- Init ----------
  if (!load()) setRows(SAMPLE.map((r) => r.map(String)));
  generate();
})();
