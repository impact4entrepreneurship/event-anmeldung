import { sb, requireUser } from './supabase.js';
import { countGuests, guestsToCsv, reminderText, escapeHtml, statusLabel, slugify } from './lib.js';
import { renderShare, registrationLink } from './share.js';

const $ = (id) => document.getElementById(id);
const eventId = new URLSearchParams(location.search).get('id');

const user = await requireUser();
let ev = null;
let guests = [];

async function loadEvent() {
  if (!eventId) return null;
  const { data, error } = await sb.from('events').select('*').eq('id', eventId).maybeSingle();
  return error || !data || data.user_id !== user.id ? null : data;
}

async function loadGuests() {
  const { data, error } = await sb.from('guests').select('*').eq('event_id', ev.id).order('created_at', { ascending: false });
  if (!error) guests = data;
  render();
}

const visible = () => {
  const q = $('search').value.trim().toLowerCase();
  const f = $('filter').value;
  return guests.filter((g) => (!f || g.status === f)
    && (!q || g.name.toLowerCase().includes(q) || g.email.toLowerCase().includes(q)));
};

const when = (iso) => new Date(iso).toLocaleString('de-DE', {
  timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

function render() {
  const c = countGuests(guests);
  $('n-confirmed').textContent = c.confirmed;
  $('n-maybe').textContent = c.maybe;
  $('n-total').textContent = ev.capacity ? `${c.confirmed} / ${ev.capacity}` : c.total;
  $('cap-label').textContent = ev.capacity ? 'Zugesagt von Plätzen' : 'Gesamt';

  const cfg = ev.custom_fields_config ?? {};
  const rows = visible();
  if (!rows.length) {
    $('table').innerHTML = `<div class="card muted">${guests.length ? 'Keine Treffer.' : 'Noch keine Anmeldungen.'}</div>`;
    return;
  }
  $('table').innerHTML = `<table class="list"><thead><tr>
      <th>Name</th><th>E-Mail</th><th>Status</th><th>Begleitung</th>
      ${cfg.dietary ? '<th>Essen</th>' : ''}${cfg.tshirt ? '<th>T-Shirt</th>' : ''}<th>Angemeldet</th><th></th></tr></thead><tbody>
    ${rows.map((g) => `<tr>
      <td data-l="Name">${escapeHtml(g.name)}</td>
      <td data-l="E-Mail">${escapeHtml(g.email)}</td>
      <td data-l="Status" class="st-${escapeHtml(g.status)}">${escapeHtml(statusLabel(g.status))}</td>
      <td data-l="Begleitung">${Number(g.plus_ones) || 0}</td>
      ${cfg.dietary ? `<td data-l="Essen">${escapeHtml(g.dietary ?? '')}</td>` : ''}
      ${cfg.tshirt ? `<td data-l="T-Shirt">${escapeHtml(g.custom_fields?.tshirt ?? '')}</td>` : ''}
      <td data-l="Angemeldet">${escapeHtml(when(g.created_at))}</td>
      <td><button class="btn btn-danger small" data-del="${escapeHtml(g.id)}" type="button">Löschen</button></td></tr>`).join('')}
    </tbody></table>`;
}

let feedbackTimer;
function say(text) {
  $('feedback').textContent = text;
  clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => { $('feedback').textContent = ''; }, 4000);
}

ev = await loadEvent();
if (!ev) {
  $('notfound').hidden = false;
} else {
  $('content').hidden = false;
  document.title = `Gäste – ${ev.title}`;
  $('ev-title').textContent = ev.title;
  const dateDe = new Date(ev.date + 'T12:00:00Z').toLocaleDateString('de-DE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
  $('ev-meta').textContent = `${dateDe}, ${ev.time.slice(0, 5)} Uhr${ev.location ? ' · ' + ev.location : ''}`;
  $('edit').href = 'event-neu.html?id=' + encodeURIComponent(ev.id);

  $('search').oninput = render;
  $('filter').onchange = render;

  $('share-open').onclick = async () => {
    await renderShare($('share'), ev);
    $('share-dialog').showModal();
  };
  $('share-close').onclick = () => $('share-dialog').close();

  $('remind').onclick = async () => {
    try {
      await navigator.clipboard.writeText(reminderText(ev, registrationLink(ev.id)));
      say('Erinnerungstext kopiert. Sie können ihn jetzt in eine E-Mail einfügen.');
    } catch { say('Kopieren war nicht möglich. Bitte erlauben Sie den Zugriff auf die Zwischenablage.'); }
  };

  $('csv').onclick = () => {
    const blob = new Blob(['﻿' + guestsToCsv(visible())], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gaeste-${slugify(ev.title)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  $('table').onclick = async (e) => {
    const btn = e.target.closest('[data-del]');
    if (!btn) return;
    const g = guests.find((x) => x.id === btn.dataset.del);
    if (!g || !window.confirm(`„${g.name}" wirklich aus der Liste löschen?`)) return;
    const { error } = await sb.from('guests').delete().eq('id', g.id);
    if (error) say('Löschen hat nicht geklappt.'); else loadGuests();
  };

  await loadGuests();
  sb.channel('guests-' + ev.id)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'guests', filter: `event_id=eq.${ev.id}` }, loadGuests)
    .subscribe();
}
