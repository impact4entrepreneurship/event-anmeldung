// Einfacher Texteditor (fett, kursiv, Liste, Link) und Bereinigung des HTML.
// Erwartet, dass DOMPurify als globales Objekt geladen ist (Script-Tag in der Seite).

const ALLOWED_TAGS = ['b', 'strong', 'i', 'em', 'ul', 'ol', 'li', 'p', 'br', 'a', 'div'];

let hookSet = false;
export function sanitizeRich(html) {
  if (!hookSet) {
    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName === 'A') {
        node.setAttribute('rel', 'noopener noreferrer');
        node.setAttribute('target', '_blank');
      }
    });
    hookSet = true;
  }
  return DOMPurify.sanitize(String(html ?? ''), { ALLOWED_TAGS, ALLOWED_ATTR: ['href'] });
}

export function mountEditor(container, initialHtml) {
  container.innerHTML = `
    <div class="editor-bar">
      <button type="button" data-cmd="bold" title="Fett"><b>F</b></button>
      <button type="button" data-cmd="italic" title="Kursiv"><i>K</i></button>
      <button type="button" data-cmd="insertUnorderedList" title="Liste">• Liste</button>
      <button type="button" data-cmd="createLink" title="Link">Link</button>
    </div>
    <div class="editor-area" contenteditable="true" role="textbox" aria-multiline="true"></div>`;
  const area = container.querySelector('.editor-area');
  area.innerHTML = sanitizeRich(initialHtml);
  container.querySelector('.editor-bar').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    area.focus();
    if (btn.dataset.cmd === 'createLink') {
      const url = window.prompt('Adresse des Links (https://…)');
      if (url && /^(https?:\/\/|mailto:)/i.test(url.trim())) document.execCommand('createLink', false, url.trim());
    } else {
      document.execCommand(btn.dataset.cmd, false, null);
    }
  });
  // Eingefügten Text immer ohne fremde Formatierung übernehmen.
  area.addEventListener('paste', (e) => {
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  });
  return { getHtml: () => sanitizeRich(area.innerHTML) };
}
