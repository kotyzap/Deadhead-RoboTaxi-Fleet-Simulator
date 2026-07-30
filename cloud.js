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

  /* WHICH account, not just whether one exists (that's SEEN_KEY above). Set
     on every successful goOnline() and deliberately left alone by
     doSignOut() — signing out ends the session, not the browser's memory of
     who plays here, so "Play as <name>" (see the acct-quick markup and
     paintQuick() below) can still offer a one-field resume next time this
     card mounts. Only "Switch account" clears it, since that's the one
     action that actually means "forget me, someone else is playing." */
  const LAST_USER_KEY = 'dh_last_user';
  function getLastUser() {
    try { return localStorage.getItem(LAST_USER_KEY) || '' } catch { return '' }
  }
  function setLastUser(name) {
    try {
      if (name) localStorage.setItem(LAST_USER_KEY, name);
      else localStorage.removeItem(LAST_USER_KEY);
    } catch { /* private mode / storage disabled */ }
  }

  let kdfIters = 250000;          // replaced by /api/params before first use
  let saltPrefix = 'deadhead|';
  let paramsLoaded = false;
  let signedIn = null;            // username string when signed in
  let lastCloudAuto = 0;
  let pendingAuto = null;         // newest {key, save} not yet pushed

  /* deadhead.html's physKey() rewrites the logical key 'auto' to
     'auto:<city>' so each city keeps its own autosave slot — see the long
     comment above physKey() in deadhead.html. This module has to recognise
     BOTH the bare key (older saves, and any caller that still uses it) and
     the per-city form, or every autosave for a real city 404s against the
     server's slot route and the 2-minute cloud coalescing below never
     engages. That mismatch is exactly what produced the "autosave failed
     (interval) — no such endpoint" console warning: physKey() shipped
     without this file being taught the new key shape. */
  function isAutoKey(k) { return k === 'auto' || k.indexOf('auto:') === 0; }

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

  /* Opened as a local file rather than served. There is no origin to resolve
     /api/* against, so every account call fails with a bare, useless
     "Failed to fetch" (Pavel hit exactly that, 2026-07-30). Worth naming
     precisely rather than letting the network error surface raw: nothing is
     broken, this build simply has no server behind it, and the local-save
     path beside it works perfectly. Checked at call time rather than at
     boot because file:// pages still mount the card normally — the form is
     genuinely usable, it just cannot reach an account. */
  const NO_SERVER = location.protocol === 'file:';
  const NO_SERVER_MSG = 'Accounts need the online version — this is a local ' +
    'copy of the file, with no server behind it. Use "Play on this device ' +
    'only"; saves stay in this browser.';

  /* ---------------- transport ---------------- */
  async function req(url, opts = {}) {
    if (NO_SERVER) {
      const err = new Error(NO_SERVER_MSG);
      err.noServer = true;
      throw err;
    }
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
    const { key, save } = pendingAuto;
    pendingAuto = null;
    lastCloudAuto = Date.now();
    try {
      await req(API.save(key), { method: 'PUT', body: JSON.stringify(save) });
      setSyncNote('synced ' + new Date().toLocaleTimeString());
    } catch (e) {
      pendingAuto = { key, save };  // keep it for the next attempt
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
      if (isAutoKey(k)) {
        pendingAuto = { key: k, save: v };
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
      if (isAutoKey(k) && pendingAuto && pendingAuto.key === k) pendingAuto = null;
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

  /* The one thing deadhead.html needs from this file beyond Store/LocalStore
     dispatch: a way to check, right after a successful Sign in on the intro
     screen, whether THIS account already has a cloud save — see
     DH_INTRO_ACCOUNT_DONE in showIntro(). Exists unconditionally (not only
     once signed in) so the intro can call it optimistically the moment
     goOnline() has run, without caring about load order between the two
     scripts. RemoteStore.get() itself already falls back to the local copy
     on any failure, which is exactly the "no cloud save yet" case here.

     THE BARE 'auto' KEY WAS WRONG (improvements.md P0-2). This used to be
     `RemoteStore.get('auto')` — but deadhead.html's physKey() rewrites every
     autosave write to 'auto:<city>' (see the long comment above physKey() in
     deadhead.html), and this call sits entirely outside that machinery: it
     goes straight to RemoteStore, not through Store, so it is never rewritten
     either. On a brand-new device signing into an existing account, the real
     save always lives at 'auto:austin' or similar; the literal 'auto' slot on
     the server is empty, so this returned null every time and the resume
     path silently started a fresh fleet on top of a perfectly good cloud
     save — see DH_INTRO_ACCOUNT_DONE.

     Fixed by asking the account's own 'progress' record (see progSave() in
     deadhead.html) which city it was last playing — PROG.last — before
     asking for the run itself, the same order bootResume() already uses
     locally (progLoad() before Store.get('auto')). Falls back to the bare
     'auto' key if the progress fetch fails or is missing/legacy-shaped, so
     an account with no progress record yet (or a network hiccup) still gets
     the pre-fix behaviour rather than nothing. */
  window.DH_CLOUD = {
    fetchAuto: function () {
      return RemoteStore.get('progress').then(function (prog) {
        const city = prog && typeof prog.last === 'string' ? prog.last : null;
        return RemoteStore.get(city ? 'auto:' + city : 'auto');
      }).catch(function () { return RemoteStore.get('auto') });
    },
  };

  /* Push whatever is pending when the tab goes away, so closing the
     browser does not lose up to two minutes of cloud progress. */
  function flushOnExit() {
    if (!pendingAuto || !signedIn) return;
    const body = JSON.stringify(pendingAuto.save);
    // keepalive lets the request outlive the page; sendBeacon cannot set
    // the method to PUT, so use fetch with keepalive.
    try {
      fetch(API.save(pendingAuto.key), {
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
/* flex-wrap:wrap, not just the viewport media query below (2026-07-30):
   this card doesn't only ever get squeezed by a narrow VIEWPORT — the
   landscape intro layout (deadhead.html) puts it in a fixed-width side
   column beside the video, which can be narrower than this row wants
   while the viewport itself is wide. A media query keyed to viewport
   width can't see that; wrapping is a property of THIS row's own
   available space, so it fixes both cases the same way. Without it, the
   overflow:hidden on .acct (needed elsewhere to clip the signed-in/
   signed-out panels cleanly) was clipping the note text mid-word instead
   of wrapping it. */
.acct-head{display:flex;align-items:baseline;flex-wrap:wrap;gap:2px 9px;padding:11px 13px 0}
/* color:var(--text) was missing here (Pavel, 2026-07-30, second report:
   "Choose a username" and "paolo" still dark-on-dark after the #intro
   token-scope fix). color is an inherited CSS property, but inheritance
   passes the PARENT's already-resolved value, not the variable reference —
   an element with no color of its own does not re-evaluate var(--text)
   at its own position in the tree. So even though .intro-acct redefines
   --text for this whole subtree, h5/#dh-who never picked it up, because
   neither ever referenced var(--text) in the first place and were quietly
   inheriting the page's outer (Day-theme, dark) body color instead. Every
   other line in this block that already read var(--text)/var(--text-3)
   (the note span, #dh-sync, the buttons) was fine all along — this is the
   two spots that weren't. */
.acct-head h5{font-size:12px;font-weight:500;margin:0;letter-spacing:.01em;color:var(--text)}
.acct-head span{font-size:11px;color:var(--text-3)}
/* Narrow phones: "Choose a username" wraps to two lines at this width, and
   sitting baseline-aligned next to it the note text crammed in beside the
   wrapped second line instead of reading as its own line (Pavel, 2026-07-30:
   "Align 'Optional - add' on mobile"). Stacking (rather than just letting
   flex-wrap handle it) removes the wrap fight entirely — the note becomes
   its own short line underneath instead of possibly still sharing a line
   with part of a wrapped heading. */
@media (max-width:420px){
  .acct-head{flex-direction:column;align-items:flex-start;gap:2px}
}
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

/* "Play as <name>" quick resume (Pavel, 2026-07-30): a device that has
   signed in before but currently has no live session (cookie expired,
   cleared, or a 401 from probeSession) used to drop straight back to a
   blank Sign in/Create account form — correct, but a returning player
   only ever needs the password, not to retype a username they already
   own on this browser. LAST_USER_KEY below remembers that username
   (separately from SEEN_KEY, which only records THAT some account was
   ever used, not WHICH one) and this block replaces the tabs+form with
   just a password field until "Switch account" is pressed. */
.acct-quick{display:flex;flex-direction:column;gap:8px;margin-bottom:9px}
.acct-quick[hidden]{display:none}
.acct-quick-who{display:flex;align-items:center;gap:9px}
.acct-quick-who .acct-id{flex:1;min-width:0}
.acct-quick-who #dh-quick-name{display:block;font-size:12.5px;font-weight:500;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text)}
.acct-quick-who button{height:26px;padding:0 2px;font:inherit;font-size:11px;cursor:pointer;
  border:0;background:transparent;color:var(--text-3);text-decoration:underline;
  text-underline-offset:2px;flex:0 0 auto}
.acct-quick-who button:hover:not(:disabled){color:var(--accent)}
#dh-quick-submit{height:36px;border:0;border-radius:var(--r-ctl);background:var(--accent);
  color:#fff;font:inherit;font-size:13px;font-weight:500;cursor:pointer}
#dh-quick-submit:hover:not(:disabled){filter:brightness(1.07)}
#dh-quick-submit:disabled{opacity:.5;cursor:default}
#dh-full[hidden]{display:none}

/* signed-in state */
.acct-who{display:flex;align-items:center;gap:10px}
.acct-av{flex:0 0 auto;width:30px;height:30px;border-radius:50%;background:var(--accent);
  color:#fff;display:grid;place-items:center;font-size:12.5px;font-weight:500}
.acct-id{flex:1;min-width:0}
#dh-who{display:block;font-size:12.5px;font-weight:500;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text)}
#dh-sync{display:block;font-size:10.5px;color:var(--text-3);margin-top:1px}
/* Continue/Copy/Sign out used to live inline in .acct-who, crammed against
   the avatar and name with nowhere to go on a narrow width. A row of its
   own wraps instead of squeezing, and gives "Continue" — see the comment
   above #dh-continue — room to read as the primary action rather than a
   peer of Sign out. */
.acct-in-btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.acct-in-btns button{height:29px;padding:0 11px;font:inherit;font-size:11.5px;cursor:pointer;
  border:1px solid var(--brd-2);border-radius:var(--r-ctl);background:transparent;
  color:var(--text);flex:0 0 auto}
.acct-in-btns button:hover:not(:disabled){border-color:var(--accent);color:var(--accent)}
.acct-in-btns button:disabled{opacity:.4;cursor:default}
/* "Continue" (Pavel, 2026-07-30): a session resumed silently by
   probeSession() (a returning device with a still-valid cookie — exactly
   the state in the screenshot he flagged) used to leave the signed-in
   panel with no forward path at all: "Sign out" undoes it, "Copy saves to
   cloud" is a side action, and the ONLY button that closes the intro is
   "Play on this device only" below — which runs doSkip(), the LOCAL-ONLY
   path, and would silently start a fresh run instead of the account's
   actual cloud save. Continue calls the exact same DH_INTRO_ACCOUNT_DONE
   hook a fresh Sign in already uses (see quickSubmit()'s call chain and
   showIntro() in deadhead.html), so a resumed session and a typed sign-in
   land on identical behaviour: fetch the cloud save, resume it if one
   exists, otherwise proceed to a new fleet. Filled/accent rather than
   outlined like its siblings, so it reads as the one default action. */
#dh-continue{border-color:var(--accent);background:var(--accent);color:#fff;font-weight:500}
#dh-continue:hover:not(:disabled){filter:brightness(1.07);border-color:var(--accent);color:#fff}

#dh-msg{font-size:11.5px;color:var(--s-crit);margin-top:8px;line-height:1.4}
#dh-msg.ok{color:var(--s-charge)}
#dh-msg.work{color:var(--text-3)}
#dh-msg:empty{margin-top:0}`;

  const HTML = `
<div class="acct" id="dh-acct">
  <div class="acct-head">
    <h5>Choose a username</h5>
    <span id="dh-head-note">Want to play across devices?</span>
  </div>

  <div class="acct-body" id="dh-out">
    <form class="acct-quick" id="dh-quick" autocomplete="on" novalidate hidden>
      <div class="acct-quick-who">
        <span class="acct-av" id="dh-quick-av" aria-hidden="true"></span>
        <span class="acct-id"><b id="dh-quick-name">&mdash;</b></span>
        <button type="button" id="dh-quick-switch">Switch account</button>
      </div>
      <div class="fld pw">
        <input type="password" id="dh-quick-pw" placeholder="Password"
               autocomplete="current-password" aria-label="Password"
               minlength="${MIN_PASSWORD}" required>
        <button type="button" class="peek" id="dh-quick-peek" aria-label="Show password">Show</button>
      </div>
      <button type="submit" id="dh-quick-submit">Play as <span id="dh-quick-name2"></span></button>
    </form>
    <div id="dh-full">
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
  </div>

  <div class="acct-body" id="dh-in" hidden>
    <div class="acct-who">
      <span class="acct-av" id="dh-av" aria-hidden="true"></span>
      <span class="acct-id"><b id="dh-who">&mdash;</b><span id="dh-sync"></span></span>
    </div>
    <div class="acct-in-btns">
      <button type="button" id="dh-continue">Continue</button>
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
    ['dh-submit', 'dh-upload', 'dh-out-btn', 'dh-tab-in', 'dh-tab-new',
     'dh-quick-submit', 'dh-quick-switch', 'dh-continue'].forEach((id) => {
      const b = $(id);
      if (b) b.disabled = state;
    });
  }

  /* See the long comment above #dh-continue in the CSS block: this is the
     forward path a resumed session was missing. Same hook a fresh Sign in
     already calls, so "resumed silently" and "just typed a password" behave
     identically from here on — DH_INTRO_ACCOUNT_DONE fetches the cloud save,
     resumes it if one exists, and closes the intro either way. */
  function continueSignedIn() {
    if (!signedIn) return;
    if (typeof window.DH_INTRO_ACCOUNT_DONE === 'function') {
      window.DH_INTRO_ACCOUNT_DONE(signedIn, true);
    }
  }

  /* Shows "Play as <name>" instead of the tabs+form whenever this browser
     remembers a username (getLastUser()) and nobody is currently signed in.
     Called from paintAuthState() so it stays in sync with every place that
     already repaints on an auth transition — a fresh sign-in hides it (the
     whole #dh-out block goes hidden), a sign-out brings it back (the
     remembered name survives doSignOut(), see LAST_USER_KEY above), and
     "Switch account" forces the full form for the rest of this visit. */
  function paintQuick() {
    const q = $('dh-quick'), full = $('dh-full');
    if (!q || !full) return;
    const last = getLastUser();
    const show = !!last && !signedIn;
    q.hidden = !show;
    full.hidden = show;
    if (show) {
      $('dh-quick-name').textContent = last;
      $('dh-quick-name2').textContent = last;
      $('dh-quick-av').textContent = last.trim().charAt(0).toUpperCase() || '?';
    }
  }

  function paintAuthState() {
    paintSavemgrStatus();
    const out = $('dh-out'), inn = $('dh-in');
    if (!out || !inn) return;
    out.hidden = !!signedIn;
    inn.hidden = !signedIn;
    paintQuick();
    const note = $('dh-head-note');
    /* "Syncing" read as a progress state — as if something were happening right
       now. It is a standing fact about the account, so say what it means.
       Signed-out copy rephrased as a question (Pavel, 2026-07-30) — "Optional"
       read as a label for a form field, not as an invitation; the account
       tabs/fields right below already make clear it's skippable. */
    if (note) note.textContent = signedIn
      ? 'Saves follow this account'
      : 'Want to play across devices?';
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
    setLastUser(username);
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
      const finalUsername = (data && data.username) || username.toLowerCase();
      goOnline(finalUsername);
      /* This card now lives only on the intro screen (deadhead.html's
         #intro-acct) — deadhead.html sets this one hook while the intro is
         open, and clears it the moment the intro closes, so it's never a
         stale reference to a screen that already went away. Falling
         through to the plain msg() below only happens in the window before
         deadhead.html has finished booting, which should not be reachable
         in practice now that there is nowhere else this form is mounted. */
      if (typeof window.DH_INTRO_ACCOUNT_DONE === 'function') {
        window.DH_INTRO_ACCOUNT_DONE(finalUsername, mode === 'login');
      } else {
        msg(mode === 'register'
          ? 'Account created. Your saves sync from now on.'
          : 'Signed in.', 'ok');
      }
    } catch (e) {
      /* A 409 on sign-in means the username exists but under the old scheme,
         and on register it means it is already taken — point at the tab that
         actually helps instead of leaving them stuck. */
      if (e.status === 409 && mode === 'register') {
        msg('That username is already taken — switch to Sign in.');
        setMode('login');
      } else if (e.noServer) {
        msg(e.message);            /* already a full explanation — see NO_SERVER */
      } else if (!e.status) {
        /* No HTTP status at all means the request never reached a server:
           fetch() rejects with a bare "Failed to fetch"/"NetworkError"
           (wording varies per browser), which tells the player nothing and
           reads like the game is broken. A missing status is the one
           reliable signal for it — every server-produced error above sets
           one. */
        msg('Could not reach the server. Check your connection and try ' +
            'again — or use "Play on this device only" and keep saves in ' +
            'this browser.');
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

  function togglePeekQuick() {
    const pw = $('dh-quick-pw'), b = $('dh-quick-peek');
    const showing = pw.type === 'text';
    pw.type = showing ? 'password' : 'text';
    b.textContent = showing ? 'Show' : 'Hide';
    b.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    pw.focus();
  }

  /* "Play as <name>": reuses submitAuth() rather than re-implementing the
     KDF/request/error-handling it already does — it fills in the (hidden)
     full-form fields from the remembered username and this field's
     password, forces login mode, and lets submitAuth() do the rest. The one
     thing worth doing here first is the length check submitAuth() would
     otherwise report by focusing #dh-pw, which sits inside the hidden
     #dh-full and would focus nothing the player can see. */
  async function quickSubmit() {
    const last = getLastUser();
    if (!last) return;                      // quick view shouldn't be up without one
    const pw = $('dh-quick-pw').value || '';
    if (pw.length < MIN_PASSWORD) {
      $('dh-quick-pw').focus();
      return msg('Password must be at least ' + MIN_PASSWORD + ' characters.');
    }
    mode = 'login';
    $('dh-username').value = last;
    $('dh-pw').value = pw;
    await submitAuth();
    // submitAuth() clears #dh-pw only once it actually succeeds; mirror
    // whatever state it ended up in rather than assuming success.
    $('dh-quick-pw').value = $('dh-pw').value;
  }

  /* "Not you?" — forgets the remembered username (LAST_USER_KEY) so the
     full Sign in/Create account form takes over, both right now and on any
     future visit, until someone signs in again. */
  function quickSwitch() {
    setLastUser('');
    $('dh-quick-pw').value = '';
    setMode('login');
    paintQuick();
    const u = $('dh-username');
    if (u) u.focus();
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

  /* The signed-in-only status readout left behind in the Saved-fleets
     dialog now that the actual Sign in/Create account FORM lives only on
     the intro screen (#intro-acct) — see mount() below. Never shows the
     form itself, only "Signed in as X · Sign out", and only when there is
     in fact someone signed in: a skipped/signed-out player sees nothing
     here rather than a dead-end prompt with no way to act on it (the
     intro, where the real prompt lives, only ever shows once). */
  let statusWired = false;
  function paintSavemgrStatus() {
    const box = document.getElementById('acct-status');
    const who = document.getElementById('acct-status-who');
    if (!box || !who) return;
    box.hidden = !signedIn;
    if (signedIn) who.textContent = signedIn;
    if (!statusWired) {
      const btn = document.getElementById('acct-status-out');
      if (btn) btn.addEventListener('click', doSignOut);
      statusWired = true;
    }
  }

  /* ---------------- boot ---------------- */
  function mount() {
    /* Three independent jobs, none gating the others — the request-budget
       tests exercise cloud.js against a minimal page carrying only
       #savemgr, and a returning player with an existing local save never
       has #intro-acct populated either (showIntro() only ever runs for a
       genuinely fresh company), so session probing must not depend on the
       account card having anywhere to mount. */
    const savemgrEl = document.getElementById('savemgr');
    const introSlot = document.getElementById('intro-acct');
    if (!savemgrEl && !introSlot) return;       // not the game page

    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    /* 1. The account card — Sign in/Create account tabs, the actual form.
       Lives only on the intro screen now, not the Saved-fleets dialog: see
       deadhead.html's #intro-acct and the DH_INTRO_ACCOUNT_DONE hook in
       showIntro(). */
    if (introSlot) {
      introSlot.innerHTML = HTML;

      /* One submit path for both modes — the mode decides the endpoint, so
         Enter in either field does the expected thing. */
      $('dh-form').addEventListener('submit', (e) => { e.preventDefault(); submitAuth() });
      $('dh-tab-in').addEventListener('click', () => setMode('login'));
      $('dh-tab-new').addEventListener('click', () => setMode('register'));
      $('dh-peek').addEventListener('click', togglePeek);
      $('dh-out-btn').addEventListener('click', doSignOut);
      $('dh-upload').addEventListener('click', uploadLocal);
      $('dh-continue').addEventListener('click', continueSignedIn);
      /* Clear a stale error as soon as the player starts fixing it. */
      ['dh-username', 'dh-pw', 'dh-quick-pw'].forEach((id) => {
        $(id).addEventListener('input', () => {
          const el = $('dh-msg');
          if (el && el.className === '') msg('');
        });
      });

      /* "Play as <name>" quick resume — see paintQuick()/quickSubmit()/
         quickSwitch() above. Its own <form> so Enter in the password field
         submits it, same as the full form below. */
      $('dh-quick').addEventListener('submit', (e) => { e.preventDefault(); quickSubmit() });
      $('dh-quick-peek').addEventListener('click', togglePeekQuick);
      $('dh-quick-switch').addEventListener('click', quickSwitch);

      paintMode();
      paintAuthState();
      prefillUsername();
    }

    /* 2. The signed-in-only status readout left behind in Saved fleets —
       independent of whether the form exists anywhere on this page. */
    paintSavemgrStatus();

    /* 3. Resume an existing session silently — but ONLY if this browser has
       ever had an account on it. See SEEN_KEY above: skipping this for
       first-time visitors is what takes an anonymous page load from two
       Worker requests to zero. A 401 here is the normal expired-session
       case, not an error worth showing. */
    if (hasAccountMarker()) probeSession();

    /* The stale-marker fallback: opening Saved fleets is a second,
       unconditional chance to notice a still-valid session cookie even when
       SEEN_KEY is missing or was cleared (an HttpOnly dh_session cookie can
       outlive a cleared localStorage). probeSession()'s own `probed` guard
       makes this free after the first real check — repeatedly opening and
       closing the dialog costs nothing beyond the one probe already spent. */
    if (savemgrEl && 'MutationObserver' in window) {
      new MutationObserver(() => {
        if (savemgrEl.hidden) return;
        probeSession();
        paintSavemgrStatus();
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
    /* profileName(), NOT playerName() — playerName() falls back to the
       literal string 'Player' for a profile that has never been set, which
       would get typed into the field as if the player had chosen it. Now
       that this card mounts INTO the intro (see deadhead.html's #intro-acct
       and DH_INTRO_ACCOUNT_DONE), PROFILE.name is almost always still empty
       the first time this runs — the username field is where it gets set,
       not the other way around any more. */
    const name = window.DH_SAVE && typeof window.DH_SAVE.profileName === 'function'
      ? window.DH_SAVE.profileName()
      : '';
    if (name) el.value = name.slice(0, 40);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
