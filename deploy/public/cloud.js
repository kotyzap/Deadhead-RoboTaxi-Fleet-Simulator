/* ============================================================
   Deadhead — cloud saves client

   Self-contained on purpose: this file injects its own markup and CSS
   into the save manager, so deadhead.html knows nothing about accounts
   beyond `window.DH_REMOTE || LocalStore`. Delete this file and the game
   keeps working on local browser saves.

   THE PASSWORD NEVER LEAVES THIS FILE.
   PBKDF2 runs here, in the browser, and only the derived key is sent.
   That is not a purity exercise — the Workers free plan caps CPU at
   10 ms per request and PBKDF2 at a safe iteration count measures
   ~18.7 ms, so server-side hashing would fail every login with an
   opaque resource error. See the long comment in src/index.js.
   ============================================================ */
(function () {
  'use strict';

  const API = {
    params: '/api/params',
    register: '/api/register',
    login: '/api/login',
    logout: '/api/logout',
    me: '/api/me',
    saves: '/api/saves',
    save: (slot) => '/api/save/' + encodeURIComponent(slot),
  };

  /* Cloud writes for the 30-second autosave are coalesced to this
     interval. Local IndexedDB still gets every autosave, so nothing is
     lost — this only protects the 100,000 requests/day free allowance.
     At 30s unthrottled a single tab left open all day would spend 2,880
     requests; at 2 minutes it spends 720. */
  const CLOUD_AUTOSAVE_MS = 120000;

  const MIN_PASSWORD = 10;

  let kdfIters = 250000;          // replaced by /api/params before first use
  let saltPrefix = 'deadhead|';
  let paramsLoaded = false;
  let signedIn = null;            // email string when signed in
  let lastCloudAuto = 0;
  let pendingAuto = null;         // newest 'auto' snapshot not yet pushed

  const $ = (id) => document.getElementById(id);
  const enc = new TextEncoder();

  /* ---------------- crypto ---------------- */
  const toHex = (buf) =>
    [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

  async function deriveAuthKey(email, password) {
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        hash: 'SHA-256',
        salt: enc.encode(saltPrefix + email.trim().toLowerCase()),
        iterations: kdfIters,
      },
      key,
      256
    );
    return toHex(bits);
  }

  /* ---------------- transport ---------------- */
  async function req(url, opts = {}) {
    const res = await fetch(url, {
      credentials: 'same-origin',
      headers: opts.body ? { 'content-type': 'application/json' } : undefined,
      ...opts,
    });
    const text = await res.text();
    let data = null;
    if (text) { try { data = JSON.parse(text) } catch { /* non-JSON body */ } }
    if (!res.ok) {
      const msg = (data && data.error) || ('request failed (' + res.status + ')');
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function loadParams() {
    if (paramsLoaded) return;
    try {
      const p = await req(API.params);
      if (p && p.kdfIters > 0) kdfIters = p.kdfIters;
      if (p && typeof p.saltPrefix === 'string') saltPrefix = p.saltPrefix;
      paramsLoaded = true;
    } catch {
      // Fall through on the defaults. If they are wrong the server rejects
      // the login and the user sees a normal error.
    }
  }

  /* ---------------- the remote store ----------------
     Same four-method surface as LocalStore, so the dispatcher in
     deadhead.html needs no knowledge of any of this.

     Every write also lands locally. That means signing out, going
     offline or hitting a 500 can never cost the player their progress. */
  const Local = () => (window.DH_SAVE && window.DH_SAVE.LocalStore) || null;

  function localPut(k, v) {
    const L = Local();
    return L ? L.put(k, v).catch(() => {}) : Promise.resolve();
  }

  async function flushAuto() {
    if (!pendingAuto || !signedIn) return;
    const save = pendingAuto;
    pendingAuto = null;
    lastCloudAuto = Date.now();
    try {
      await req(API.save('auto'), { method: 'PUT', body: JSON.stringify(save) });
      setSyncNote('synced ' + new Date().toLocaleTimeString());
    } catch (e) {
      pendingAuto = save;          // keep it for the next attempt
      setSyncNote('offline — saved locally');
    }
  }

  const RemoteStore = {
    async get(k) {
      try {
        const data = await req(API.save(k));
        if (data) return data;
      } catch (e) {
        if (e.status === 401) signOutLocally();
      }
      // Nothing in the cloud, or the network failed: fall back to this
      // browser's copy rather than pretending there is no save.
      const L = Local();
      return L ? L.get(k).catch(() => undefined) : undefined;
    },

    async put(k, v) {
      await localPut(k, v);
      if (k === 'auto') {
        pendingAuto = v;
        if (Date.now() - lastCloudAuto < CLOUD_AUTOSAVE_MS) return { ok: true, deferred: true };
        return flushAuto();
      }
      try {
        await req(API.save(k), { method: 'PUT', body: JSON.stringify(v) });
        setSyncNote('synced ' + new Date().toLocaleTimeString());
        return { ok: true };
      } catch (e) {
        if (e.status === 401) signOutLocally();
        throw new Error(e.message + ' — kept in this browser');
      }
    },

    async del(k) {
      const L = Local();
      if (L) await L.del(k).catch(() => {});
      if (k === 'auto') pendingAuto = null;
      try {
        await req(API.save(k), { method: 'DELETE' });
      } catch (e) {
        if (e.status === 401) signOutLocally();
        throw e;
      }
    },

    async list() {
      try {
        return await req(API.saves);
      } catch (e) {
        if (e.status === 401) signOutLocally();
        const L = Local();
        if (L) return L.list();
        throw e;
      }
    },
  };

  /* Push whatever is pending when the tab goes away, so closing the
     browser does not lose up to two minutes of cloud progress. */
  function flushOnExit() {
    if (!pendingAuto || !signedIn) return;
    const body = JSON.stringify(pendingAuto);
    // keepalive lets the request outlive the page; sendBeacon cannot set
    // the method to PUT, so use fetch with keepalive.
    try {
      fetch(API.save('auto'), {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body,
        keepalive: true,
      });
      pendingAuto = null;
    } catch { /* nothing more we can do at this point */ }
  }
  window.addEventListener('pagehide', flushOnExit);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushOnExit();
  });

  /* ---------------- UI ---------------- */
  const CSS = `
.acct{padding:11px 13px;border:1px solid var(--brd);border-radius:8px;
  background:var(--c-card);margin:4px 0}
.acct-row{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.acct-lbl{font-size:10px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;
  color:var(--text-3);flex:0 0 auto}
.acct-row form{display:flex;gap:6px;flex:1;min-width:220px}
.acct-row input{flex:1;min-width:0;height:30px;padding:0 9px;font:inherit;font-size:12px;
  color:var(--text);background:var(--inset);border:1px solid var(--brd-2);border-radius:var(--r-ctl)}
.acct-row input:focus{outline:none;border-color:var(--accent)}
.acct-row button{height:30px;padding:0 12px;font:inherit;font-size:11.5px;cursor:pointer;
  border:1px solid var(--brd-2);border-radius:var(--r-ctl);background:transparent;
  color:var(--text);flex:0 0 auto}
.acct-row button.pri{background:var(--accent);border-color:var(--accent);color:#fff}
.acct-row button:disabled{opacity:.4;cursor:default}
.acct-row button:hover:not(:disabled):not(.pri){border-color:var(--accent);color:var(--accent)}
#dh-who{font-size:12.5px;font-weight:500;flex:1;min-width:0;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#dh-sync{font-size:10.5px;color:var(--text-3);flex:0 0 auto}
#dh-msg{font-size:11px;color:var(--s-crit);margin-top:7px}
#dh-msg.ok{color:var(--s-charge)}
#dh-msg:empty{margin-top:0}`;

  const HTML = `
<div class="acct" id="dh-acct">
  <div class="acct-row" id="dh-out">
    <span class="acct-lbl">Play across devices</span>
    <form id="dh-form" autocomplete="on">
      <input type="email" id="dh-email" placeholder="you@example.com"
             autocomplete="username" required>
      <input type="password" id="dh-pw" placeholder="password"
             autocomplete="current-password" minlength="${MIN_PASSWORD}" required>
      <button type="submit" class="pri" id="dh-login">Sign in</button>
      <button type="button" id="dh-reg">Create</button>
    </form>
  </div>
  <div class="acct-row" id="dh-in" hidden>
    <span class="acct-lbl">Signed in</span>
    <b id="dh-who">&mdash;</b>
    <span id="dh-sync"></span>
    <button type="button" id="dh-upload">Upload local</button>
    <button type="button" id="dh-out-btn">Sign out</button>
  </div>
  <div id="dh-msg"></div>
</div>`;

  function setSyncNote(t) {
    const el = $('dh-sync');
    if (el) el.textContent = t || '';
  }
  function msg(text, ok) {
    const el = $('dh-msg');
    if (!el) return;
    el.textContent = text || '';
    el.className = ok ? 'ok' : '';
  }
  function busy(state) {
    ['dh-login', 'dh-reg', 'dh-upload', 'dh-out-btn'].forEach((id) => {
      const b = $(id);
      if (b) b.disabled = state;
    });
  }

  function paintAuthState() {
    const out = $('dh-out'), inn = $('dh-in');
    if (!out || !inn) return;
    out.hidden = !!signedIn;
    inn.hidden = !signedIn;
    if (signedIn) $('dh-who').textContent = signedIn;
  }

  function signOutLocally() {
    signedIn = null;
    window.DH_REMOTE = null;
    pendingAuto = null;
    paintAuthState();
    msg('Signed out — saves are going to this browser only.');
  }

  function goOnline(email) {
    signedIn = email;
    window.DH_REMOTE = RemoteStore;
    paintAuthState();
    setSyncNote('');
    if (window.DH_SAVE && window.DH_SAVE.refresh) window.DH_SAVE.refresh();
  }

  async function submitAuth(mode) {
    const email = ($('dh-email').value || '').trim();
    const pw = $('dh-pw').value || '';
    if (!email) return msg('Enter your email address.');
    if (pw.length < MIN_PASSWORD) {
      return msg('Password must be at least ' + MIN_PASSWORD + ' characters.');
    }

    busy(true);
    msg(mode === 'register' ? 'Creating account…' : 'Signing in…', true);
    try {
      await loadParams();
      // The slow part, and it belongs here rather than on the server.
      const authKey = await deriveAuthKey(email, pw);
      const data = await req(mode === 'register' ? API.register : API.login, {
        method: 'POST',
        body: JSON.stringify({ email, authKey }),
      });
      $('dh-pw').value = '';
      goOnline((data && data.email) || email.toLowerCase());
      msg(mode === 'register' ? 'Account created. Saves now sync.' : 'Signed in.', true);
    } catch (e) {
      msg(e.message || 'Something went wrong.');
    } finally {
      busy(false);
    }
  }

  /* First sign-in on a browser that already has local progress: offer to
     push it up rather than silently leaving it behind. */
  async function uploadLocal() {
    const L = Local();
    if (!L) return msg('No local saves to upload.');
    busy(true);
    msg('Uploading…', true);
    try {
      const all = await L.list();
      const keys = Object.keys(all).filter((k) => all[k]);
      if (!keys.length) { msg('No local saves to upload.'); return }
      for (const k of keys) {
        await req(API.save(k), { method: 'PUT', body: JSON.stringify(all[k]) });
      }
      if (window.DH_SAVE && window.DH_SAVE.refresh) window.DH_SAVE.refresh();
      msg('Uploaded ' + keys.length + (keys.length === 1 ? ' save.' : ' saves.'), true);
    } catch (e) {
      msg('Upload failed — ' + (e.message || 'unknown error'));
    } finally {
      busy(false);
    }
  }

  async function doSignOut() {
    busy(true);
    try { await flushAuto() } catch { /* best effort */ }
    try { await req(API.logout, { method: 'POST' }) } catch { /* cookie may already be gone */ }
    signOutLocally();
    if (window.DH_SAVE && window.DH_SAVE.refresh) window.DH_SAVE.refresh();
    busy(false);
  }

  /* ---------------- boot ---------------- */
  function mount() {
    const modal = document.getElementById('savemgr');
    if (!modal) return;                       // not the game page
    const rep = modal.querySelector('.rep');
    const firstH4 = rep && rep.querySelector('h4');
    if (!rep || !firstH4) return;

    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    const holder = document.createElement('div');
    holder.innerHTML = HTML;
    rep.insertBefore(holder.firstElementChild, firstH4);

    $('dh-form').addEventListener('submit', (e) => { e.preventDefault(); submitAuth('login') });
    $('dh-reg').addEventListener('click', () => submitAuth('register'));
    $('dh-out-btn').addEventListener('click', doSignOut);
    $('dh-upload').addEventListener('click', uploadLocal);

    paintAuthState();

    // Resume an existing session silently. A 401 here is the normal
    // not-signed-in case, not an error worth showing.
    req(API.me)
      .then((d) => { if (d && d.email) goOnline(d.email) })
      .catch(() => {});

    loadParams();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
