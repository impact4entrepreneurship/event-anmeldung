// Reine Logik ohne Browser- oder Datenbankzugriff (mit node --test getestet).

const TZ = 'Europe/Berlin';
const STATUS_LABELS = { confirmed: 'Zugesagt', maybe: 'Vielleicht', cancelled: 'Abgesagt' };

export const normalizeEmail = (s) => String(s ?? '').trim().toLowerCase();

export const statusLabel = (status) => STATUS_LABELS[status] ?? status;

export const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

const stripTags = (html) =>
  String(html ?? '')
    .replace(/<\/(p|li)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .trim();

const parseParts = (ev) => {
  const [y, mo, d] = ev.date.split('-').map(Number);
  const [h, mi] = ev.time.split(':').map(Number);
  return { y, mo, d, h, mi };
};

// Offset (in Minuten) von Berlin gegenüber UTC zum Zeitpunkt `date`.
const berlinOffsetMinutes = (date) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit',
      day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(date).map((x) => [x.type, x.value]),
  );
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
};

export const eventStart = (ev) => {
  const { y, mo, d, h, mi } = parseParts(ev);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let guess = new Date(wall - berlinOffsetMinutes(new Date(wall)) * 60000);
  guess = new Date(wall - berlinOffsetMinutes(guess) * 60000);
  return guess;
};

export const daysUntil = (ev, now = new Date()) =>
  Math.floor((eventStart(ev).getTime() - now.getTime()) / 86400000);

export const countGuests = (guests) => {
  let confirmed = 0;
  let maybe = 0;
  for (const g of guests) {
    const persons = 1 + (Number(g.plus_ones) || 0);
    if (g.status === 'confirmed') confirmed += persons;
    else if (g.status === 'maybe') maybe += persons;
  }
  return { confirmed, maybe, total: confirmed + maybe };
};

const pad = (n) => String(n).padStart(2, '0');

// Wandzeit (ohne Zeitzonenumrechnung) als YYYYMMDDTHHMMSS, plus Dauer.
const wallStamps = (ev, durationHours) => {
  const { y, mo, d, h, mi } = parseParts(ev);
  const fmt = (t) => {
    const x = new Date(t);
    return `${x.getUTCFullYear()}${pad(x.getUTCMonth() + 1)}${pad(x.getUTCDate())}`
      + `T${pad(x.getUTCHours())}${pad(x.getUTCMinutes())}00`;
  };
  const start = Date.UTC(y, mo - 1, d, h, mi);
  return { start: fmt(start), end: fmt(start + durationHours * 3600000) };
};

export const googleCalendarUrl = (ev, durationHours = 2) => {
  const { start, end } = wallStamps(ev, durationHours);
  const q = [
    ['action', 'TEMPLATE'],
    ['text', ev.title],
    ['dates', `${start}/${end}`],
    ['details', stripTags(ev.description)],
    ['location', ev.location ?? ''],
    ['ctz', TZ],
  ].map(([k, v]) => (k === 'action' || k === 'dates' ? `${k}=${v}` : `${k}=${encodeURIComponent(v)}`));
  return `https://calendar.google.com/calendar/render?${q.join('&')}`;
};

const icsEscape = (s) =>
  String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

const utf8 = new TextEncoder();

// Zeilen auf höchstens 75 Bytes falten (Fortsetzungszeile beginnt mit Leerzeichen).
const foldLine = (line) => {
  const out = [];
  let cur = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = utf8.encode(ch).length;
    if (bytes + b > limit) {
      out.push(cur);
      cur = ' ';
      bytes = 1;
      limit = 75;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n');
};

export const buildIcs = (ev, uid, durationHours = 2) => {
  const { start, end } = wallStamps(ev, durationHours);
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`
    + `T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Impact4Entrepreneurship//Event-Anmeldung//DE',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=${TZ}:${start}`,
    `DTEND;TZID=${TZ}:${end}`,
    `SUMMARY:${icsEscape(ev.title)}`,
    `LOCATION:${icsEscape(ev.location)}`,
    `DESCRIPTION:${icsEscape(stripTags(ev.description))}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join('\r\n') + '\r\n';
};

const csvCell = (value) => {
  let s = String(value ?? '');
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const berlinDateTime = (iso) =>
  new Intl.DateTimeFormat('de-DE', {
    timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));

export const guestsToCsv = (guests) => {
  const rows = [['Name', 'E-Mail', 'Status', 'Begleitpersonen', 'Essenswünsche', 'T-Shirt', 'Angemeldet am']];
  for (const g of guests) {
    rows.push([
      g.name, g.email, statusLabel(g.status), g.plus_ones ?? 0, g.dietary ?? '',
      g.custom_fields?.tshirt ?? '', g.created_at ? berlinDateTime(g.created_at) : '',
    ]);
  }
  return rows.map((r) => r.map(csvCell).join(';')).join('\r\n');
};

export const reminderText = (ev, link) => {
  const { y, mo, d } = parseParts(ev);
  const dateDe = new Date(Date.UTC(y, mo - 1, d, 12)).toLocaleDateString('de-DE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
  const lines = [
    'Guten Tag,',
    '',
    `wir erinnern Sie gern an unsere Veranstaltung „${ev.title}".`,
    '',
    `Wann: ${dateDe}, ${ev.time.slice(0, 5)} Uhr`,
  ];
  if (ev.location) lines.push(`Ort: ${ev.location}`);
  lines.push('', `Hier können Sie Ihre Anmeldung ansehen oder ändern: ${link}`, '', 'Wir freuen uns auf Sie!');
  return lines.join('\n');
};

// Dateiname-tauglicher Kurztext (Umlaute ausgeschrieben).
export const slugify = (s) =>
  String(s ?? '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'veranstaltung';

// Übersetzt Fehler von Supabase Auth in verständliches Deutsch und nennt bei Passwörtern
// die tatsächlich verletzte Regel (Länge, Zeichenarten, bekannte Datenlecks).
export const germanAuthError = (err) => {
  const msg = String(err?.message ?? '');
  const reasons = err?.reasons ?? [];
  if (/Invalid login credentials/i.test(msg)) return 'E-Mail oder Passwort stimmt nicht.';
  if (/already registered/i.test(msg)) return 'Mit dieser E-Mail gibt es schon ein Konto. Bitte melden Sie sich an.';
  if (/Email not confirmed/i.test(msg)) return 'Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse (Link in der Bestätigungsmail).';
  if (/different from the old password/i.test(msg)) return 'Das neue Passwort muss sich vom alten unterscheiden.';
  if (err?.code === 'weak_password' || /^Password should/i.test(msg)) {
    if (reasons.includes('pwned')) return 'Dieses Passwort ist aus bekannten Datenlecks bekannt. Bitte wählen Sie ein anderes.';
    const n = msg.match(/at least (\d+) characters/i);
    if (reasons.includes('length') || n) return `Das Passwort ist zu kurz (mindestens ${n ? n[1] : 8} Zeichen).`;
    if (/at least one character of each/i.test(msg)) {
      const kinds = [];
      if (/abcdefghijklmnopqrstuvwxyz/.test(msg)) kinds.push('Kleinbuchstaben');
      if (/ABCDEFGHIJKLMNOPQRSTUVWXYZ/.test(msg)) kinds.push('Großbuchstaben');
      if (/0123456789/.test(msg)) kinds.push('Ziffern');
      if (/[!@#$%^&*]/.test(msg)) kinds.push('Sonderzeichen');
      return `Das Passwort muss jeweils mindestens eines enthalten: ${kinds.join(', ')}.`;
    }
    return 'Das Passwort erfüllt die Sicherheitsregeln nicht. Bitte wählen Sie ein längeres, vielfältigeres Passwort.';
  }
  return 'Das hat nicht geklappt: ' + msg;
};

const dueLabel = (ev) => {
  const d = daysUntil(ev);
  if (d < 0) return 'vorbei';
  if (d === 0) return 'heute';
  if (d === 1) return 'morgen';
  return `in ${d} Tagen`;
};

// Karte für das Dashboard: Hauptbereich führt zur Gästeliste, darunter ein eigener
// Bearbeiten-Knopf (zwei getrennte Links, nie ineinander verschachtelt).
export const eventCardHtml = (ev, { confirmed, maybe }) => {
  const id = encodeURIComponent(ev.id);
  const dateDe = new Date(ev.date + 'T12:00:00Z').toLocaleDateString('de-DE', {
    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
  const pct = ev.capacity ? Math.min(100, Math.round((confirmed / ev.capacity) * 100)) : 0;
  const places = ev.capacity ? `${confirmed} von ${ev.capacity} Plätzen` : `${confirmed} zugesagt`;
  return `<div class="card event-card">
    <a class="card-link" href="event.html?id=${id}">
      <div class="row" style="align-items:baseline"><h2 style="margin:0">${escapeHtml(ev.title)}</h2>
        <span class="pill">${dueLabel(ev)}</span></div>
      <div class="muted small">${escapeHtml(dateDe)}, ${escapeHtml(ev.time.slice(0, 5))} Uhr · ${escapeHtml(ev.location)}</div>
      ${ev.capacity ? `<div class="bar"><i style="width:${pct}%"></i></div>` : '<div style="height:10px"></div>'}
      <div class="row"><span>${places}</span><span>${maybe ? maybe + ' vielleicht' : ''}</span></div>
    </a>
    <div class="btn-row" style="margin-top:12px">
      <a class="btn small" href="event-neu.html?id=${id}">Bearbeiten</a>
    </div>
  </div>`;
};
