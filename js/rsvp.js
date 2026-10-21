import { sb } from './supabase.js';
import { googleCalendarUrl, buildIcs, escapeHtml, eventStart, slugify } from './lib.js';
import { sanitizeRich } from './richtext.js';

const $ = (id) => document.getElementById(id);
const eventId = new URLSearchParams(location.search).get('e');

const ERRORS = {
  full: 'Leider sind alle Plätze vergeben. Sie können sich als „Vielleicht" eintragen.',
  event_past: 'Diese Veranstaltung ist vorbei. Anmeldungen sind nicht mehr möglich.',
  event_not_found: 'Diese Veranstaltung wurde nicht gefunden.',
  invalid: 'Bitte prüfen Sie Ihre Angaben (Name, E-Mail-Adresse, Begleitpersonen).',
};

function notFound() {
  $('loading').hidden = true;
  $('notfound').hidden = false;
}

async function load() {
  if (!eventId) return notFound();
  const { data: ev, error } = await sb.from('events').select('*').eq('id', eventId).maybeSingle();
  if (error || !ev) return notFound();
  return ev;
}

function showCover(ev) {
  if (!ev.cover_url) return;
  const img = new Image();
  img.onload = () => {
    $('cover').style.backgroundImage =
      `linear-gradient(rgba(38,32,27,.15), rgba(38,32,27,.55)), url("${ev.cover_url.replace(/"/g, '%22')}")`;
  };
  img.src = ev.cover_url; // bei Ladefehler bleibt der Farbverlauf
}

function render(ev) {
  document.title = `${ev.title} – Anmeldung`;
  $('ev-title').textContent = ev.title;
  const dateDe = new Date(ev.date + 'T12:00:00Z').toLocaleDateString('de-DE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
  $('ev-meta').innerHTML =
    `<span><b>${escapeHtml(dateDe)}</b></span><span><b>${escapeHtml(ev.time.slice(0, 5))} Uhr</b></span>`
    + (ev.location ? `<span>${escapeHtml(ev.location)}</span>` : '');
  $('ev-desc').innerHTML = sanitizeRich(ev.description);
  showCover(ev);

  const cfg = ev.custom_fields_config ?? {};
  $('f-plus').hidden = !cfg.plus_ones;
  $('f-dietary').hidden = !cfg.dietary;
  $('f-tshirt').hidden = !cfg.tshirt;
  $('plus_ones').innerHTML = Array.from({ length: 11 }, (_, i) => `<option value="${i}">${i}</option>`).join('');

  if (eventStart(ev) < new Date()) {
    $('past').hidden = false;
    $('rsvp-form').hidden = true;
  }
  $('loading').hidden = true;
  $('page').hidden = false;
}

function showDone(ev, status, result) {
  $('rsvp-form').hidden = true;
  $('done').hidden = false;
  const updated = result === 'updated';
  $('done-title').textContent =
    status === 'cancelled' ? 'Schade, danke für Ihre Antwort.'
      : updated ? 'Ihre Antwort wurde aktualisiert.' : 'Sie sind angemeldet!';
  $('done-text').textContent =
    status === 'confirmed' ? 'Wir freuen uns auf Sie. Tragen Sie den Termin gleich in Ihren Kalender ein.'
      : status === 'maybe' ? 'Wir haben Sie als „Vielleicht" eingetragen. Sie können Ihre Antwort jederzeit mit derselben E-Mail-Adresse ändern.'
        : 'Falls sich etwas ändert, können Sie sich mit derselben E-Mail-Adresse jederzeit neu eintragen.';
  $('cal-buttons').hidden = status === 'cancelled';
  $('gcal').href = googleCalendarUrl(ev);
  $('ics').onclick = () => {
    const blob = new Blob([buildIcs(ev, `${ev.id}@event-anmeldung`)], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${slugify(ev.title)}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
}

const ev = await load();
if (ev) {
  render(ev);
  $('change').onclick = (e) => {
    e.preventDefault();
    $('done').hidden = true;
    $('rsvp-form').hidden = false;
  };
  $('rsvp-form').onsubmit = async (e) => {
    e.preventDefault();
    const msg = $('form-msg');
    msg.hidden = true;
    const name = $('name').value.trim();
    const email = $('email').value.trim();
    const status = document.querySelector('input[name=status]:checked').value;
    if (!name || !/^\S+@\S+\.\S+$/.test(email)) {
      msg.textContent = 'Bitte tragen Sie Ihren Namen und eine gültige E-Mail-Adresse ein.';
      msg.hidden = false;
      return;
    }
    const cfg = ev.custom_fields_config ?? {};
    $('send').disabled = true;
    const { data, error } = await sb.rpc('rsvp_upsert', {
      p_event_id: ev.id,
      p_name: name,
      p_email: email,
      p_status: status,
      p_plus_ones: cfg.plus_ones ? Number($('plus_ones').value) : 0,
      p_dietary: cfg.dietary ? $('dietary').value.trim() : null,
      p_custom: cfg.tshirt && $('tshirt').value ? { tshirt: $('tshirt').value } : {},
    });
    $('send').disabled = false;
    if (error || !data) {
      msg.textContent = 'Das hat leider nicht geklappt. Bitte versuchen Sie es noch einmal.';
      msg.hidden = false;
    } else if (!data.ok) {
      msg.textContent = ERRORS[data.error] ?? ERRORS.invalid;
      msg.hidden = false;
    } else {
      showDone(ev, status, data.result);
    }
  };
}
