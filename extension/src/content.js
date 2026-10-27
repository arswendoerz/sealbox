// Runs in every page (isolated world). Shows a Sealbox button on login fields and fills a login the
// user picks. No imports: content scripts can't be modules. It never sees the vault key and asks
// the background for one username/password only after a trusted click.
(() => {
  if (window.__sealboxContent) return; // the popup may inject this again into an old tab
  window.__sealboxContent = true;

  const USERNAME_HINT = /user|email|e-mail|login|akun|account|phone|ponsel|identifier/i;
  const TEXTY = ['text', 'email', 'tel'];

  const usable = (el) => el instanceof HTMLInputElement && !el.disabled && !el.readOnly;

  function visible(el) {
    const r = el.getBoundingClientRect();
    return r.width > 20 && r.height > 10 && getComputedStyle(el).visibility !== 'hidden';
  }

  function eligible(el) {
    if (!usable(el)) return false;
    if (el.type === 'password') return true;
    if (!TEXTY.includes(el.type)) return false;
    if (/username|email/i.test(el.autocomplete) || el.type === 'email') return true;
    const scope = el.form ?? document;
    return !!scope.querySelector('input[type=password]') && USERNAME_HINT.test(`${el.name} ${el.id} ${el.placeholder}`);
  }

  // Username + password fields around `anchor` (the focused field), or anywhere on the page.
  function fieldsFor(anchor) {
    const scope = anchor?.form ?? document;
    const inputs = [...scope.querySelectorAll('input')].filter((i) => usable(i) && visible(i));
    const pw = anchor?.type === 'password' ? anchor : inputs.find((i) => i.type === 'password') ?? null;
    const texty = inputs.filter((i) => TEXTY.includes(i.type));
    let user = null;
    if (anchor && anchor.type !== 'password') user = anchor;
    else if (pw) user = texty.filter((i) => i.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING).pop() ?? null;
    else user = texty.find((i) => /username|email/i.test(i.autocomplete) || i.type === 'email') ?? null;
    return { user, pw };
  }

  // The prototype setter + input/change events also update React/Vue-controlled inputs.
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  function setValue(el, value) {
    el.focus();
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function fillFields(anchor, { username, password }) {
    const { user, pw } = fieldsFor(anchor);
    if (user && username) setValue(user, username);
    if (pw && password) setValue(pw, password);
    return !!(user || pw);
  }

  async function ask(type, payload) {
    const r = await chrome.runtime.sendMessage({ type, ...payload });
    if (!r?.ok) throw new Error(r?.error ?? 'Sealbox tidak merespons.');
    return r;
  }

  // ---- UI: one closed shadow root, so the page can't style or read it ----
  const host = document.createElement('sealbox-ui');
  host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;top:0;left:0;width:0;height:0';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `
    <style>
      *{box-sizing:border-box;font:13px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
      .icon{position:fixed;width:24px;height:24px;padding:3px;border:0;border-radius:6px;background:transparent;cursor:pointer;display:none}
      .icon:hover{background:rgba(83,74,183,.12)}
      .icon svg{width:18px;height:18px;display:block}
      .menu{position:fixed;width:280px;max-height:300px;overflow:auto;background:#fff;color:#1E1B4B;border:1px solid #E4E3EE;border-radius:10px;box-shadow:0 12px 32px -8px rgba(30,27,75,.35);display:none;padding:4px}
      .head{display:flex;align-items:center;gap:6px;padding:6px 8px;font-weight:600;font-size:12px;color:#6B6A80}
      .row{display:flex;flex-direction:column;align-items:flex-start;width:100%;text-align:left;border:0;background:none;padding:7px 10px;border-radius:7px;cursor:pointer;color:inherit}
      .row:hover,.row:focus{background:#EEEDFE;outline:0}
      .row small{color:#6B6A80;font-size:12px}
      .msg{padding:8px 10px;color:#6B6A80}
      .open{margin:2px 10px 8px;border:0;border-radius:7px;padding:7px 10px;background:linear-gradient(135deg,#4338CA,#7C3AED);color:#fff;cursor:pointer}
      @media (prefers-color-scheme:dark){.menu{background:#1C1B2E;color:#ECEBFA;border-color:#33314D}.row:hover,.row:focus{background:#2E2A5C}.row small,.msg,.head{color:#A3A1BD}}
    </style>
    <button class="icon" title="Isi dengan Sealbox" aria-label="Isi dengan Sealbox">
      <svg viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#534AB7"/><rect x="5" y="7" width="14" height="3" rx="1" fill="#EEEDFE"/><rect x="6" y="10" width="12" height="8" rx="1.5" fill="#fff"/><circle cx="12" cy="10" r="3.2" fill="#F59E0B"/><circle cx="12" cy="9.6" r="1" fill="#3C3489"/></svg>
    </button>
    <div class="menu" role="listbox"></div>`;
  const icon = root.querySelector('.icon');
  const menu = root.querySelector('.menu');
  let field = null; // the login field the UI is attached to
  let menuOpen = false;

  function place() {
    if (!field?.isConnected) return hide();
    const r = field.getBoundingClientRect();
    icon.style.left = `${r.right - 28}px`;
    icon.style.top = `${r.top + (r.height - 24) / 2}px`;
    menu.style.left = `${Math.max(4, Math.min(r.left, innerWidth - 284))}px`;
    menu.style.top = `${r.bottom + 4}px`;
  }

  function show(el) {
    field = el;
    if (!host.isConnected) document.documentElement.append(host);
    place();
    icon.style.display = 'block';
  }

  function hide() {
    icon.style.display = 'none';
    closeMenu();
    field = null;
  }

  function closeMenu() {
    menu.style.display = 'none';
    menu.replaceChildren();
    menuOpen = false;
  }

  function line(cls, text) {
    const el = document.createElement('div');
    el.className = cls;
    el.textContent = text;
    return el;
  }

  async function openMenu() {
    menuOpen = true;
    menu.replaceChildren(line('head', 'Sealbox'), line('msg', 'Memuat…'));
    menu.style.display = 'block';
    place();
    let r;
    try {
      r = await ask('matches');
    } catch (err) {
      menu.replaceChildren(line('head', 'Sealbox'), line('msg', err.message));
      return;
    }
    const parts = [line('head', 'Sealbox')];
    if (r.blocked) parts.push(line('msg', 'Isi otomatis tidak tersedia di frame ini.'));
    else if (r.locked) {
      parts.push(line('msg', 'Vault terkunci.'));
      const btn = document.createElement('button');
      btn.className = 'open';
      btn.textContent = 'Buka Sealbox';
      btn.addEventListener('click', (e) => {
        if (!e.isTrusted) return;
        ask('openPopup').catch(() => { btn.replaceWith(line('msg', 'Klik ikon Sealbox di toolbar untuk membuka vault.')); });
      });
      parts.push(btn);
    } else if (!r.items.length) parts.push(line('msg', 'Belum ada login tersimpan untuk situs ini.'));
    else {
      for (const item of r.items) {
        const btn = document.createElement('button');
        btn.className = 'row';
        btn.setAttribute('role', 'option');
        btn.append(line('', item.name), Object.assign(document.createElement('small'), { textContent: item.username || '—' }));
        btn.addEventListener('click', async (e) => {
          if (!e.isTrusted) return; // a page script can't trigger a fill
          const target = field;
          closeMenu();
          try {
            fillFields(target, await ask('fill', { id: item.id }));
          } catch (err) {
            menu.replaceChildren(line('head', 'Sealbox'), line('msg', err.message));
            menu.style.display = 'block';
          }
        });
        parts.push(btn);
      }
    }
    menu.replaceChildren(...parts);
  }

  // Keep focus on the field when the button is pressed.
  icon.addEventListener('mousedown', (e) => e.preventDefault());
  icon.addEventListener('click', (e) => {
    if (!e.isTrusted) return;
    if (menuOpen) closeMenu();
    else openMenu();
  });

  document.addEventListener('focusin', (e) => {
    const el = e.composedPath()[0];
    if (eligible(el) && visible(el)) show(el);
  }, true);

  document.addEventListener('focusout', () => {
    setTimeout(() => {
      if (!menuOpen && document.activeElement !== field) hide();
    }, 150);
  }, true);

  document.addEventListener('mousedown', (e) => {
    if (menuOpen && !e.composedPath().includes(host) && e.composedPath()[0] !== field) closeMenu();
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menuOpen) closeMenu();
  }, true);

  addEventListener('scroll', () => field && place(), true);
  addEventListener('resize', () => field && place());

  // Fill requested from the popup (top frame only; the background checked the site).
  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (sender.id !== chrome.runtime.id || sender.tab || msg?.type !== 'sealbox:fill') return false;
    const anchor = eligible(document.activeElement) ? document.activeElement : null;
    reply({ ok: fillFields(anchor, msg) });
    return false;
  });
})();
