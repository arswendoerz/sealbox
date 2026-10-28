// Runs in every page (isolated world). Shows a Sealbox button on login fields and fills a login the
// user picks. No imports: content scripts can't be modules. It never sees the vault key and asks
// the background for one username/password only after a trusted click.
(() => {
  if (window.__sealboxContent) return; // the popup may inject this again into an old tab
  window.__sealboxContent = true;

  const USERNAME_HINT = /user|email|e-mail|login|akun|account|phone|ponsel|identifier/i;
  const TEXTY = ['text', 'email', 'tel'];

  const usable = (el) => el instanceof HTMLInputElement && !el.disabled && !el.readOnly;

  // A "show password" button turns the field into type=text, so remember fields that were ever
  // password fields (and trust autocomplete hints) instead of only checking the current type.
  const seenPassword = new WeakSet();
  const markPasswords = (root = document) => root.querySelectorAll('input[type=password]').forEach((i) => seenPassword.add(i));
  const isPasswordField = (el) => el instanceof HTMLInputElement
    && (el.type === 'password' || seenPassword.has(el) || /current-password|new-password/i.test(el.autocomplete));
  const passwordFieldsIn = (scope) => [...scope.querySelectorAll('input')].filter(isPasswordField);
  const isUsernameField = (el) => TEXTY.includes(el.type) && !isPasswordField(el);

  function visible(el) {
    const r = el.getBoundingClientRect();
    return r.width > 20 && r.height > 10 && getComputedStyle(el).visibility !== 'hidden';
  }

  function eligible(el) {
    if (!usable(el)) return false;
    if (isPasswordField(el)) return true;
    if (!isUsernameField(el)) return false;
    if (/username|email/i.test(el.autocomplete) || el.type === 'email') return true;
    return passwordFieldsIn(el.form ?? document).length > 0 && USERNAME_HINT.test(`${el.name} ${el.id} ${el.placeholder}`);
  }

  // Sign-up and change-password fields, where a generated password makes sense.
  const NEW_HINT = /new|baru|confirm|konfirmasi|ulang|repeat|retype|register|daftar|signup|sign-up|create|buat/i;
  const OLD_HINT = /old|lama|current|sekarang|saat ini/i;
  function isNewPasswordField(el) {
    if (!isPasswordField(el)) return false;
    if (/new-password/i.test(el.autocomplete)) return true;
    if (/current-password/i.test(el.autocomplete) || OLD_HINT.test(`${el.name} ${el.id} ${el.placeholder}`)) return false;
    const pws = passwordFieldsIn(scopeOf(el));
    if (pws.length >= 3) return el !== pws[0]; // current, new, confirm
    if (pws.length === 2) return true; // new, confirm
    return NEW_HINT.test(`${el.name} ${el.id} ${el.placeholder} ${el.getAttribute('aria-label') ?? ''} ${location.pathname}`);
  }

  // Which fields get the generated password: the marked new-password fields; otherwise new +
  // confirm (the last two of three, leaving the current password alone), both of two, or just one.
  function newPasswordTargets(anchor) {
    const pws = passwordFieldsIn(scopeOf(anchor)).filter((i) => usable(i) && visible(i));
    const marked = pws.filter((i) => /new-password/i.test(i.autocomplete));
    if (marked.length) return marked;
    if (pws.length >= 3) return pws.slice(-2);
    if (pws.length === 2) return pws;
    return [anchor];
  }

  // Username + password fields around `anchor` (the focused field), or anywhere on the page.
  function fieldsFor(anchor, within) {
    const scope = within ?? anchor?.form ?? document;
    const inputs = [...scope.querySelectorAll('input')].filter((i) => usable(i) && visible(i));
    const pw = isPasswordField(anchor) ? anchor : inputs.find(isPasswordField) ?? null;
    const texty = inputs.filter(isUsernameField);
    let user = null;
    if (anchor && !isPasswordField(anchor)) user = anchor;
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
      .banner{position:fixed;top:12px;right:12px;width:320px;background:#fff;color:#1E1B4B;border:1px solid #E4E3EE;border-radius:12px;box-shadow:0 12px 32px -8px rgba(30,27,75,.35);padding:14px;display:none}
      .banner b{display:block;margin-bottom:2px}
      .banner .who{color:#6B6A80;font-size:12px;margin-bottom:12px;word-break:break-all}
      .banner .acts{display:flex;gap:6px;align-items:center}
      .banner .open{margin:0}
      .banner .later{border:1px solid #E4E3EE;border-radius:7px;padding:7px 10px;background:none;color:inherit;cursor:pointer}
      .banner .never{margin-left:auto;border:0;background:none;color:#6B6A80;cursor:pointer;font-size:12px;text-decoration:underline}
      .banner .err{color:#A32D2D;font-size:12px;margin-top:8px}
      @media (prefers-color-scheme:dark){.menu,.banner{background:#1C1B2E;color:#ECEBFA;border-color:#33314D}.row:hover,.row:focus{background:#2E2A5C}.row small,.msg,.head,.banner .who,.banner .never{color:#A3A1BD}.banner .later{border-color:#33314D}}
    </style>
    <button class="icon" title="Isi dengan Sealbox" aria-label="Isi dengan Sealbox">
      <svg viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#534AB7"/><rect x="5" y="7" width="14" height="3" rx="1" fill="#EEEDFE"/><rect x="6" y="10" width="12" height="8" rx="1.5" fill="#fff"/><circle cx="12" cy="10" r="3.2" fill="#F59E0B"/><circle cx="12" cy="9.6" r="1" fill="#3C3489"/></svg>
    </button>
    <div class="menu" role="listbox"></div>
    <div class="banner" role="dialog" aria-label="Sealbox"></div>`;
  const icon = root.querySelector('.icon');
  const menu = root.querySelector('.menu');
  const banner = root.querySelector('.banner');
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
    if (!r.blocked && isNewPasswordField(field)) {
      // Works while the vault is locked too: saving comes later, after the form is sent.
      const gen = document.createElement('button');
      gen.className = 'row';
      gen.append(line('', '✨ Buat password kuat'), Object.assign(document.createElement('small'), { textContent: 'Diisi ke kolom password dan konfirmasinya' }));
      gen.addEventListener('click', async (e) => {
        if (!e.isTrusted) return;
        const target = field;
        try {
          const username = fieldsFor(target, scopeOf(target)).user?.value ?? '';
          const { password, rulesFrom } = await ask('generate', { username });
          for (const el of newPasswordTargets(target)) setValue(el, password);
          menu.replaceChildren(line('head', 'Sealbox'), line('msg',
            `Password kuat (${password.length} karakter${rulesFrom ? `, sesuai aturan ${rulesFrom}` : ''}) sudah diisi. Sealbox menawarkan menyimpannya setelah form dikirim.`));
          setTimeout(closeMenu, 4000);
        } catch (err) {
          menu.replaceChildren(line('head', 'Sealbox'), line('msg', err.message));
        }
      });
      parts.push(gen);
    }
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
    if (el?.type === 'password') seenPassword.add(el);
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

  // ---- Saving logins: capture on submit, offer in a banner (top frame) ----

  const SUBMIT_TEXT = /masuk|login|log in|sign in|signin|daftar|sign up|register|lanjut|continue|next|submit|kirim|simpan|save|update|ubah|ganti/i;

  function capture(scope) {
    const pws = passwordFieldsIn(scope).filter((i) => i.value);
    if (!pws.length) {
      // Step 1 of a two-step login: remember the username for the password page.
      const u = [...scope.querySelectorAll('input')].find((i) => i.value && isUsernameField(i) && (i.type === 'email' || /username|email/i.test(i.autocomplete)));
      if (u) ask('rememberUsername', { username: u.value }).catch(() => {});
      return;
    }
    // Sign-up / change-password forms: the new password is marked, or typed twice.
    const values = pws.map((i) => i.value);
    const repeated = values.find((v, n) => values.indexOf(v) !== n);
    const pw = pws.find((i) => /new-password/i.test(i.autocomplete)) ?? pws.find((i) => i.value === repeated) ?? pws[0];
    const { user } = fieldsFor(pws[0], scope);
    ask('captured', { username: user?.value ?? '', password: pw.value }).catch(() => {});
  }

  // The form around `el`, or for form-less (single-page) logins the nearest container holding a
  // password field and a username field, so other forms on the page aren't mixed in.
  function scopeOf(el) {
    const form = el?.closest?.('form');
    if (form) return form;
    let withPassword = null;
    for (let n = el?.parentElement; n; n = n.parentElement) {
      if (!passwordFieldsIn(n).length) continue;
      withPassword ??= n;
      if ([...n.querySelectorAll('input')].some(isUsernameField)) return n;
    }
    return withPassword ?? document;
  }

  markPasswords();
  document.addEventListener('input', (e) => { if (e.target?.type === 'password') seenPassword.add(e.target); }, true);
  document.addEventListener('submit', (e) => capture(e.target), true);
  document.addEventListener('keydown', (e) => {
    const el = e.composedPath()[0];
    if (e.key === 'Enter' && el instanceof HTMLInputElement && eligible(el)) capture(scopeOf(el));
  }, true);
  document.addEventListener('click', (e) => {
    markPasswords(); // before the page's own handler can flip a field to type=text
    const btn = e.composedPath()[0]?.closest?.('button, input[type=submit], input[type=button], [role=button]');
    if (!btn || e.composedPath().includes(host)) return;
    const label = `${btn.textContent} ${btn.value ?? ''} ${btn.getAttribute('aria-label') ?? ''}`;
    if (btn.type === 'submit' || SUBMIT_TEXT.test(label)) capture(scopeOf(btn));
  }, true);

  function button(cls, text, onClick) {
    const b = document.createElement('button');
    b.className = cls;
    b.textContent = text;
    b.addEventListener('click', (e) => { if (e.isTrusted) onClick(b); }); // pages can't answer for the user
    return b;
  }

  function hideBanner() {
    banner.style.display = 'none';
    banner.replaceChildren();
  }

  async function answer(choice, b) {
    b.disabled = true;
    try {
      const r = await ask('respond', { choice });
      if (choice === 'save' && r.saved) {
        banner.replaceChildren(line('', 'Tersimpan di Sealbox.'));
        setTimeout(hideBanner, 2000);
      } else hideBanner();
    } catch (err) {
      b.disabled = false;
      banner.querySelector('.err')?.remove();
      banner.append(line('err', err.message));
    }
  }

  async function offerSave() {
    if (window.top !== window) return; // the banner lives in the top frame only
    let r;
    try {
      r = await ask('pendingOffer');
    } catch {
      return;
    }
    const o = r.offer;
    if (!o) return;
    if (!host.isConnected) document.documentElement.append(host);
    const title = document.createElement('b');
    const acts = document.createElement('div');
    acts.className = 'acts';
    if (o.locked) {
      title.textContent = `Simpan login untuk ${o.host}?`;
      acts.append(
        button('open', 'Buka Sealbox', () => ask('openPopup').catch(() => {
          banner.querySelector('.err')?.remove();
          banner.append(line('err', 'Klik ikon Sealbox di toolbar, lalu simpan dari sana.'));
        })),
        button('later', 'Nanti', (b) => answer('dismiss', b)),
      );
      banner.replaceChildren(title, line('who', 'Vault terkunci. Buka Sealbox untuk menyimpannya.'), acts);
    } else {
      title.textContent = o.kind === 'update' ? `Perbarui password di Sealbox?` : `Simpan login untuk ${o.host}?`;
      acts.append(
        button('open', o.kind === 'update' ? 'Perbarui' : 'Simpan', (b) => answer('save', b)),
        button('later', 'Nanti', (b) => answer('dismiss', b)),
      );
      if (o.kind === 'save') acts.append(button('never', 'Jangan untuk situs ini', (b) => answer('never', b)));
      banner.replaceChildren(title, line('who', `${o.username || '(tanpa username)'} · ${o.host}`), acts);
    }
    banner.style.display = 'block';
  }

  offerSave(); // after a login form navigated here

  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (sender.id !== chrome.runtime.id || sender.tab) return false;
    // Fill requested from the popup (top frame only; the background checked the site).
    if (msg?.type === 'sealbox:fill') {
      const anchor = eligible(document.activeElement) ? document.activeElement : null;
      reply({ ok: fillFields(anchor, msg) });
    }
    // A single-page login was submitted without navigating.
    if (msg?.type === 'sealbox:offer-ready') offerSave();
    return false;
  });
})();
