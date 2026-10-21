import { sb } from './supabase.js';
import { daysUntil, countGuests, germanAuthError, eventCardHtml } from './lib.js';

const $ = (id) => document.getElementById(id);
let signUpMode = false;

function showMsg(text, ok = false) {
  const el = $('login-msg');
  el.textContent = text;
  el.className = 'msg ' + (ok ? 'msg-ok' : 'msg-error');
  el.hidden = !text;
}

function setMode(signUp) {
  signUpMode = signUp;
  $('login-title').textContent = signUp ? 'Konto erstellen' : 'Anmelden';
  $('login-submit').textContent = signUp ? 'Konto erstellen' : 'Anmelden';
  $('toggle-mode').textContent = signUp ? 'Schon ein Konto? Anmelden' : 'Noch kein Konto? Konto erstellen';
  $('password').autocomplete = signUp ? 'new-password' : 'current-password';
  showMsg('');
}

function bindLogin() {
  $('toggle-mode').onclick = (e) => { e.preventDefault(); setMode(!signUpMode); };
  $('forgot').onclick = async (e) => {
    e.preventDefault();
    const email = $('email').value.trim();
    if (!email) return showMsg('Bitte tragen Sie oben Ihre E-Mail-Adresse ein.');
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split('#')[0] });
    showMsg(error ? germanAuthError(error) : 'Wir haben Ihnen eine E-Mail zum Zurücksetzen geschickt.', !error);
  };
  $('login-form').onsubmit = async (e) => {
    e.preventDefault();
    const email = $('email').value.trim();
    const password = $('password').value;
    if (!email || password.length < 8) return showMsg('Bitte E-Mail und ein Passwort mit mindestens 8 Zeichen eingeben.');
    $('login-submit').disabled = true;
    const { data, error } = signUpMode
      ? await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.href.split('#')[0] } })
      : await sb.auth.signInWithPassword({ email, password });
    $('login-submit').disabled = false;
    if (error) return showMsg(germanAuthError(error));
    if (signUpMode && !data.session) {
      return showMsg('Fast geschafft: Wir haben Ihnen eine E-Mail zur Bestätigung geschickt.', true);
    }
    start();
  };
}

async function renderList(userId) {
  // Veranstaltungen sind für Gäste öffentlich lesbar – das Dashboard zeigt nur die eigenen.
  const [evRes, gRes] = await Promise.all([
    sb.from('events').select('*').eq('user_id', userId).order('date', { ascending: true }),
    sb.from('guests').select('event_id,status,plus_ones'),
  ]);
  if (evRes.error || gRes.error) {
    $('list').innerHTML = '<div class="msg msg-error">Die Veranstaltungen konnten nicht geladen werden.</div>';
    return;
  }
  const mine = evRes.data;
  if (!mine.length) {
    $('list').innerHTML = '<div class="card"><h2>Noch keine Veranstaltung</h2>'
      + '<p class="muted">Legen Sie Ihre erste Veranstaltung an und teilen Sie den Anmeldelink.</p>'
      + '<a class="btn btn-primary" href="event-neu.html">Veranstaltung anlegen</a></div>';
    return;
  }
  const byEvent = new Map();
  for (const g of gRes.data) {
    if (!byEvent.has(g.event_id)) byEvent.set(g.event_id, []);
    byEvent.get(g.event_id).push(g);
  }
  const upcoming = mine.filter((e) => daysUntil(e) >= 0);
  const past = mine.filter((e) => daysUntil(e) < 0).reverse();
  $('list').innerHTML = [...upcoming, ...past]
    .map((ev) => eventCardHtml(ev, countGuests(byEvent.get(ev.id) ?? [])))
    .join('');
}

// Passwort zurücksetzen: Der Link in der Mail meldet mit einer Wiederherstellungs-Sitzung an;
// dann wird zuerst ein neues Passwort verlangt, erst danach das Dashboard gezeigt.
let recovering = /type=recovery/.test(location.hash);

function showRecovery() {
  recovering = true;
  $('login').hidden = true;
  $('app').hidden = true;
  $('recovery').hidden = false;
}

function bindRecovery() {
  sb.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY') showRecovery(); });
  $('recovery-form').onsubmit = async (e) => {
    e.preventDefault();
    const pw = $('new-password').value;
    const msg = $('recovery-msg');
    if (pw.length < 8) {
      msg.textContent = 'Das Passwort braucht mindestens 8 Zeichen.';
      msg.hidden = false;
      return;
    }
    const { error } = await sb.auth.updateUser({ password: pw });
    if (error) {
      msg.textContent = germanAuthError(error);
      msg.hidden = false;
      return;
    }
    recovering = false;
    history.replaceState(null, '', location.pathname);
    $('recovery').hidden = true;
    start();
  };
}

async function start() {
  if (recovering) return showRecovery();
  const { data } = await sb.auth.getSession();
  if (!data.session) {
    $('app').hidden = true;
    $('login').hidden = false;
    return;
  }
  $('login').hidden = true;
  $('app').hidden = false;
  $('logout').onclick = async () => { await sb.auth.signOut(); location.reload(); };
  renderList(data.session.user.id);
}

bindLogin();
bindRecovery();
start();
