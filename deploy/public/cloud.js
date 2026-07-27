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

  /* THE ANONYMOUS-VISITOR BUDGET, and why boot makes no network calls.

     Static assets on Workers are free and unlimited, so the game itself
     costs nothing no matter how much traffic arrives. The Worker's
     100,000 requests/day allowance is spent only on /api/*. Before this
     marker existed, mount() fired /api/me AND /api/params on every single
     page load — so a Reddit visitor who bounced in ten seconds without
     ever opening the Saves modal still cost two requests, and 50,000
     bouncers alone exhausted the day's budget for the players who stayed.

     Almost nobody who loads this page has an account. So: remember, in
     this browser, whether an account has ever been used here, and skip
     both boot calls when it has not. A first-time visitor now costs ZERO
     Worker requests until they finish a shift (/api/stat) or actually
     sign in. /api/params is not needed at boot at all — the defaults
     below are correct, and submitAuth() awaits loadParams() before the
     KDF runs, which is the only place the real values matter.

     The marker is a hint, never a source of truth: the dh_session cookie
     is HttpOnly and remains the only thing that actually authenticates.
     If the marker is lost but the cookie survives (localStorage cleared,
     a different profile, private-window quirks) the session is picked up
     the first time the Saves modal opens — see probeSession(). A bouncer
     never opens that modal, so the fallback costs nothing. */
  const SEEN_KEY = 'dh_seen_account';
  function hasAccountMarker() {
    try { return localStorage.getItem(SEEN_KEY) === '1' } catch { return false }
  }
  function setAccountMarker(on) {
    try {
      if (on) localStorage.setItem(SEEN_KEY, '1');
      else localStorage.removeItem(SEEN_KEY);
    } catch { /* private mode / storage disabled — degrade to no marker */ }
  }

  let kdfIters = 250000;          // replaced by /api/params before first use
  let saltPrefix = 'deadhead|';
  let paramsLoaded = false;
  let signedIn = null;            // username string when signed in
  let lastCloudAuto = 0;
  let pendingAuto = null;         // newest 'auto' snapshot not yet pushed

  const $ = (id) => document.getElementById(id);
  const enc = new TextEncoder();

  /* ---------------- crypto ---------------- */
  const toHex = (buf) =>
    [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

  async function deriveAuthKey(username, password) {
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        hash: 'SHA-256',
        salt: enc.encode(saltPrefix + username.trim().toLowerCase()),
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

  /* ---------------- UI ----------------
     Design notes, since the first pass got several things wrong:

     - "Sign in" and "Create" sat side by side with equal weight, so a new
       player could not tell which one applied to them. Now two text tabs
       switch MODE and there is exactly one primary button, whose label says
       what will happen.
     - The three controls were crammed on one row, which truncated the email
       placeholder to "you@example". Now they stack full width.
     - The panel read as a gate. One line of copy says accounts are optional
       and local saves keep working, because they do.
     - A password field with no reveal is a guessing game on a 10-character
       minimum, so there is a show/hide toggle.
     - USERNAME, NOT EMAIL (Pavel's request): the player already types a
       display name on the intro screen before they ever reach this modal
       (PROFILE.name — see onboardingplan.md §2 and window.DH_SAVE.playerName
       below). Asking for a second, email-shaped identifier here just to
       sync saves was friction with no real payoff — there was never a
       password-reset email to send, so an address bought nothing. The field
       is prefilled from that name the first time this panel is shown with
       nothing typed yet, but stays free text: it does not have to match,
       and unlike the display name it MUST be unique account-to-account,
       since it is still how you sign back in on another device.
  */
  const CSS = `
.acct{padding:0;border:1px solid var(--brd);border-radius:9px;
  background:var(--c-card);margin:2px 0 4px;overflow:hidden}
.acct-head{display:flex;align-items:baseline;gap:9px;padding:11px 13px 0}
.acct-head h5{font-size:12px;font-weight:500;margin:0;letter-spacing:.01em}
.acct-head span{font-size:11px;color:var(--text-3)}
.acct-body{padding:10px 13px 12px}
/* display:flex beats the hidden attribute's own display:none, so without
   this both the signed-in and signed-out blocks render at once and the panel
   claims you are signed in when you are not. No backticks in here: this
   block lives inside a JS template literal. */
.acct-body[hidden],.acct-row[hidden]{display:none}
.acct-row{display:flex;align-items:center;gap:9px}

/* mode tabs */
.acct-tabs{display:flex;gap:2px;margin-bottom:9px;background:var(--inset);
  border-radius:var(--r-ctl);padding:2px;width:fit-content}
.acct-tabs button{height:25px;padding:0 12px;font:inherit;font-size:11.5px;cursor:pointer;
  border:0;border-radius:calc(var(--r-ctl) - 1px);background:transparent;color:var(--text-3)}
.acct-tabs button[aria-selected="true"]{background:var(--panel-solid);color:var(--text);
  font-weight:500;box-shadow:0 0 0 1px var(--brd)}

/* the form itself */
#dh-form{display:flex;flex-direction:column;gap:7px}
.fld{position:relative;display:flex}
.fld input{flex:1;min-width:0;height:34px;padding:0 11px;font:inherit;font-size:13px;
  color:var(--text);background:var(--inset);border:1px solid var(--brd-2);
  border-radius:var(--r-ctl)}
.fld input::placeholder{color:var(--text-4)}
.fld input:focus{outline:none;border-color:var(--accent);
  box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 18%,transparent)}
.fld.pw input{padding-right:52px}
.fld .peek{position:absolute;right:4px;top:4px;height:26px;padding:0 8px;border:0;
  background:transparent;color:var(--text-3);font:inherit;font-size:10.5px;
  letter-spacing:.06em;text-transform:uppercase;cursor:pointer;border-radius:4px}
.fld .peek:hover{color:var(--accent)}
#dh-submit{height:36px;border:0;border-radius:var(--r-ctl);background:var(--accent);
  color:#fff;font:inherit;font-size:13px;font-weight:500;cursor:pointer;margin-top:1px}
#dh-submit:hover:not(:disabled){filter:brightness(1.07)}
#dh-submit:disabled{opacity:.5;cursor:default}
.acct-hint{font-size:10.5px;color:var(--text-4);line-height:1.45}

/* signed-in state */
.acct-who{display:flex;align-items:center;gap:10px}
.acct-av{flex:0 0 auto;width:30px;height:30px;border-radius:50%;background:var(--accent);
  color:#fff;display:grid;place-items:center;font-size:12.5px;font-weight:500}
.acct-id{flex:1;min-width:0}
#dh-who{display:block;font-size:12.5px;font-weight:500;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#dh-sync{display:block;font-size:10.5px;color:var(--text-3);margin-top:1px}
.acct-who button{height:29px;padding:0 11px;font:inherit;font-size:11.5px;cursor:pointer;
  border:1px solid var(--brd-2);border-radius:var(--r-ctl);background:transparent;
  color:var(--text);flex:0 0 auto}
.acct-who button:hover:not(:disabled){border-color:var(--accent);color:var(--accent)}
.acct-who button:disabled{opacity:.4;cursor:default}

#dh-msg{font-size:11.5px;color:var(--s-crit);margin-top:8px;line-height:1.4}
#dh-msg.ok{color:var(--s-charge)}
#dh-msg.work{color:var(--text-3)}
#dh-msg:empty{margin-top:0}`;

  const HTML = `
<div class="acct" id="dh-acct">
  <div class="acct-head">
    <h5>Play across devices</h5>
    <span id="dh-head-note">Optional</span>
  </div>

  <div class="acct-body" id="dh-out">
    <div class="acct-tabs" role="tablist">
      <button type="button" id="dh-tab-in"  role="tab" aria-selected="true">Sign in</button>
      <button type="button" id="dh-tab-new" role="tab" aria-selected="false">Create account</button>
    </div>
    <form id="dh-form" autocomplete="on" novalidate>
      <div class="fld">
        <input type="text" id="dh-username" placeholder="Username" maxlength="40"
               autocomplete="username" aria-label="Username" required>
      </div>
      <div class="fld pw">
        <input type="password" id="dh-pw" placeholder="Password"
               autocomplete="current-password" aria-label="Password"
               minlength="${MIN_PASSWORD}" required>
        <button type="button" class="peek" id="dh-peek" aria-label="Show password">Show</button>
      </div>
      <button type="submit" id="dh-submit">Sign in</button>
    </form>
    <div class="acct-hint" id="dh-hint"></div>
  </div>

  <div class="acct-body" id="dh-in" hidden>
    <div class="acct-who">
      <span class="acct-av" id="dh-av" aria-hidden="true"></span>
      <span class="acct-id"><b id="dh-who">&mdash;</b><span id="dh-sync"></span></span>
      <button type="button" id="dh-upload" hidden>Copy saves to cloud</button>
      <button type="button" id="dh-out-btn">Sign out</button>
    </div>
  </div>

  <div class="acct-body" style="padding-top:0"><div id="dh-msg" role="status" aria-live="polite"></div></div>
</div>`;

  /* 'login' or 'register' — one primary button, label follows the mode. */
  let mode = 'login';
  const COPY = {
    login: {
      submit: 'Sign in',
      hint: 'Saves sync to every device you sign in on. Local browser saves keep working either way.',
      pwAuto: 'current-password',
    },
    register: {
      submit: 'Create account',
      hint: `At least ${MIN_PASSWORD} characters. There is no password reset, so keep it somewhere safe, or use Export file as a backup.`,
      pwAuto: 'new-password',
    },
  };

  function paintMode() {
    const c = COPY[mode];
    const ti = $('dh-tab-in'), tn = $('dh-tab-new');
    if (!ti) return;
    ti.setAttribute('aria-selected', String(mode === 'login'));
    tn.setAttribute('aria-selected', String(mode === 'register'));
    $('dh-submit').textContent = c.submit;
    $('dh-hint').textContent = c.hint;
    $('dh-pw').setAttribute('autocomplete', c.pwAuto);
    msg('');
  }

  function togglePeek() {
    const pw = $('dh-pw'), b = $('dh-peek');
    const showing = pw.type === 'text';
    pw.type = showing ? 'password' : 'text';
    b.textContent = showing ? 'Show' : 'Hide';
    b.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    pw.focus();
  }

  function setSyncNote(t) {
    const el = $('dh-sync');
    if (el) el.textContent = t || '';
  }
  /* kind: 'err' (default) | 'ok' | 'work' */
  function msg(text, kind) {
    const el = $('dh-msg');
    if (!el) return;
    el.textContent = text || '';
    el.className = kind === true ? 'ok' : (kind || '');
  }
  function busy(state) {
    ['dh-submit', 'dh-upload', 'dh-out-btn', 'dh-tab-in', 'dh-tab-new'].forEach((id) => {
      const b = $(id);
      if (b) b.disabled = state;
    });
  }

  function paintAuthState() {
    const out = $('dh-out'), inn = $('dh-in');
    if (!out || !inn) return;
    out.hidden = !!signedIn;
    inn.hidden = !signedIn;
    const note = $('dh-head-note');
    /* "Syncing" read as a progress state — as if something were happening right
       now. It is a standing fact about the account, so say what it means. */
    if (note) note.textContent = signedIn ? 'Saves follow this account' : 'Optional';
    if (signedIn) {
      $('dh-who').textContent = signedIn;
      $('dh-av').textContent = signedIn.trim().charAt(0).toUpperCase() || '?';
      setSyncNote('Signed in — saves load on any device');
      /* Only offer the upload when there is actually something local to
         upload — an button that does nothing is worse than no button. */
      const L = Local();
      if (L) {
        L.list().then((all) => {
          const n = Object.keys(all).filter((k) => all[k]).length;
          const b = $('dh-upload');
          if (b) {
            b.hidden = n === 0;
            /* "Upload 1 local" was read as "Save" — which is exactly wrong: it
               copies saves that already exist in THIS browser up to the account
               so another device can load them. Say the direction and the object,
               and let the title spell out the rest. Nothing here creates a new
               save; that is what the slots are for. */
            b.textContent = n === 1
              ? 'Copy 1 save to cloud'
              : 'Copy ' + n + ' saves to cloud';
            b.title = 'Copies the ' + (n === 1 ? 'save' : n + ' saves') +
              ' already in this browser up to your account, so you can load ' +
              (n === 1 ? 'it' : 'them') + ' on another device. It does not ' +
              'create a new save.';
          }
        }).catch(() => {});
      }
    }
  }

  function signOutLocally() {
    signedIn = null;
    window.DH_REMOTE = null;
    pendingAuto = null;
    /* Back to costing nothing at boot. Deliberately cleared here rather
       than only in doSignOut(): this also runs on a 401 from a dead
       session, which is exactly when the marker has gone stale. */
    setAccountMarker(false);
    paintAuthState();
    msg('Signed out — saves are going to this browser only.');
  }

  function goOnline(username) {
    signedIn = username;
    window.DH_REMOTE = RemoteStore;
    setAccountMarker(true);
    paintAuthState();
    setSyncNote('');
    if (window.DH_SAVE && window.DH_SAVE.refresh) window.DH_SAVE.refresh();
  }

  async function submitAuth() {
    const username = ($('dh-username').value || '').trim();
    const pw = $('dh-pw').value || '';

    /* Validate in the order the fields appear, and put the cursor where the
       problem is rather than only naming it. No format check beyond length
       — a username is free text, same as the display name it is prefilled
       from (see checkUsername() in src/index.js, the server-side twin of
       this same relaxed rule). */
    if (!username) { $('dh-username').focus(); return msg('Enter a username.') }
    if (username.length > 40) {
      $('dh-username').focus();
      return msg('Username is too long — 40 characters or fewer.');
    }
    if (pw.length < MIN_PASSWORD) {
      $('dh-pw').focus();
      return msg(mode === 'register'
        ? 'Pick a password of at least ' + MIN_PASSWORD + ' characters.'
        : 'Password must be at least ' + MIN_PASSWORD + ' characters.');
    }

    busy(true);
    /* The KDF takes a beat on purpose, so say so — an unexplained pause on a
       sign-in button reads as broken. */
    msg(mode === 'register' ? 'Creating your account…' : 'Signing in…', 'work');
    try {
      await loadParams();
      // The slow part, and it belongs here rather than on the server.
      const authKey = await deriveAuthKey(username, pw);
      const data = await req(mode === 'register' ? API.register : API.login, {
        method: 'POST',
        body: JSON.stringify({ username, authKey }),
      });
      $('dh-pw').value = '';
      togglePeekOff();
      goOnline((data && data.username) || username.toLowerCase());
      msg(mode === 'register'
        ? 'Account created. Your saves sync from now on.'
        : 'Signed in.', 'ok');
    } catch (e) {
      /* A 409 on sign-in means the username exists but under the old scheme,
         and on register it means it is already taken — point at the tab that
         actually helps instead of leaving them stuck. */
      if (e.status === 409 && mode === 'register') {
        msg('That username is already taken — switch to Sign in.');
        setMode('login');
      } else {
        msg(e.message || 'Something went wrong.');
      }
    } finally {
      busy(false);
    }
  }

  function togglePeekOff() {
    const pw = $('dh-pw'), b = $('dh-peek');
    if (pw && pw.type === 'text') { pw.type = 'password'; b.textContent = 'Show' }
  }

  function setMode(m) {
    mode = m;
    paintMode();
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

    /* One submit path for both modes — the mode decides the endpoint, so
       Enter in either field does the expected thing. */
    $('dh-form').addEventListener('submit', (e) => { e.preventDefault(); submitAuth() });
    $('dh-tab-in').addEventListener('click', () => setMode('login'));
    $('dh-tab-new').addEventListener('click', () => setMode('register'));
    $('dh-peek').addEventListener('click', togglePeek);
    $('dh-out-btn').addEventListener('click', doSignOut);
    $('dh-upload').addEventListener('click', uploadLocal);
    /* Clear a stale error as soon as the player starts fixing it. */
    ['dh-username', 'dh-pw'].forEach((id) => {
      $(id).addEventListener('input', () => {
        const el = $('dh-msg');
        if (el && el.className === '') msg('');
      });
    });

    paintMode();
    paintAuthState();
    prefillUsername();

    /* Resume an existing session silently — but ONLY if this browser has
       ever had an account on it. See SEEN_KEY above: skipping this for
       first-time visitors is what takes an anonymous page load from two
       Worker requests to zero. A 401 here is the normal expired-session
       case, not an error worth showing.

       loadParams() used to run here too and no longer does; submitAuth()
       awaits it before deriving the key, which is the only moment the
       server's KDF parameters are actually used. */
    if (hasAccountMarker()) probeSession();

    /* This modal is built and inserted into the DOM once at boot (see
       above), but the player's name (PROFILE.name) is very often set
       AFTER that — the intro screen that asks for it hasn't necessarily
       run yet. So prefill again every time the Saves modal is actually
       opened, not just once at mount, and only into an EMPTY field: a
       returning player who already typed their own username should never
       have it silently overwritten. */
    const savemgrEl = document.getElementById('savemgr');
    if (savemgrEl && 'MutationObserver' in window) {
      new MutationObserver(() => {
        if (savemgrEl.hidden) return;
        prefillUsername();
        /* The marker fallback. Opening this modal is the moment a stale or
           missing SEEN_KEY would actually be visible to the player, so it
           is the moment to check the cookie for real. probeSession() is
           idempotent and self-limiting, so re-firing on every open is
           free after the first. */
        probeSession();
      }).observe(savemgrEl, { attributes: true, attributeFilter: ['hidden'] });
    }
  }

  /* One /api/me, at most, per page load. Restores a session from the
     HttpOnly dh_session cookie; a 401/no-cookie answer is the ordinary
     not-signed-in case and is swallowed. `probed` makes the boot call and
     the modal-open fallback collapse into a single request rather than
     racing, and stops a player who opens and closes the Saves modal ten
     times from spending ten requests. */
  let probed = false;
  function probeSession() {
    if (probed || signedIn) return;
    probed = true;
    req(API.me)
      .then((d) => { if (d && d.username) goOnline(d.username) })
      .catch(() => {});
  }

  /* Reads the display name the player already typed on the intro screen
     (onboardingplan.md §2) via the one global hook deadhead.html exports
     for it, and uses it as a starting guess for the username field — see
     the "USERNAME, NOT EMAIL" note above the CSS block for why. Never
     overwrites something the player already typed. */
  function prefillUsername() {
    const el = $('dh-username');
    if (!el || el.value) return;
    const name = window.DH_SAVE && typeof window.DH_SAVE.playerName === 'function'
      ? window.DH_SAVE.playerName()
      : '';
    if (name) el.value = name.slice(0, 40);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
