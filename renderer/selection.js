const rectEl = document.getElementById('rect');

let start = null;
let current = null;
let dragging = false;

function normalizeRect(a, b) {
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x, b.x);
  const y2 = Math.max(a.y, b.y);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

function draw(r) {
  rectEl.style.display = 'block';
  rectEl.style.left = `${r.x}px`;
  rectEl.style.top = `${r.y}px`;
  rectEl.style.width = `${r.width}px`;
  rectEl.style.height = `${r.height}px`;
}

window.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  dragging = true;
  start = { x: e.clientX, y: e.clientY };
  current = start;
  draw({ x: start.x, y: start.y, width: 1, height: 1 });
});

window.addEventListener('mousemove', (e) => {
  if (!dragging || !start) return;
  current = { x: e.clientX, y: e.clientY };
  draw(normalizeRect(start, current));
});

window.addEventListener('mouseup', (e) => {
  if (e.button !== 0) return;
  if (!dragging || !start || !current) return;
  dragging = false;

  const r = normalizeRect(start, current);
  // Convert from window-relative client coords to absolute screen coords (DIP).
  window.leertexto.finishSelection({
    x: window.screenX + r.x,
    y: window.screenY + r.y,
    width: r.width,
    height: r.height,
  });
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.leertexto.cancelSelection();
});

window.focus();
