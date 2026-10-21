import { sb, requireUser } from './supabase.js';
import { mountEditor } from './richtext.js';
import { renderShare } from './share.js';

const $ = (id) => document.getElementById(id);
const editId = new URLSearchParams(location.search).get('id');

const user = await requireUser();
let editor = mountEditor($('editor'), '');

function showError(text) {
  $('form-msg').textContent = text;
  $('form-msg').hidden = !text;
  if (text) window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updatePreview() {
  const url = $('cover_url').value.trim();
  const box = $('cover-preview');
  box.textContent = '';
  if (!url) return;
  const img = new Image();
  img.alt = 'Vorschau Titelbild';
  img.style.cssText = 'max-width:100%;max-height:140px;border-radius:8px;display:block;margin-top:4px';
  img.onload = () => box.appendChild(img);
  img.onerror = () => { box.textContent = 'Das Bild konnte nicht geladen werden. Es wird stattdessen ein Farbverlauf gezeigt.'; };
  img.src = url;
}
$('cover_url').addEventListener('change', updatePreview);

if (editId) {
  $('page-title').textContent = 'Veranstaltung bearbeiten';
  const { data: ev } = await sb.from('events').select('*').eq('id', editId).maybeSingle();
  if (!ev || ev.user_id !== user.id) {
    $('form-view').innerHTML = '<div class="card"><h2>Nicht gefunden</h2><p class="muted">Diese Veranstaltung gibt es nicht oder sie gehört Ihnen nicht.</p></div>';
  } else {
    $('title').value = ev.title;
    $('date').value = ev.date;
    $('time').value = ev.time.slice(0, 5);
    $('location').value = ev.location;
    $('cover_url').value = ev.cover_url;
    $('capacity').value = ev.capacity ?? '';
    $('cf-dietary').checked = !!ev.custom_fields_config?.dietary;
    $('cf-plus').checked = !!ev.custom_fields_config?.plus_ones;
    $('cf-tshirt').checked = !!ev.custom_fields_config?.tshirt;
    editor = mountEditor($('editor'), ev.description);
    updatePreview();
  }
}

$('event-form').onsubmit = async (e) => {
  e.preventDefault();
  showError('');
  const title = $('title').value.trim();
  const date = $('date').value;
  const time = $('time').value;
  const location_ = $('location').value.trim();
  const coverUrl = $('cover_url').value.trim();
  const capRaw = $('capacity').value.trim();
  if (!title || !date || !time || !location_) return showError('Bitte füllen Sie Titel, Datum, Uhrzeit und Ort aus.');
  if (coverUrl && !/^https?:\/\//i.test(coverUrl)) return showError('Die Bild-Adresse muss mit https:// beginnen.');
  if (capRaw && (!/^\d+$/.test(capRaw) || Number(capRaw) < 1)) return showError('Die Platzzahl muss eine ganze Zahl ab 1 sein.');

  const row = {
    title, date, time, location: location_,
    description: editor.getHtml(),
    cover_url: coverUrl,
    capacity: capRaw ? Number(capRaw) : null,
    custom_fields_config: {
      dietary: $('cf-dietary').checked,
      plus_ones: $('cf-plus').checked,
      tshirt: $('cf-tshirt').checked,
    },
  };
  $('save').disabled = true;
  const q = editId
    ? sb.from('events').update(row).eq('id', editId).select().single()
    : sb.from('events').insert({ ...row, user_id: user.id }).select().single();
  const { data, error } = await q;
  $('save').disabled = false;
  if (error) return showError('Speichern hat nicht geklappt: ' + error.message);

  $('form-view').hidden = true;
  $('done-view').hidden = false;
  $('to-guests').href = 'event.html?id=' + encodeURIComponent(data.id);
  await renderShare($('share'), data);
};
