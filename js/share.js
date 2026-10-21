// Anmeldelink und QR-Code (PNG-Download). Erwartet das globale qrcode() der Bibliothek
// qrcode-generator (Script-Tag in der Seite).
import { slugify, escapeHtml } from './lib.js';

// Zeichnet den QR-Code quadratisch auf 512 px, mit 4 Modulen weißem Rand.
export function drawQr(canvas, text, size = 512) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 4;
  const cell = Math.floor(size / (n + quiet * 2));
  const px = cell * (n + quiet * 2);
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = '#26201B';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
    }
  }
}

export const registrationLink = (id) =>
  new URL('anmelden.html?e=' + encodeURIComponent(id), location.href).href;

export async function renderShare(el, ev) {
  const link = registrationLink(ev.id);
  el.innerHTML = `
    <label class="field"><span>Anmeldelink zum Teilen</span>
      <input type="text" readonly value="${escapeHtml(link)}"></label>
    <div class="btn-row" style="margin-bottom:16px">
      <button class="btn btn-primary" type="button" data-act="copy">Link kopieren</button>
    </div>
    <canvas id="qr-canvas" style="max-width:100%;height:auto;border:1px solid var(--linie);border-radius:8px;background:#fff"></canvas>
    <div class="btn-row" style="margin-top:12px">
      <button class="btn" type="button" data-act="png">QR-Code herunterladen (PNG)</button>
    </div>
    <p class="small muted" data-role="feedback" aria-live="polite"></p>`;
  const canvas = el.querySelector('#qr-canvas');
  drawQr(canvas, link);
  const note = el.querySelector('[data-role=feedback]');
  el.querySelector('[data-act=copy]').onclick = async () => {
    const input = el.querySelector('input');
    input.focus();
    input.select();
    input.setSelectionRange(0, link.length);
    let ok = false;
    try { await navigator.clipboard.writeText(link); ok = true; } catch { /* Fallback unten */ }
    if (!ok) { try { ok = document.execCommand('copy'); } catch { ok = false; } }
    note.textContent = ok ? 'Link kopiert.' : 'Der Link ist markiert. Bitte mit Strg/Cmd + C kopieren.';
  };
  el.querySelector('[data-act=png]').onclick = () => {
    const a = document.createElement('a');
    a.download = `qr-${slugify(ev.title)}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  };
}
