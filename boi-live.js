
(function () {
  "use strict";
  if (window.BoiLive) return;
  if (typeof Level !== "function" || typeof DOMDisplay !== "function") return;

  // ---- SETTINGS -------------------------------------------------------------
  var MAX_ONLINE = 20;
  var ROOM_SIZE = 5;
  var EVENT_ROOM_SIZE = 20;
  var EVENT_ONLY = false;
  var EVENT_ONLY_TEXT = "LIVE IS ONLY OPEN FOR THE LEVEL AWARDS";
  // Admins keep the ordinary LIVE (rooms, races) while it is locked
  function eventOnly() {
    return EVENT_ONLY && !amAdmin();
  }
  var LOBBY_TOPIC = "boi-live-lobby";
  var ROOM_TOPIC = "boi-live-room-";
  var SEND_HZ = 30;
  var KEYS_SEND_HZ = 60;
  var IDLE_SEND_MS = 250;
  var EXTRAS_EVERY_MS = 1000;
  var RELAY_SAMPLE_MS = 50;
  var SMOOTH_S = 0.035;
  var SMOOTH_RELAY_S = 0.08;
  var SNAP_BLOCKS = 2.5;
  var CLOCK_EASE_MS = 250;
  var CLOCK_SNAP_MS = 300;
  var PREDICT_MAX_MS = 700;
  var RELAY_ONE_WAY_MS = 80;
  var PING_EVERY_MS = 1000;
  var TIMER_EVERY_MS = 50;
  var FLIP_MS = 3600;
  var COUNTDOWN_MS = 3000;
  var GO_DELAY = FLIP_MS + 1000 + COUNTDOWN_MS;
  var AFTER_FIRST_MS = 45000;
  var RACE_MAX_MS = 5 * 60000;
  var SHOWOFF_MS = 20000;
  var RELAY_BUDGET = 40;
  var CONNECT_TIMEOUT_MS = 12000;
  var PUSH_MAX = 12;
  var PUSH_SEND_MS = 40;
  var PUSH_HOLD_MS = 120;
  var PUSH_RELAY_MS = 250;
  var SHOVE_CLOSING = 13;
  var SHOVE_MAX = 14;
  var SHOVE_COOLDOWN_MS = 400;
  var SHOVE_HOP = 4;
  var ICE_SERVERS = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    { urls: "stun:stun.cloudflare.com:3478" },
  ];
  var TURN_CREDENTIALS_URL = "";
  var LIVE_VERSION = 9;
  var LIVE_COIN_MIN_DIFF = 5;
  var WORLD_STEP = 1 / 60;
  var WORLD_STEPS_MAX = 20;
  var LIVE_COINS_PER_DAY = 10;
  var CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  var NO_KEYS = { left: false, right: false, up: false, down: false, p: false };

  // ---- ENVIRONMENTS ----
  // The room's lobby is the environment its creator picked on their
  // profile (the game's ENVIRONMENTS, through window.boiEnvironment). It
  // rides in the room's state as `env`, so everyone stands in the same one;
  // an id this game doesn't know is the Default.
  function roomEnv() {
    return window.boiEnvironment((room && room.state.env) || "default");
  }
  function floorSpot() {
    var spots = roomEnv().spots;
    var s = spots[Math.floor(Math.random() * spots.length)];
    return { x: s.x, y: s.y };
  }
  // Whether racers bump into and push each other in this room (the host's
  // COLLISIONS toggle; on unless switched off)
  function collisionsOn() {
    return !room || room.state.coll !== false;
  }
  function cleanEnv(id) {
    id = String(id || "").slice(0, 32);
    return /^[a-z0-9_-]+$/.test(id) ? id : "default";
  }


  function now() {
    return performance.now();
  }
  var PHONE_MIN_BLOCK_PX = 14;
  function randomId(n) {
    var abc = "abcdefghijklmnopqrstuvwxyz0123456789";
    var bytes = new Uint8Array(n);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else for (var i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
    var out = "";
    for (var j = 0; j < n; j++) out += abc[bytes[j] % abc.length];
    return out;
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }
  function num(v, d) {
    v = Number(v);
    return isFinite(v) ? v : d || 0;
  }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }
  function formatTime(ms) {
    if (ms == null) return "--:--.---";
    ms = Math.max(0, Math.round(ms));
    var m = String(Math.floor(ms / 60000)).padStart(2, "0");
    var s = String(Math.floor(ms / 1000) % 60).padStart(2, "0");
    return m + ":" + s + "." + String(ms % 1000).padStart(3, "0");
  }
  function ordinal(n) {
    return n + (n === 1 ? "ST" : n === 2 ? "ND" : n === 3 ? "RD" : "TH");
  }
  // LIVE shows no pop-up messages. What it has to say goes on the LIVE
  // menu's status line, or in the room's bar, for a few seconds.
  var flashTimer = null;
  function notify(text) {
    clearTimeout(flashTimer);
    var box = null;
    if (room && hud && hud.flash && document.body.contains(hud.flash)) box = hud.flash;
    else if (!room && menuEls && document.body.contains(menuEls.status)) box = menuEls.status;
    if (!box) return;
    box.textContent = text;
    box.classList.add("flash");
    flashTimer = setTimeout(function () {
      box.classList.remove("flash");
      if (hud && box === hud.flash) box.textContent = "";
      else refreshMenu();
    }, 4000);
  }
  function diffName(d) {
    return d + " " + ((window.DIFFICULTY_LABELS || {})[d] || "");
  }
  function cleanName(n) {
    return String(n == null ? "" : n).slice(0, 24) || "PLAYER";
  }
  function byJoin(a, b) {
    return (num(a.t) - num(b.t)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  }
  // One entry per presence key, carrying the newest meta it tracked
  function presenceList(ch) {
    var state = ch.presenceState() || {};
    var out = [];
    Object.keys(state).forEach(function (key) {
      var metas = state[key];
      if (!metas || !metas.length) return;
      var m = Object.assign({}, metas[metas.length - 1]);
      m.id = key;
      out.push(m);
    });
    return out;
  }
  function quiet(p) {
    if (p && typeof p.catch === "function") p.catch(function () {});
  }
  function send(ch, event, payload) {
    if (!ch) return;
    try {
      quiet(ch.send({ type: "broadcast", event: event, payload: payload }));
    } catch (e) {}
  }
  function track(ch, meta) {
    try {
      quiet(ch.track(meta));
    } catch (e) {}
  }

  // ---- WHO YOU ARE ------------------------------------------------------------
  // A fresh id per page load, so two tabs are two players. The name is the
  // account, or a numbered guest.
  var myId = randomId(12);
  var guestTag = String(1000 + Math.floor(Math.random() * 9000));
  function myName() {
    return currentUser ? cleanName(currentUser) : "GUEST " + guestTag;
  }
  // A skin id the game knows how to draw. Ownership is checked separately;
  // this keeps anything that is not a plain id out of the picture URL.
  function knownSkin(id) {
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,48}$/.test(id)) return false;
    var has = Object.prototype.hasOwnProperty;
    if (id === "default" || id === REFLECTION_SKIN) return true;
    if (has.call(TRAIL_SKINS, id) || has.call(EMO_FACES, id)) return true;
    if (window.SKIN_IMAGE_OVERRIDES && has.call(window.SKIN_IMAGE_OVERRIDES, id)) return true;
    return typeof skin_definitions === "object" && has.call(skin_definitions, id);
  }
  // What this player is wearing, the way the game decides it in syncActors
  function wornSkin() {
    var skin = gameSettings.currentSkin || "default";
    if (getAvailableSkins().indexOf(skin) === -1) return "default";
    return skin;
  }

  var STYLE = [
    // ---- the block kit ----
    ".lv-block{background:#444;border:4px solid #333;box-shadow:inset 0 -4px 0 #3a3a3a,4px 4px 0 rgba(0,0,0,.35);box-sizing:border-box;color:#fff}",
    ".lv-sw{display:inline-block;flex:none;width:20px;height:20px;position:relative;vertical-align:middle;background-repeat:no-repeat;background-position:center;background-size:contain}",
    ".lv-sw.plain{width:10px;margin:0 5px}",
    ".lv-slot{display:inline-block;flex:none;width:12px;height:12px;background:#2a2a2a;border:2px solid #333;box-sizing:border-box;vertical-align:middle}",
    ".lv-slot.on{background:#335699;border-color:#26467e}",
    ".lv-slots{display:inline-flex;gap:3px;flex:none}",
    ".lv-slots.wide{flex-wrap:wrap;width:147px;max-width:100%}",
    ".lv-place{display:inline-flex;flex:none;align-items:center;justify-content:center;width:24px;height:24px;box-sizing:border-box;border:3px solid #333;background:#555;color:#fff;font-weight:900;font-size:13px;line-height:1}",
    ".lv-place.p1{background:#d4a017;border-color:#8a6a0e;color:#1a1a1a}",
    ".lv-place.p2{background:#a3acb5;border-color:#646c74;color:#1a1a1a}",
    ".lv-place.p3{background:#b06d34;border-color:#6e4320}",
    ".lv-tagblock{display:inline-block;flex:none;background:#335699;border:2px solid #26467e;color:#fff;font-size:10px;font-weight:900;letter-spacing:1px;padding:1px 4px;line-height:1.2}",
    ".lv-tagblock.gold{background:#d4a017;border-color:#8a6a0e;color:#1a1a1a}",
    // The host's KICK beside each other player: a small red block
    ".lv-kick{flex:none;background:#8a2a2a;border:2px solid #5a1616;color:#fff;font:inherit;font-size:10px;font-weight:900;letter-spacing:1px;padding:1px 5px;line-height:1.2;cursor:pointer;text-transform:uppercase}",
    ".lv-kick:hover{border-color:#eee}",
    // HIDE / SHOW on the board: hidden, only the room's name and SHOW stay
    ".lv-board-top{display:flex;align-items:center;gap:8px}",
    ".lv-board-top .lv-code{flex:1;min-width:0}",
    ".lv-hide{flex:none;background:#444;border:2px solid #333;color:#fff;font:inherit;font-size:10px;font-weight:900;letter-spacing:1px;padding:2px 6px;line-height:1.2;cursor:pointer;text-transform:uppercase;box-shadow:2px 2px 0 rgba(0,0,0,.35)}",
    ".lv-hide:hover{border-color:#eee}",
    "#lv-hud .lv-board.lv-folded{width:auto;padding:6px 8px}",
    ".lv-prog{display:inline-flex;gap:2px;flex:none}",
    ".lv-prog i{display:block;width:5px;height:10px;background:#2e2e2e;border:1px solid #333}",
    ".lv-prog i.on{background:#e2e838;border-color:#b5ba2a}",
    // ---- the overlay in a level ----
    "#lv-hud{position:fixed;inset:0;z-index:450;pointer-events:none;font-family:'Courier New',Courier,monospace;color:#fff;text-transform:uppercase;display:none}",
    "#lv-hud .lv-board{position:absolute;top:84px;left:20px;width:270px;max-width:calc(100vw - 40px);padding:8px 10px 10px;font-weight:bold;font-size:13px;pointer-events:auto}",
    "#lv-hud .lv-code{font-size:22px;font-weight:900;letter-spacing:4px;text-shadow:3px 3px 0 #335699;user-select:none}",
    "#lv-hud .lv-sub{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;color:#bbb;font-size:11px;margin:4px 0 6px}",
    "#lv-hud .lv-row{display:flex;gap:7px;align-items:center;padding:5px 0;border-top:3px solid #3a3a3a}",
    "#lv-hud .lv-nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    "#lv-hud .lv-row.me .lv-nm{color:#cfe0ff}",
    "#lv-hud .lv-st{color:#ccc;font-size:11px;flex:none}",
    "#lv-hud .lv-st.done{color:#2ecc71}",
    "#lv-hud .lv-st.dead{color:#e57373}",
    "#lv-hud .lv-bar{position:absolute;left:50%;top:20px;transform:translateX(-50%);display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap;width:max-content;max-width:calc(100vw - 380px);pointer-events:auto}",
    "#lv-hud .lv-note{padding:8px 12px;font-weight:bold;font-size:13px;letter-spacing:1px}",
    "#lv-hud .lv-note:empty{display:none}",
    // A message LIVE has for you (notify), in the bar for a few seconds
    "#lv-hud .lv-flash{background:#335699;border-color:#26467e}",
    ".lv-menu-status.flash{color:#e74c3c}",
    // The results of the last race, at the top of the board
    "#lv-hud .lv-board-head{font-size:12px;font-weight:900;letter-spacing:2px;color:#ffd75e;margin:2px 0 4px}",
    // Inviting friends
    ".lv-pick .lv-inv-row{cursor:default}",
    ".lv-pick .lv-inv-row:hover{border-color:#333}",
    ".lv-pick .lv-inv-row .boi-btn{flex:none;padding:5px 12px;min-height:0;font-size:12px}",
    ".lv-pick .lv-sk-foot{gap:8px}",
    "#lv-hud .lv-bar .boi-btn{min-height:40px;padding:7px 14px}",
    "#lv-hud .lv-big{position:absolute;left:0;right:0;top:24%;display:none;flex-direction:column;align-items:center;pointer-events:none}",
    "#lv-hud .lv-big-main{font-size:clamp(3rem,12vw,7rem);font-weight:900;line-height:1;text-shadow:6px 6px 0 #335699}",
    "#lv-hud .lv-big-sub{font-size:clamp(1rem,3vw,1.6rem);font-weight:bold;color:#fff;text-shadow:3px 3px 0 #335699;margin-top:12px}",
    "#lv-hud .lv-big.drop .lv-big-main{animation:lv-drop .45s both}",
    // The awards show's banners stand on a block like a button's
    "#lv-hud .lv-big.ev{left:50%;right:auto;translate:-50% 0;width:max-content;max-width:calc(100vw - 40px);box-sizing:border-box;padding:16px 28px 20px;background:#444;border:4px solid #333;box-shadow:inset 0 -4px 0 #3a3a3a,4px 4px 0 rgba(0,0,0,.35);text-align:center}",
    "#lv-hud .lv-big.ev .lv-big-main{font-size:clamp(2rem,7vw,4.5rem)}",
    "#lv-hud .lv-big.ev .lv-big-sub{color:#ffd75e;text-shadow:none;font-weight:900;letter-spacing:2px;font-size:clamp(.85rem,2.4vw,1.2rem)}",
    "#lv-hud .lv-big.ev .lv-big-sub:empty{display:none}",
    // The show's name, in one line, in purple
    "#lv-hud .lv-big.intro .lv-big-main{white-space:nowrap;font-size:clamp(1rem,4vw,3rem);color:purple;text-shadow:4px 4px 0 #222}",
    // The countdown, built from blocks: player-blue for the numbers, the
    // green a finished block turns for GO
    "#lv-hud .lv-glyphs{--px:clamp(16px,3.6vw,34px);display:flex;gap:calc(var(--px) * 1.2)}",
    "#lv-hud .lv-glyph{display:grid;grid-template-columns:repeat(3,var(--px));grid-auto-rows:var(--px)}",
    "#lv-hud .lv-glyph i{display:block;box-sizing:border-box}",
    "#lv-hud .lv-glyph i.on{background:#335699;border:3px solid #26467e;box-shadow:3px 3px 0 rgba(0,0,0,.35)}",
    "#lv-hud .lv-glyphs.go .lv-glyph i.on{background:#2ecc71;border-color:#1e8a4c}",
    "#lv-hud .lv-label{position:absolute;left:50%;bottom:28px;transform:translateX(-50%);max-width:calc(100vw - 40px);padding:8px 16px 10px;text-align:center;display:none;pointer-events:none}",
    "#lv-hud .lv-label-head{color:#ccc;font-size:12px;font-weight:bold;letter-spacing:2px}",
    "#lv-hud .lv-label-name{font-size:clamp(1.2rem,3.5vw,2rem);font-weight:900;text-shadow:3px 3px 0 #335699;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    "#lv-hud .lv-label-by{color:#ccc;font-size:12px;font-weight:bold;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    "#lv-hud .lv-label-diff{font-weight:900;text-shadow:1px 1px 0 #222}",
    "#lv-hud .lv-label-coin{margin-top:6px}",
    "body.mobile-mode #lv-hud .lv-label{bottom:16px;max-width:calc(100vw - 300px)}",
    // An upright phone: the arrows and jump fill the bottom, so the level's
    // name goes above them, across the screen, and the countdown drops
    // below the board
    "@media (orientation:portrait){body.mobile-mode #lv-hud .lv-label{bottom:calc(var(--safe-b, 0px) + 104px);max-width:calc(100vw - 20px);padding:6px 12px 8px}body.mobile-mode #lv-hud .lv-big{top:42%}}",
    // Too narrow for the bar between ESC and the corner buttons: it drops
    // below them, across the screen with smaller buttons, and the board goes
    // under it -- as far down as the bar really is (--lv-bar-bottom, kept by
    // a ResizeObserver), so a bar that wraps never covers it
    "@media (max-width:900px){#lv-hud .lv-bar{top:72px;left:10px;right:10px;transform:none;width:auto;max-width:none;gap:6px}#lv-hud .lv-bar .boi-btn{min-height:34px;padding:5px 10px;font-size:12px}#lv-hud .lv-bar .lv-note{padding:6px 10px;font-size:12px}#lv-hud .lv-board{top:calc(var(--lv-bar-bottom, 120px) + 8px);left:10px;width:200px;font-size:11px;padding:6px 8px}}",
    // A phone on its side has little height: the board gets narrower and
    // its rows tighter so it doesn't run into the controls
    "@media (max-width:900px) and (max-height:500px){#lv-hud .lv-board{width:180px;padding:4px 7px}#lv-hud .lv-row{padding:3px 0}#lv-hud .lv-code{font-size:16px;letter-spacing:3px}}",
    // ---- in the level itself ----
    ".lv-racer{position:absolute;left:0;top:0;box-sizing:border-box;background-repeat:no-repeat;background-position:center;background-size:contain}",
    ".lv-trail{position:absolute;left:0;top:0;pointer-events:none;background-repeat:no-repeat;background-position:center;background-size:contain}",
    "#game-container.lv-shake{animation:lv-land .3s both}",
    ".lv-tag{position:absolute;left:0;top:0;transform:translate(-50%,-100%);font:bold 11px 'Courier New',Courier,monospace;color:#fff;background:#444;border:2px solid #333;box-shadow:2px 2px 0 rgba(0,0,0,.35);padding:1px 5px;white-space:nowrap;pointer-events:none;text-transform:uppercase}",
    ".lv-podium{position:absolute;left:0;top:0;transform:translate(-50%,-50%);font-family:'Courier New',Courier,monospace;font-weight:900;color:#6a6a6a;pointer-events:none;line-height:1}",
    // ---- the invite list ----
    ".lv-pick{position:fixed;inset:0;z-index:1600;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;font-family:'Courier New',Courier,monospace;color:#fff;text-transform:uppercase}",
    ".lv-pick .lv-sk-panel{width:min(600px,calc(100vw - 32px));max-height:80vh;display:flex;flex-direction:column;padding:12px 12px 14px}",
    ".lv-pick .lv-sk-title{font-size:22px;font-weight:900;letter-spacing:3px;text-shadow:3px 3px 0 #335699;margin-bottom:8px}",
    ".lv-pick .lv-sk-foot{display:flex;justify-content:flex-end;margin-top:10px}",
    ".lv-pick .lv-lc-list{display:flex;flex-direction:column;gap:4px;overflow-y:auto;min-height:0}",
    // Square, dark scrollbars on the pickers' lists rather than the browser's
    ".lv-pick .lv-lc-list{scrollbar-color:#666 #2a2a2a}",
    ".lv-pick ::-webkit-scrollbar{width:12px}",
    ".lv-pick ::-webkit-scrollbar-track{background:#2a2a2a}",
    ".lv-pick ::-webkit-scrollbar-thumb{background:#666;border:2px solid #2a2a2a}",
    ".lv-pick .lv-lc-row{display:flex;gap:10px;align-items:center;width:100%;background:#383838;border:3px solid #333;color:#fff;font:inherit;font-weight:bold;font-size:13px;padding:7px 10px;cursor:pointer;text-align:left;text-transform:uppercase;flex:none}",
    ".lv-pick .lv-lc-row:hover{border-color:#eee}",
    ".lv-pick .lv-lc-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".lv-pick .lv-lc-by{color:#bbb;font-size:11px;white-space:nowrap;max-width:35%;overflow:hidden;text-overflow:ellipsis}",
    // ---- the LIVE menu ----
    ".lv-menu-status{font-weight:bold;font-size:1.1rem;letter-spacing:2px}",
    ".lv-menu-status.bad{color:#e74c3c}",
    ".lv-menu-status:empty{display:none}",
    ".lv-menu-who{display:flex;align-items:center;gap:8px;color:#bbb;font-size:.85rem;font-weight:bold;text-transform:uppercase;text-align:center}",
    ".lv-join-row{display:flex;align-items:center;justify-content:center;gap:8px}",
    ".lv-code-input{width:150px;height:56px;box-sizing:border-box;background:#2a2a2a;color:#fff;border:4px solid #333;font:inherit;font-size:1.4rem;font-weight:bold;letter-spacing:8px;text-align:center;text-transform:uppercase;outline:none;padding:0 0 0 8px}",
    ".lv-code-input:focus{border-color:#335699}",
    ".lv-room-list{display:flex;flex-direction:column;align-items:stretch;gap:8px;width:min(580px,100%)}",
    ".lv-room{display:flex;align-items:center;gap:14px;width:100%;padding:10px 14px 12px;font:inherit;font-weight:bold;text-transform:uppercase;cursor:pointer;text-align:left}",
    ".lv-room:hover:not(:disabled){border-color:#eee}",
    ".lv-room:disabled{opacity:.55;cursor:not-allowed}",
    ".lv-room .lv-rc{font-size:1.3rem;font-weight:900;letter-spacing:4px;text-shadow:3px 3px 0 #335699;flex:none}",
    ".lv-room .lv-rh{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#ddd}",
    ".lv-menu-empty{color:#888;font-weight:bold;padding:8px;text-align:center;text-transform:uppercase}",
    // ---- the Level Awards event ----
    ".lv-ev-card{display:flex;flex-direction:column;align-items:center;gap:6px;width:min(580px,100%);padding:14px 16px 16px;text-transform:uppercase;text-align:center}",
    ".lv-ev-card .lv-ev-title{font-size:1.5rem;font-weight:900;letter-spacing:3px;text-shadow:3px 3px 0 #335699}",
    ".lv-ev-card .lv-ev-sub{color:#ffd75e;font-weight:900;letter-spacing:2px;font-size:.85rem}",
    ".lv-ev-card .lv-ev-when{color:#ddd;font-weight:bold;font-size:.95rem;letter-spacing:1px;white-space:pre-line}",
    ".lv-ev-card .lv-ev-btns{display:flex;gap:8px;margin-top:4px;flex-wrap:wrap;justify-content:center}",
    "#lv-hud .lv-rev{position:absolute;left:50%;top:16%;transform:translateX(-50%);display:none;flex-direction:column;align-items:center;gap:10px;padding:18px 26px 22px;width:max-content;min-width:min(420px,calc(100vw - 40px));max-width:calc(100vw - 40px);text-align:center;text-transform:uppercase;pointer-events:none}",
    "#lv-hud .lv-rev.on{display:flex}",
    "#lv-hud .lv-rev-cat{color:#ffd75e;font-weight:900;letter-spacing:3px;font-size:clamp(.8rem,2.4vw,1.1rem)}",
    "#lv-hud .lv-rev-place{font-weight:900;font-size:clamp(1.5rem,5.5vw,2.8rem);padding:6px 18px 8px;border:4px solid #333;box-shadow:4px 4px 0 rgba(0,0,0,.35);color:#1a1a1a;line-height:1}",
    "#lv-hud .lv-rev-place.p1{background:#d4a017;border-color:#8a6a0e}",
    "#lv-hud .lv-rev-place.p2{background:#a3acb5;border-color:#646c74}",
    "#lv-hud .lv-rev-place.p3{background:#b06d34;border-color:#6e4320;color:#fff}",
    "#lv-hud .lv-rev-name{font-weight:900;font-size:clamp(1.2rem,4.6vw,2.3rem);text-shadow:4px 4px 0 #335699;max-width:100%;overflow-wrap:anywhere;line-height:1.1}",
    "#lv-hud .lv-rev-by{color:#ccc;font-weight:bold;letter-spacing:1px}",
    "#lv-hud .lv-rev.on .lv-rev-place{animation:lv-drop .45s .15s both}",
    "#lv-hud .lv-rev.on .lv-rev-name{animation:lv-drop .45s 1.4s both}",
    "#lv-hud .lv-rev.on .lv-rev-by{animation:lv-drop .45s 2s both}",
    "#lv-hud .lv-board.lv-ev{max-height:calc(100vh - 150px);overflow-y:auto;overflow-x:hidden}",
    "#lv-hud .lv-ev-cat{font-size:11px;font-weight:900;letter-spacing:1px;color:#ffd75e;margin:8px 0 2px}",
    "#lv-hud .lv-ev-cat.now{color:#fff}",
    "#lv-hud .lv-row.ev-now .lv-nm{color:#cfe0ff}",
    "@media (prefers-reduced-motion:reduce){#lv-hud .lv-rev.on>*{animation:none!important}}",
    // ---- motion: the intro cube's fall and its landing shake ----
    "@keyframes lv-drop{0%{transform:translateY(-50px);opacity:0;animation-timing-function:cubic-bezier(.6,.04,.98,.335)}60%{transform:translateY(0);opacity:1}73%{transform:translate(-3px,3px)}86%{transform:translate(3px,-3px)}100%{transform:none}}",
    "@keyframes lv-land{0%{translate:0 0}33%{translate:-3px 3px}66%{translate:3px -3px}100%{translate:0 0}}",
    "@media (prefers-reduced-motion:reduce){#lv-hud .lv-big.drop .lv-big-main,#game-container.lv-shake{animation:none}}",
  ].join("\n");
  function injectStyles() {
    if (document.getElementById("boi-live-style")) return;
    var s = el("style");
    s.id = "boi-live-style";
    s.textContent = STYLE;
    document.head.appendChild(s);
  }

  var lobby = {
    ch: null,
    status: "off",
    members: [],
    tracked: false,
    synced: false,
    joinedAt: 0,
    sentMeta: "",
  };
  var lobbyPushTimer = null;

  function connectLobby() {
    if (lobby.ch) return;
    if (typeof _supabase === "undefined" || !_supabase || !_supabase.channel) {
      lobby.status = "offline";
      refreshMenu();
      return;
    }
    lobby.status = "connecting";
    lobby.joinedAt = Date.now();
    lobby.tracked = false;
    lobby.synced = false;
    lobby.members = [];
    var ch = _supabase.channel(LOBBY_TOPIC, {
      config: { presence: { key: myId } },
    });
    lobby.ch = ch;
    ch.on("presence", { event: "sync" }, function () {
      if (lobby.ch !== ch) return;
      lobby.members = presenceList(ch);
      lobby.synced = true;
      if (lobby.status === "joining") admitToLobby();
      else if (lobby.status === "on") checkLobbyRank();
      refreshMenu();
    });
    ch.subscribe(function (status, err) {
      if (lobby.ch !== ch) return;
      if (status === "SUBSCRIBED") {
        if (lobby.tracked) {
          // Back after a dropped connection: say we are here again
          lobby.status = "on";
          pushLobbyPresence(true);
        } else {
          lobby.status = "joining";
          if (lobby.synced) admitToLobby();
          // An empty lobby may never send a first sync; go on without it
          else
            setTimeout(function () {
              if (lobby.ch === ch && lobby.status === "joining") admitToLobby();
            }, 1500);
        }
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        if (lobby.tracked) {
          // supabase-js rejoins by itself
          lobby.status = "reconnecting";
        } else {
          var msg = String((err && err.message) || err || "");
          dropLobby(/too_many|limit|capacity/i.test(msg) ? "full" : "offline");
        }
      } else if (status === "CLOSED") {
        if (lobby.status !== "off") dropLobby("offline");
      }
      refreshMenu();
    });
    refreshMenu();
  }

  function admitToLobby() {
    if (lobby.status !== "joining") return;
    var others = lobby.members.filter(function (m) {
      return m.id !== myId;
    }).length;
    if (others >= MAX_ONLINE) {
      dropLobby("full");
      return;
    }
    lobby.status = "on";
    lobby.tracked = true;
    pushLobbyPresence(true);
    refreshMenu();
  }

  // Two players can be let in at once as the last one. Whoever came in later
  // steps back out -- unless they already made it into a room.
  function checkLobbyRank() {
    if (lobby.members.length <= MAX_ONLINE || room) return;
    var order = lobby.members.slice().sort(byJoin);
    var rank = order.findIndex(function (m) {
      return m.id === myId;
    });
    if (rank >= MAX_ONLINE) dropLobby("full");
  }

  function dropLobby(status) {
    var ch = lobby.ch;
    lobby.ch = null;
    lobby.tracked = false;
    lobby.synced = false;
    lobby.members = [];
    lobby.sentMeta = "";
    lobby.status = status || "off";
    clearTimeout(lobbyPushTimer);
    if (ch) {
      try {
        _supabase.removeChannel(ch);
      } catch (e) {}
    }
    refreshMenu();
  }

  function lobbyMeta() {
    var r = room;
    return {
      n: myName(),
      r: r ? r.code : "",
      p: r && r.state.priv ? 1 : 0,
      h: r && isHost() ? 1 : 0,
      ph: r && r.state.phase === "race" ? "race" : "",
      e: r && r.state.ev && r.state.ev.m === "live" ? 1 : 0,
      rl: relaying ? 1 : 0,
      t: lobby.joinedAt,
      v: LIVE_VERSION,
    };
  }

  // Presence is the scarce kind of Realtime message, so it is only sent when
  // what it says has changed, and changes close together go as one.
  function pushLobbyPresence(force) {
    if (!lobby.ch || !lobby.tracked) return;
    clearTimeout(lobbyPushTimer);
    lobbyPushTimer = setTimeout(
      function () {
        if (!lobby.ch || !lobby.tracked) return;
        var meta = lobbyMeta();
        var sig = JSON.stringify(meta);
        if (!force && sig === lobby.sentMeta) return;
        lobby.sentMeta = sig;
        track(lobby.ch, meta);
      },
      force ? 0 : 400,
    );
  }

  function lobbyRooms() {
    var byCode = {};
    lobby.members.forEach(function (m) {
      if (!m.r) return;
      var r =
        byCode[m.r] ||
        (byCode[m.r] = {
          code: String(m.r),
          count: 0,
          host: null,
          priv: false,
          racing: false,
          ev: false,
          v: 1,
        });
      r.count++;
      if (m.h) {
        r.ev = !!m.e;
        r.host = cleanName(m.n);
        r.priv = !!m.p;
        r.racing = m.ph === "race";
        r.v = num(m.v, 1);
      }
    });
    return Object.keys(byCode)
      .map(function (k) {
        return byCode[k];
      })
      .sort(function (a, b) {
        return a.code < b.code ? -1 : 1;
      });
  }

  // Updates a second each relaying player may send. Each update reaches
  // everyone in its room, so a player relaying in a room of n costs n
  // messages per update; all of them together stay inside RELAY_BUDGET.
  function relayRate() {
    var counts = {};
    lobby.members.forEach(function (m) {
      if (m.r) counts[m.r] = (counts[m.r] || 0) + 1;
    });
    var cost = room ? room.members.length : 1;
    lobby.members.forEach(function (m) {
      if (m.rl && m.r && m.id !== myId) cost += counts[m.r] || 1;
    });
    return clamp(RELAY_BUDGET / Math.max(1, cost), 0.5, 6);
  }

  // ---- THE LIVE MENU ----------------------------------------------------------
  var menuEls = null;

  function renderMenu(container) {
    injectStyles();
    container.innerHTML = "";
    // LIVE is for accounts only: a guest is asked to sign in and never joins
    // the lobby
    if (!currentUser) {
      menuEls = null;
      if (lobby.ch) dropLobby("off");
      var ask = el("div", "lv-menu-status", "SIGN IN TO PLAY LIVE");
      var signIn = el("button", "btn", "SIGN IN");
      signIn.onclick = function () {
        if (typeof openLoginModal === "function") openLoginModal();
      };
      var leave = el("button", "btn", "BACK");
      leave.onclick = function () {
        showMenu("main");
      };
      [ask, signIn, leave].forEach(function (n) {
        container.appendChild(n);
      });
      // Signed in from here: on into LIVE
      var wait = setInterval(function () {
        if (!document.body.contains(ask)) clearInterval(wait);
        else if (currentUser) {
          clearInterval(wait);
          renderMenu(container);
        }
      }, 500);
      return;
    }
    connectLobby();
    // Only says something while the lobby isn't up: connecting, full, down
    var status = el("div", "lv-menu-status", "CONNECTING...");
    var who = el("div", "lv-menu-who");
    var create = el("button", "btn", "CREATE ROOM");
    create.onclick = function () {
      if (lobby.status === "full" || lobby.status === "offline") {
        dropLobby("off");
        connectLobby();
      } else createRoom(null);
    };
    var joinRow = el("div", "lv-join-row");
    var input = el("input", "lv-code-input");
    input.maxLength = 4;
    input.placeholder = "CODE";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("aria-label", "Room code");
    var join = el("button", "btn", "JOIN");
    input.oninput = function () {
      input.value = input.value.toUpperCase().replace(/[^A-Z]/g, "");
    };
    input.onkeydown = function (e) {
      if (e.key === "Enter") join.click();
    };
    join.onclick = function () {
      joinRoom(input.value);
    };
    joinRow.appendChild(input);
    joinRow.appendChild(join);
    var list = el("div", "lv-room-list");
    var back = el("button", "btn", "BACK");
    back.onclick = function () {
      showMenu("main");
    };
    var evCard = evMenuCard();
    // Only the awards: no making or joining rooms here
    if (eventOnly()) joinRow.style.display = "none";
    [status, who, evCard, create, joinRow, list, back].forEach(function (n) {
      if (n) container.appendChild(n);
    });
    menuEls = {
      status: status,
      who: who,
      create: create,
      join: join,
      list: list,
    };
    refreshMenu();
  }

  function refreshMenu() {
    if (!menuEls || room || !document.body.contains(menuEls.list)) return;
    var s = lobby.status;
    var ok = s === "on";
    if (!menuEls.status.classList.contains("flash"))
      menuEls.status.textContent =
      s === "on"
        ? ""
        : s === "full"
          ? "SERVERS FULL, TRY AGAIN SOON"
          : s === "offline"
            ? "CAN'T REACH THE SERVERS"
            : s === "reconnecting"
              ? "RECONNECTING..."
              : "CONNECTING...";
    menuEls.status.classList.toggle(
      "bad",
      s === "full" || s === "offline" || menuEls.status.classList.contains("flash"),
    );
    menuEls.who.innerHTML = "";
    menuEls.who.appendChild(swatch(wornSkin()));
    menuEls.who.appendChild(
      document.createTextNode(
        "PLAYING AS " + myName() + (currentUser ? "" : " (SIGN IN TO WEAR YOUR SKINS)"),
      ),
    );
    menuEls.create.textContent =
      s === "full" || s === "offline" ? "TRY AGAIN" : "CREATE ROOM";
    menuEls.create.disabled = !(ok || s === "full" || s === "offline");
    // Only the awards: the button is only there as TRY AGAIN
    if (eventOnly())
      menuEls.create.style.display = s === "full" || s === "offline" ? "" : "none";
    menuEls.join.disabled = !ok;

    var list = menuEls.list;
    list.innerHTML = "";
    if (eventOnly()) {
      list.appendChild(el("div", "lv-menu-empty", EVENT_ONLY_TEXT));
      return;
    }
    if (!ok) return;
    var rooms = lobbyRooms().filter(function (r) {
      return !r.priv;
    });
    if (!rooms.length) {
      list.appendChild(el("div", "lv-menu-empty", "NO OPEN ROOMS, CREATE ONE"));
      return;
    }
    // Each open room as a block: its code, its host, its seats, and a tag
    // for a race under way
    rooms.forEach(function (r) {
      var b = el("button", "lv-room lv-block");
      b.appendChild(el("span", "lv-rc", r.code));
      b.appendChild(el("span", "lv-rh", r.host || "..."));
      b.appendChild(seats(r.count, sizeOf(r.ev)));
      b.appendChild(
        el(
          "span",
          "lv-tagblock" + (r.racing || r.ev ? " gold" : ""),
          r.ev ? "AWARDS" : r.racing ? "RACING" : "OPEN",
        ),
      );
      b.disabled = r.count >= sizeOf(r.ev);
      b.onclick = function () {
        joinRoom(r.code);
      };
      list.appendChild(b);
    });
  }

  // ---- ROOMS ------------------------------------------------------------------
  var room = null;
  var relaying = false;
  var prevGameMode = null;
  var housekeepingTimer = null;

  function isHost() {
    return !!room && room.hostId === myId;
  }
  // How many a room holds: an event room (`ev` in the lobby, or a room
  // showing the awards) more than an ordinary one
  function sizeOf(isEvent) {
    return isEvent ? EVENT_ROOM_SIZE : ROOM_SIZE;
  }
  function roomSize(r) {
    return sizeOf(!!(r && (r.big || r.state.ev)));
  }

  function createRoom(init) {
    if (lobby.status !== "on") return;
    if (eventOnly() && !(init && init.ev)) return notify(EVENT_ONLY_TEXT);
    var taken = {};
    lobbyRooms().forEach(function (r) {
      taken[r.code] = true;
    });
    var code;
    do {
      code = "";
      for (var i = 0; i < 4; i++)
        code += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
    } while (taken[code]);
    enterRoom(code, true, init);
  }

  function joinRoom(code) {
    code = String(code || "")
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 4);
    if (code.length !== 4) {
      notify("ROOM CODES ARE 4 LETTERS");
      return;
    }
    if (lobby.status !== "on") {
      notify("NOT CONNECTED YET");
      return;
    }
    var r = lobbyRooms().find(function (x) {
      return x.code === code;
    });
    if (!r) {
      notify("NO ROOM CALLED " + code);
      return;
    }
    if (eventOnly() && !r.ev) {
      notify(EVENT_ONLY_TEXT);
      return;
    }
    if (r.count >= sizeOf(r.ev)) {
      notify("ROOM " + code + " IS FULL");
      return;
    }
    if (r.host && r.v !== LIVE_VERSION) {
      notify("ROOM " + code + " IS ON ANOTHER VERSION OF LIVE, RELOAD THE PAGE");
      return;
    }
    enterRoom(code, false);
    // Known to be an event room before its state arrives, so it isn't
    // taken for a full ordinary room meanwhile
    if (room) room.big = !!r.ev;
  }

  function enterRoom(code, creating, init) {
    if (room || !currentUser) return;
    injectStyles();
    var r = (room = {
      code: code,
      ch: null,
      status: "joining",
      members: [],
      knownIds: {},
      peers: {},
      remotes: {},
      hostId: creating ? myId : null,
      hostFlag: !!creating,
      joinedAt: Date.now(),
      state: Object.assign(
        {
          phase: "lobby",
          round: 0,
          maxDiff: 5,
          priv: false,
          v: 0,
          ev: null,
          // The lobby: the environment of whoever made the room
          env: creating && window.boiSelectedEnvironment ? window.boiSelectedEnvironment() : "default",
          coll: true,
        },
        init || {},
      ),
      gotState: !!creating,
      fins: {},
      finDeaths: {},
      firstFinAt: null,
      myFinish: null,
      recent: [],
      starting: false,
      startedRound: 0,
      spectRound: 0,
      showoffRound: 0,
      picker: null,
      barKey: "",
    });
    var ch = _supabase.channel(ROOM_TOPIC + code, {
      config: { broadcast: { self: false }, presence: { key: myId } },
    });
    r.ch = ch;
    function mine(fn) {
      return function (msg) {
        if (room === r && msg && msg.payload) fn(msg.payload);
      };
    }
    ch.on("broadcast", { event: "state" }, mine(onStateMessage));
    ch.on("broadcast", { event: "fin" }, mine(onFinish));
    ch.on("broadcast", { event: "sig" }, mine(onSignal));
    ch.on(
      "broadcast",
      { event: "pos" },
      mine(function (p) {
        onRemoteState(String(p.id), p, true);
      }),
    );
    ch.on(
      "broadcast",
      { event: "wev" },
      mine(function (p) {
        if (p.k === "emo") onRemoteEmote(String(p.from), p);
        else onWorldMessage(String(p.from), p);
      }),
    );
    ch.on(
      "broadcast",
      { event: "bump" },
      mine(function (p) {
        if (p.to === myId) onBump(String(p.from), p);
      }),
    );
    ch.on("presence", { event: "sync" }, function () {
      if (room === r) onRoomPresence();
    });
    ch.subscribe(function (status, err) {
      if (room !== r) return;
      if (status === "SUBSCRIBED") {
        r.status = "on";
        track(ch, roomMeta());
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        if (r.status === "joining") {
          var msg = String((err && err.message) || err || "");
          leaveRoom(/too_many/i.test(msg) ? "SERVERS FULL" : "COULDN'T JOIN " + code);
        } else r.status = "reconnecting";
      } else if (status === "CLOSED") {
        leaveRoom("DISCONNECTED FROM " + code);
      }
    });

    prevGameMode = currentGameMode;
    currentGameMode = "live";
    setRoomLink(code);
    clearInterval(housekeepingTimer);
    housekeepingTimer = setInterval(housekeeping, 250);
    enterHub();
    pushLobbyPresence();
  }

  function roomMeta() {
    return {
      n: myName(),
      u: currentUser || null,
      t: room.joinedAt,
      h: room.hostFlag ? 1 : 0,
    };
  }

  function leaveRoom(reason) {
    if (!room) return;
    // What I changed in the race goes back for the others now, rather than
    // when the server notices I've gone
    if (run && run.kind === "race" && run.changes) undoMine();
    stopPicker();
    var r = room;
    room = null;
    evShown = null;
    evNote = "";
    hideReveal();
    clearInterval(housekeepingTimer);
    Object.keys(r.peers).forEach(function (id) {
      r.peers[id].close();
    });
    try {
      r.ch.untrack();
    } catch (e) {}
    try {
      _supabase.removeChannel(r.ch);
    } catch (e) {}
    relaying = false;
    closeInvitePanel();
    currentGameMode = prevGameMode || "campaign";
    setRoomLink(null);
    stopRun();
    pushLobbyPresence();
    refreshMenu();
    if (reason) notify(reason);
  }

  function memberOf(id) {
    if (!room) return null;
    for (var i = 0; i < room.members.length; i++)
      if (room.members[i].id === id) return room.members[i];
    return null;
  }
  function nameOf(id, fallback) {
    var m = memberOf(id);
    return cleanName(m ? m.n : fallback);
  }

  function onRoomPresence() {
    var r = room;
    var list = presenceList(r.ch).sort(byJoin);
    r.members = list;
    var mine = list.findIndex(function (m) {
      return m.id === myId;
    });
    if (mine === -1) {
      renderBoard();
      return;
    }
    // More than a room holds got in together: the latest to join goes again
    var size = roomSize(r);
    if (list.length > size && mine >= size && !r.hostFlag) {
      leaveRoom("ROOM " + r.code + " IS FULL");
      return;
    }

    // The host is whoever holds the flag (the lowest id if two somehow do).
    // When the host leaves, the lowest id left picks the flag up. Ids rather
    // than join times, so no one's clock can decide it.
    var flagged = list
      .filter(function (m) {
        return m.h;
      })
      .map(function (m) {
        return m.id;
      })
      .sort();
    var host = flagged.length
      ? flagged[0]
      : list
          .map(function (m) {
            return m.id;
          })
          .sort()[0];
    r.hostId = host;
    if (host === myId && !r.hostFlag) {
      r.hostFlag = true;
      track(r.ch, roomMeta());
    } else if (host !== myId && r.hostFlag) {
      r.hostFlag = false;
      track(r.ch, roomMeta());
    }

    syncPeers();

    // Whoever just came in hears the room's state from the host. If the
    // picker is still spinning they are in this race too.
    if (host === myId) {
      var fresh = list.filter(function (m) {
        return m.id !== myId && !r.knownIds[m.id];
      });
      if (fresh.length) {
        var st = r.state;
        if (st.phase === "race" && st.goAt - now() > 2000) {
          var players = st.players.slice();
          fresh.forEach(function (m) {
            if (!players.some(function (p) { return p.id === m.id; }))
              players.push({ id: m.id, n: cleanName(m.n) });
          });
          hostSetState({ players: players });
        } else broadcastState(st);
      }
    }
    r.knownIds = {};
    list.forEach(function (m) {
      r.knownIds[m.id] = true;
    });
    Object.keys(r.remotes).forEach(function (id) {
      if (!r.knownIds[id]) removeRemote(id);
    });
    renderBoard();
    renderBar();
    pushLobbyPresence();
  }

  // ---- THE ROOM'S STATE ---------------------------------------------------------
  // Only the host changes it. Times travel as "this long from now", because
  // no two players' clocks agree.
  function broadcastState(st) {
    if (!room) return;
    var t = now();
    var wire = {
      host: myId,
      v: st.v,
      phase: st.phase,
      round: st.round,
      maxDiff: st.maxDiff,
      priv: st.priv,
      wins: st.wins || {},
      kicked: st.kicked || [],
      env: st.env || "default",
      coll: st.coll === false ? 0 : 1,
      // when the show started, as "this long ago" like every other time
      ev: st.ev ? { m: st.ev.m, at: Math.round(st.ev.start - Date.now()) } : null,
    };
    if (st.phase === "race" || st.phase === "showoff") {
      wire.pick = st.pick;
      wire.diff = st.diff;
      wire.raceId = st.raceId;
    }
    if (st.phase === "race") {
      wire.ids = st.ids;
      wire.players = st.players;
      wire.goIn = Math.round(st.goAt - t);
    } else if (st.phase === "showoff") {
      wire.results = st.results;
      wire.endsIn = Math.round(st.endsAt - t);
    }
    send(room.ch, "state", wire);
  }

  function hostSetState(patch) {
    if (!isHost()) return;
    var st = Object.assign({}, room.state, patch);
    st.v = (room.state.v || 0) + 1;
    broadcastState(st);
    applyState(st);
  }

  function onStateMessage(w) {
    if (room.gotState && num(w.v) < num(room.state.v)) return;
    var t = now();
    var st = {
      v: num(w.v),
      phase: w.phase === "race" || w.phase === "showoff" ? w.phase : "lobby",
      round: Math.max(0, Math.floor(num(w.round))),
      maxDiff: clamp(Math.round(num(w.maxDiff, 5)), 1, 10),
      priv: !!w.priv,
      wins: {},
      kicked: readKicked(w.kicked),
      env: cleanEnv(w.env),
      // An older copy of LIVE sends none: on
      coll: w.coll !== 0,
      ev:
        w.ev && /^(live|preview|replay)$/.test(w.ev.m)
          ? { m: w.ev.m, start: Date.now() + num(w.ev.at) }
          : null,
    };
    if (w.wins && typeof w.wins === "object")
      Object.keys(w.wins)
        .slice(0, 20)
        .forEach(function (id) {
          st.wins[String(id).slice(0, 32)] = Math.max(0, Math.floor(num(w.wins[id])));
        });
    if (st.phase === "race" || st.phase === "showoff") {
      st.pick = Number(w.pick);
      st.diff = clamp(Math.round(num(w.diff)), 0, 10);
      st.raceId = String(w.raceId || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 32);
    }
    if (st.phase === "race") {
      st.ids = (Array.isArray(w.ids) ? w.ids : [])
        .map(Number)
        .filter(isFinite)
        .slice(0, 30);
      st.pick = Number(w.pick);
      st.players = (Array.isArray(w.players) ? w.players : [])
        .slice(0, EVENT_ROOM_SIZE * 2)
        .map(function (p) {
          return { id: String(p && p.id), n: cleanName(p && p.n) };
        });
      // A round already under way keeps the GO it has
      st.goAt =
        room.state.phase === "race" &&
        room.state.round === st.round &&
        room.state.goAt
          ? room.state.goAt
          : t + num(w.goIn);
      if (!isFinite(st.pick)) return;
    } else if (st.phase === "showoff") {
      st.results = (Array.isArray(w.results) ? w.results : [])
        .slice(0, EVENT_ROOM_SIZE * 2)
        .map(function (r) {
          var time = r && r.time != null ? num(r.time, -1) : null;
          return {
            id: String(r && r.id),
            n: cleanName(r && r.n),
            time: time == null || time < 0 ? null : time,
            d: r && r.d != null ? Math.max(0, Math.floor(num(r.d))) : null,
          };
        });
      st.endsAt = t + num(w.endsIn);
    }
    room.gotState = true;
    applyState(st);
  }

  function applyState(st) {
    var r = room;
    if (amKicked(st)) {
      leaveRoom("YOU WERE KICKED FROM ROOM " + r.code);
      return;
    }
    var prev = r.state;
    r.state = st;
    // The room's lobby, learned (joining) or different: stand in that one
    if (run && run.kind === "hub" && (prev.env || "default") !== (st.env || "default"))
      enterHub(null, true);
    if (st.phase === "race") {
      if (prev.phase !== "race" || prev.round !== st.round) {
        r.fins = {};
        r.finDeaths = {};
        r.firstFinAt = null;
        r.myFinish = null;
      }
      var inIt = st.players.some(function (p) {
        return p.id === myId;
      });
      if (inIt && r.startedRound !== st.round) {
        r.startedRound = st.round;
        startRound(st);
      } else if (!inIt && r.spectRound !== st.round) {
        r.spectRound = st.round;
        enterHub();
        bigBanner("RACE IN PROGRESS", "YOU'RE IN THE NEXT ONE", false, 4000);
      }
    } else if (st.phase === "showoff") {
      if (r.showoffRound !== st.round) {
        r.showoffRound = st.round;
        enterShowoff(st);
      }
    } else if (!st.ev) {
      stopPicker();
      if (run && run.kind !== "hub") enterHub();
    }
    // The show moves on its own clock (evTick); a change to it (SKIP, or
    // it ending) is taken up at once
    if (st.ev || prev.ev) evTick();
    renderBoard();
    renderBar();
    pushLobbyPresence();
  }

  // ---- KICKING ------------------------------------------------------------------
  // The host can put anyone else out of the room. Who is out rides in the
  // room's state: their id there and, if they were signed in, their account
  // -- so the same account coming back in under a new id goes straight out
  // again. Each game takes itself out when it sees itself on the list.
  function readKicked(list) {
    return (Array.isArray(list) ? list : []).slice(-30).map(function (k) {
      return {
        id: String((k && k.id) || "").slice(0, 32),
        u: k && k.u ? String(k.u).slice(0, 40) : null,
      };
    });
  }
  function amKicked(st) {
    return (st.kicked || []).some(function (k) {
      return k.id === myId || (!!k.u && !!currentUser && k.u === currentUser);
    });
  }
  function hostKick(id) {
    if (!room || !isHost() || id === myId) return;
    var m = memberOf(id);
    if (!m) return;
    var patch = {
      kicked: (room.state.kicked || [])
        .concat([{ id: id, u: m.u && m.u !== currentUser ? m.u : null }])
        .slice(-30),
    };
    // Out of the race they were in too
    if (room.state.phase === "race")
      patch.players = room.state.players.filter(function (p) {
        return p.id !== id;
      });
    hostSetState(patch);
    notify(cleanName(m.n) + " WAS KICKED");
  }
  function askKick(id) {
    var m = memberOf(id);
    if (!m || !isHost() || typeof popupManager !== "object") return;
    popupManager.show({
      title: "KICK " + cleanName(m.n) + "?",
      message: "They'll be taken out of the room.",
      buttons: [
        { text: "KICK", onClick: function () { hostKick(id); } },
        { text: "CANCEL", class: "secondary", onClick: function () {} },
      ],
    });
  }
  // On the host's board, beside everyone else. The board is drawn again
  // every so often, so it acts on the press rather than the click.
  function canKick(m) {
    return !!m && m.id !== myId && isHost();
  }
  function kickButton(m) {
    var b = el("button", "lv-kick", "KICK");
    b.type = "button";
    b.title = "Kick " + cleanName(m.n) + " from the room";
    b.onpointerdown = function (e) {
      e.preventDefault();
      askKick(m.id);
    };
    return b;
  }

  // ---- THE HOST'S JOBS --------------------------------------------------------
  // Official levels only (the admins' official rating), up to the host's
  // max difficulty, leaving out any marked impossible. Each as { id,
  // difficulty }.
  function levelPool(maxDiff) {
    var table = typeof levelsTable === "function" ? levelsTable() : "published_levels";
    return _supabase
      .from(table)
      .select("id, difficulty, impossible")
      .eq("official_rating", true)
      .gte("difficulty", 1)
      .lte("difficulty", maxDiff)
      .then(function (res) {
        if (res.error || !res.data) return [];
        var seen = {};
        return res.data
          .filter(function (r) {
            if (r.impossible || seen[r.id]) return false;
            seen[r.id] = true;
            return true;
          })
          .map(function (r) {
            return { id: Number(r.id), difficulty: Math.round(num(r.difficulty, 1)) };
          });
      });
  }

  // The level is always left to chance: nobody picks it, the host only says
  // how hard it can be
  function hostStart() {
    if (!isHost() || room.starting || room.state.phase === "race") return;
    var r = room;
    r.starting = true;
    renderBar();
    levelPool(r.state.maxDiff)
      .then(function (pool) {
        if (room !== r || !isHost()) return;
        if (!pool.length) {
          notify("NO OFFICIAL LEVELS UP TO " + diffName(r.state.maxDiff));
          return;
        }
        var fresh = pool.filter(function (row) {
          return r.recent.indexOf(row.id) === -1;
        });
        if (!fresh.length) fresh = pool;
        var row = fresh[Math.floor(Math.random() * fresh.length)];
        var pick = row.id;
        var diff = row.difficulty;
        r.recent.push(pick);
        if (r.recent.length > 10) r.recent.shift();
        var others = shuffle(
          pool.filter(function (row) {
            return row.id !== pick;
          }),
        )
          .slice(0, 13)
          .map(function (row) {
            return row.id;
          });
        hostSetState({
          phase: "race",
          round: r.state.round + 1,
          ids: others.concat([pick]),
          pick: pick,
          diff: diff,
          // Names this race for its Blue Coin, so it can only pay once
          raceId: myId.slice(0, 6) + Date.now().toString(36),
          players: r.members.map(function (m) {
            return { id: m.id, n: cleanName(m.n) };
          }),
          goAt: now() + GO_DELAY,
        });
      })
      .catch(function () {
        notify("COULDN'T PICK A LEVEL");
      })
      .then(function () {
        r.starting = false;
        if (room === r) renderBar();
      });
  }

  function hostTick(t) {
    var st = room.state;
    if (st.phase === "race") {
      if (t < st.goAt) return;
      var here = st.players.filter(function (p) {
        return room.knownIds[p.id];
      });
      var allDone =
        here.length > 0 &&
        here.every(function (p) {
          return room.fins[p.id] != null;
        });
      var late = room.firstFinAt && t - room.firstFinAt > AFTER_FIRST_MS;
      if (allDone || late || !here.length || t - st.goAt > RACE_MAX_MS) endRace();
    } else if (st.phase === "showoff") {
      if (t >= st.endsAt) hostSetState({ phase: "lobby" });
    }
  }

  function endRace() {
    if (!isHost() || room.state.phase !== "race") return;
    var results = room.state.players.map(function (p) {
      var rm = room.remotes[p.id];
      var deaths =
        room.finDeaths && room.finDeaths[p.id] != null
          ? room.finDeaths[p.id]
          : p.id === myId
            ? run && run.deaths
            : rm && rm.dt;
      return {
        id: p.id,
        n: p.n,
        time: room.fins[p.id] != null ? room.fins[p.id] : null,
        d: deaths != null ? Math.max(0, Math.floor(num(deaths))) : null,
      };
    });
    results.sort(function (a, b) {
      if (a.time == null || b.time == null)
        return (a.time == null) - (b.time == null);
      return a.time - b.time;
    });
    // The room's tally of wins, kept by the host and shown on the board
    var wins = Object.assign({}, room.state.wins || {});
    if (results[0] && results[0].time != null)
      wins[results[0].id] = (wins[results[0].id] || 0) + 1;
    hostSetState({
      phase: "showoff",
      results: results,
      wins: wins,
      endsAt: now() + SHOWOFF_MS,
    });
  }

  var boardAt = 0;
  function housekeeping() {
    if (!room) return;
    var t = now();
    tendPeers(t);
    if (isHost()) hostTick(t);
    evTick();
    // The link times on the board, and in a race everyone's coins
    if (t - boardAt > (room.state.phase === "race" ? 500 : 2000)) {
      boardAt = t;
      renderBoard();
    }
  }


  // ---- A ROUND ------------------------------------------------------------------
  function startRound(st) {
    clearBanner();
    stopPicker();
    if (!run || (run.kind !== "hub" && run.kind !== "flip")) enterHub();
    fetchLevels(st.ids);
    var flips = pickerFlips(st.ids, st.pick);
    room.picker = {
      round: st.round,
      pick: st.pick,
      start: st.goAt - GO_DELAY,
      seq: flips.seq,
      times: flips.times,
      shown: -1,
      askedAt: 0,
      timer: setInterval(pickerTick, 30),
    };
    showLabel("PICKING A LEVEL", "UP TO " + diffName(st.maxDiff), null);
  }

  function finishRace(t) {
    run.finished = true;
    // On a shared level, by the race clock the level itself keeps, so a
    // slow frame neither adds to nor takes from anyone's time
    var time = Math.max(
      0,
      Math.round(
        run.level.lvShared ? (run.level.age - run.ageAtGo) * 1000 : t - run.goAt,
      ),
    );
    var msg = {
      round: room.state.round,
      id: myId,
      n: myName(),
      time: time,
      d: run.deaths || 0,
    };
    send(room.ch, "fin", msg);
    onFinish(msg);
    // Done: whatever I changed in the level goes back for the others
    if (run.level.lvShared) undoMine();
  }

  function onFinish(msg) {
    var r = room;
    if (r.state.phase !== "race" || num(msg.round, -1) !== r.state.round) return;
    var id = String(msg.id);
    var time = num(msg.time, -1);
    if (time < 0 || r.fins[id] != null) return;
    if (id !== myId && !r.state.players.some(function (p) { return p.id === id; }))
      return;
    r.fins[id] = time;
    r.finDeaths[id] = Math.max(0, Math.floor(num(msg.d)));
    if (!r.firstFinAt) r.firstFinAt = now();
    var place = finishPlace(id);
    if (id === myId) {
      r.myFinish = time;
      bigBanner("FINISHED", ordinal(place) + " IN " + formatTime(time), true, 3500);
    }
    renderBoard();
  }

  function finishPlace(id) {
    var fins = room.fins;
    var mine = fins[id];
    var place = 1;
    Object.keys(fins).forEach(function (k) {
      if (k !== id && (fins[k] < mine || (fins[k] === mine && k < id))) place++;
    });
    return place;
  }

  function enterShowoff(st) {
    stopPicker();
    clearBanner();
    var rank = st.results.findIndex(function (r) {
      return r.id === myId;
    });
    var onPodium = rank >= 0 && rank < 3 && st.results[rank].time != null;
    var podium = roomEnv().podium;
    enterHub(onPodium && podium && podium[rank] ? podium[rank] : floorSpot(), true);
    renderBoard();
    claimWin(st);
  }

  // ---- PLAYING A LEVEL ----------------------------------------------------------
  // The hub and each race level run in a loop of LIVE's own rather than the
  // game's startGameLevel: a death respawns you at the start without ending
  // anything, a finish leaves you in the level watching the others, and
  // nothing a community level would record (plays, beats, verifications) is.
  var run = null;

  function enterHub(spot, force) {
    if (run && run.kind === "hub" && !force) return;
    showLevel(roomEnv().data, "hub", "hub", spot || floorSpot());
  }

  function newRun(data, kind, token) {
    return {
      data: data,
      kind: kind, // hub | flip | race | event
      token: token,
      spawnId: run ? run.spawnId : 0,
      level: null,
      display: null,
      layers: null,
      goAt: kind === "race" && room ? room.state.goAt : 0,
      finished: false,
      // What the last position packet said (see sendDue)
      sentAt: -1e9,
      sentBits: -1,
      sentLv: null,
      sentSp: -1,
      sentX: 0,
      sentY: 0,
      sentH: 0,
      sentR: 0,
      sentExtras: "",
      extrasAt: -1e9,
      vx: 0,
      vy: 0,
      inBits: 0,
      shownCount: 0,
      wentGo: false,
      timerAt: -1e9,
    };
  }

  function showLevel(data, kind, token, spawn) {
    var fromMenu = !activeLevelDisplay;
    if (fromMenu && typeof menuMusicState === "object") {
      menuMusicState.trackId = currentPlayingTrackId;
      menuMusicState.time =
        currentAudio && !currentAudio.loop ? currentAudio.currentTime : 0;
    }
    // The picker's cards keep the room's music going; a race brings its own
    var newMusic =
      !run || kind === "race" || kind === "event" || (run.kind !== kind && run.kind !== "flip");
    clearGame();
    run = newRun(data, kind, token);
    pushesOnMe = {};
    window.currentLevelData = data;
    gameTimerRunning = false;
    gameTimerStart = 0;
    gameTimer = 0;
    prepareScreen();
    // A race starts with everyone already standing where they will be at GO,
    // so the level that lands is the level you race in, block for block
    buildLevel(spawn, kind === "race");
    if (kind === "race" && room)
      shareLevel(run.level, room.state.round * 7919 + num(room.state.pick));
    if (newMusic) playMusic(null, true);
    runAnimation(liveFrame);
    renderBar();
    renderBoard();
  }

  // One card of the level picker: the real level, with you in it. Nothing
  // runs in it; it is only up for a moment.
  function showFlip(data) {
    clearGame();
    run = newRun(data, "flip", "flip");
    window.currentLevelData = data;
    try {
      buildLevel(null, true);
    } catch (e) {
      run.level = run.display = null;
    }
  }

  // What startGameLevel and runLevel do to the page around a level
  function prepareScreen() {
    document.getElementById("main-menu").style.display = "none";
    var hudEl = document.getElementById("hud");
    hudEl.innerText = "ESC";
    hudEl.style.display = "block";
    ["restart-btn", "zoom-btn", "hitbox-btn"].forEach(function (id) {
      var b = document.getElementById(id);
      if (b) b.style.display = "flex";
    });
    if (typeof updateZoomButtonIcon === "function")
      updateZoomButtonIcon(globalCameraMode);
    document.getElementById("timer-display").style.display = "none";
    document.getElementById("highscore-display").style.display = "none";
    var practice = document.getElementById("practice-controls");
    if (practice) practice.style.display = "none";
    if (typeof hideFormerLegendaryTag === "function") hideFormerLegendaryTag();
    document.body.classList.add("in-game");
    if (typeof updateEmoteButton === "function") updateEmoteButton();
    if (document.body.classList.contains("mobile-mode")) {
      if (typeof updateMobileButtonSize === "function") updateMobileButtonSize();
      if (screen.orientation && screen.orientation.unlock) {
        try {
          screen.orientation.unlock();
        } catch (e) {}
      }
    }
    showHud();
  }

  // settle: a moment of play with no keys before the first frame, so the
  // block stands on the floor instead of hanging where it spawned
  function buildLevel(spawn, settle) {
    if (run.display) {
      try {
        run.display.clear();
      } catch (e) {}
    }
    // Level reads the data it is given as it builds, so each life gets a
    // copy, as startGameLevel does
    var level = new Level(JSON.parse(JSON.stringify(run.data)));
    // Racing is where skins are shown off, so a level's FORCE DEFAULT SKIN
    // doesn't apply here
    level.forceDefaultSkin = false;
    if (spawn && level.player) level.player.pos = new Vector(spawn.x, spawn.y);
    if (settle)
      for (var i = 0; i < 18 && !level.status; i++) level.animate(1 / 60, NO_KEYS);
    var display = new DOMDisplay(document.getElementById("game-container"), level);
    // A phone held upright: the whole level across it ("wide") draws blocks
    // a few px wide. Start in Focus there instead -- this race only; the
    // game's own camera setting is left alone, and the zoom button still
    // switches back.
    if (
      document.body.classList.contains("mobile-mode") &&
      display.cameraMode === "wide" &&
      !level.disableZoom &&
      display.scale < PHONE_MIN_BLOCK_PX
    ) {
      display.cameraMode = "focus";
      display.updateScale();
      level.backgroundDirty = true;
      display.drawFrame();
      if (typeof updateZoomButtonIcon === "function") updateZoomButtonIcon("focus");
    }
    activeLevelDisplay = display;
    run.level = level;
    run.display = display;
    run.spawnId++;
    run.layers = makeLayers(display);
    if (room)
      Object.keys(room.remotes).forEach(function (id) {
        detachRemote(room.remotes[id]);
      });
  }

  // Remote racers go just under the level's own actors, so your block and
  // the level's objects stay on top; their name tags go over everything.
  function makeLayers(display) {
    var racers = el("div");
    var tags = el("div");
    [racers, tags].forEach(function (l) {
      l.style.position = "absolute";
      l.style.left = "0";
      l.style.top = "0";
      l.style.pointerEvents = "none";
    });
    display.world.insertBefore(racers, display.actorLayer);
    display.world.appendChild(tags);
    return { racers: racers, tags: tags, podium: null, podiumScale: 0 };
  }

  function stopRun() {
    hideHud();
    if (!run) return;
    run = null;
    window.currentLevelData = null;
    // The game's own way out of a level; it returns to the LIVE menu
    realExitToMenu();
  }

  function respawn() {
    if (!run || run.kind === "flip") return;
    pushesOnMe = {};
    if (run.kind === "race" && run.level.lvShared) softRespawn();
    else buildLevel(run.kind === "hub" ? floorSpot() : null, false);
  }

  function liveFrame(step) {
    if (!run || !room || run.kind === "flip") return false;
    var t = now();
    var level = run.level;
    var p = level.player;
    var startX = p ? p.pos.x : 0;
    var startY = p ? p.pos.y : 0;
    // Everyone is held at the start until GO
    var counting = run.kind === "race" && t < run.goAt;

    // Seconds of play this frame
    var played = 0;
    if (!counting) {
      var keys = run.finished ? NO_KEYS : getInputs();
      run.inBits =
        (keys.left ? 1 : 0) | (keys.right ? 2 : 0) | (keys.up ? 4 : 0) | (keys.down ? 8 : 0);
      if (level.lvShared) {
        // A shared level runs on the race clock in fixed steps, the same
        // steps in every game. With steps the size of each frame, a moving
        // block lost a different sliver of time at every bounce in every
        // game, and half a minute in they were half a block apart. A game
        // that fell behind (a slow frame, a hidden tab) takes as many steps
        // as it needs, WORLD_STEPS_MAX a frame.
        var due = run.ageAtGo + (t - run.goAt) / 1000;
        for (var n = 0; n < WORLD_STEPS_MAX && level.age + WORLD_STEP <= due + 1e-9; n++) {
          if (level.player) applyPushes(level.player, t, WORLD_STEP);
          level.animate(WORLD_STEP, keys);
          played += WORLD_STEP;
          if (!run.finished && level.status === "won") finishRace(t);
        }
        noteTriggers();
        lateUndos();
        if (run.undoQueue.length) tryUndo();
      } else {
        if (p) applyPushes(p, t, step);
        level.animate(step, keys);
        played = step;
        if (run.kind === "race" && !run.finished && level.status === "won")
          finishRace(t);
        if (run.kind === "event" && !run.finished && level.status === "won") {
          run.finished = true;
          bigBanner("BEAT IT", "", true, 2500, false, "ev");
        }
      }
    } else run.inBits = 0;
    if (p && played > 0 && level === run.level) {
      run.vx = (p.pos.x - startX) / played;
      run.vy = (p.pos.y - startY) / played;
    }

    // Where everyone else is this frame, then bumping into them, then drawing
    placeRemotes(t, step);
    if (!counting) touchOthers(level, t);
    run.display.drawFrame(step);
    drawRemotes(t, step);
    hudTick(t);
    sendState(t, step);

    if (level.isFinished() && level.status === "lost") respawn();
  }

  // ---- TALKING TO THE OTHERS ------------------------------------------------------
  // A position is one snapshot: [time, x, y, height, vx, vy, gravity,
  // rotation, status, keys]. Direct links get one per packet, 30 times a
  // second; the Realtime fallback carries the ones taken since its last
  // message, all together, so the motion it shows stays smooth even when the
  // messages themselves are few.
  var lastRelayAt = 0;
  var relayBuf = [];
  var relayBufFor = "";
  var relaySampleAt = 0;

  // When the next packet is due: right away (next frame) when your keys,
  // state or life changed -- that is what the others can't work out for
  // themselves -- SEND_HZ while you move (or move the grinders), and only a
  // heartbeat while you stand still.
  function sendDue(t, p, level) {
    var st = level.status === "lost" ? 1 : level.status === "won" ? 2 : 0;
    var bits = run.inBits | (st << 4) | (p.gravityDirection < 0 ? 64 : 0);
    var since = t - run.sentAt;
    var gap;
    if (bits !== run.sentBits || run.sentLv !== run.token || run.sentSp !== run.spawnId)
      gap = 1000 / KEYS_SEND_HZ;
    else if (
      Math.abs(p.pos.x - run.sentX) + Math.abs(p.pos.y - run.sentY) > 0.0005 ||
      Math.abs(p.size.y - run.sentH) > 0.0005 ||
      Math.abs((p.rotation || 0) - run.sentR) > 0.5 ||
      (run.grinders && run.grinders.length)
    )
      gap = 1000 / SEND_HZ;
    else gap = IDLE_SEND_MS;
    // A couple of ms early is fine: frames don't land exactly
    if (since < gap - 2) return false;
    run.sentAt = t;
    run.sentBits = bits;
    run.sentLv = run.token;
    run.sentSp = run.spawnId;
    run.sentX = p.pos.x;
    run.sentY = p.pos.y;
    run.sentH = p.size.y;
    run.sentR = p.rotation || 0;
    return true;
  }

  function sendState(t, step) {
    var level = run.level;
    var p = level.player;
    if (!p || !room) return;
    if (!sendDue(t, p, level)) return;
    var snap = [
      Math.round(t),
      Math.round(p.pos.x * 1000) / 1000,
      Math.round(p.pos.y * 1000) / 1000,
      Math.round(p.size.y * 1000) / 1000,
      Math.round(run.vx * 100) / 100,
      Math.round(run.vy * 100) / 100,
      p.gravityDirection < 0 ? -1 : 1,
      Math.round(p.rotation || 0),
      level.status === "lost" ? 1 : level.status === "won" ? 2 : 0,
      run.inBits,
    ];
    var skin = wornSkin();
    // The grinders ride along from whichever game moves them
    var gr =
      run.grinders && run.grinders.length && grinderBoss() === myId ? grinderStates() : undefined;
    // How the race is going for the board: coins taken of all, and deaths
    var race = run.kind === "race" && run.coinTotal != null;
    var cl = race ? coinsTaken() : undefined;
    var ct = race ? run.coinTotal : undefined;
    var dt = race ? run.deaths : undefined;
    // The skin and the board's numbers only when they changed, and once a
    // second in case a packet with them was lost
    var extras = skin + "|" + cl + "|" + ct + "|" + dt;
    var withExtras = extras !== run.sentExtras || t - run.extrasAt >= EXTRAS_EVERY_MS;
    if (withExtras) {
      run.sentExtras = extras;
      run.extrasAt = t;
    }
    var json = JSON.stringify({
      k: "s",
      lv: run.token,
      sp: run.spawnId,
      sk: withExtras ? skin : undefined,
      s: [snap],
      gr: gr,
      cl: withExtras ? cl : undefined,
      ct: withExtras ? ct : undefined,
      dt: withExtras ? dt : undefined,
    });
    var behind = false;
    var stuck = false;
    room.members.forEach(function (m) {
      if (m.id === myId) return;
      var peer = room.peers[m.id];
      if (peer && peer.open && peer.send(json, false)) return;
      behind = true;
      if (!peer || peer.state === "failed") stuck = true;
    });
    var bufFor = run.token + "|" + run.spawnId;
    if (relayBufFor !== bufFor) {
      relayBuf = [];
      relayBufFor = bufFor;
    }
    if (behind) {
      if (t - relaySampleAt >= RELAY_SAMPLE_MS) {
        relaySampleAt = t;
        relayBuf.push(snap);
        if (relayBuf.length > 30) relayBuf.shift();
      }
      if (relayBuf.length && t - lastRelayAt >= 1000 / relayRate()) {
        lastRelayAt = t;
        send(room.ch, "pos", {
          id: myId,
          lv: run.token,
          sp: run.spawnId,
          sk: skin,
          s: relayBuf,
          gr: gr,
          cl: cl,
          ct: ct,
          dt: dt,
        });
        relayBuf = [];
      }
    } else relayBuf = [];
    // Only a link that has given up counts against the shared budget; one
    // still connecting is over in a second or two
    if (stuck !== relaying) {
      relaying = stuck;
      pushLobbyPresence();
      renderBoard();
    }
  }

  function onRemoteState(id, pkt, relayed) {
    if (!room || !id || id === myId || !room.knownIds[id]) return;
    if (relayed) {
      var peer = room.peers[id];
      if (peer && peer.open) return;
    }
    var snaps = Array.isArray(pkt.s) ? pkt.s : null;
    if (!snaps || !snaps.length) return;
    var rm =
      room.remotes[id] ||
      (room.remotes[id] = {
        id: id,
        buf: [],
        off: null,
        msgGap: 33,
        lastMsgAt: 0,
        heard: 0,
        trails: [],
        trailClock: 0,
      });
    var lv = String(pkt.lv);
    var sp = num(pkt.sp);
    if (lv !== rm.lv || sp !== rm.sp) {
      rm.emote = null;
      rm.buf = [];
      rm.lv = lv;
      rm.sp = sp;
      rm.snap = true;
      if (rm.lateUndo && sp >= rm.lateUndo.sp) releaseUndo(rm);
    }
    if (rm.relayed !== relayed) {
      rm.off = null;
      rm.relayed = relayed;
      rm.snap = true;
    }
    var recv = now();
    var since = rm.lastMsgAt ? Math.min(recv - rm.lastMsgAt, 3000) : 0;
    if (rm.lastMsgAt) rm.msgGap = rm.msgGap * 0.75 + since * 0.25;
    rm.lastMsgAt = recv;
    rm.heard = recv;
    // Creeps up 10ms a second, by the clock rather than by the packet:
    // packets now come at different rates (standing still, a key change)
    var creep = since * 0.01;
    for (var si = Math.max(0, snaps.length - 30); si < snaps.length; si++) {
      var a = snaps[si];
      if (!Array.isArray(a)) continue;
      var ts = num(a[0], NaN);
      if (!isFinite(ts)) continue;
      var last = rm.buf[rm.buf.length - 1];
      if (last && ts <= last.t) continue;
      // How far the sender's clock is behind ours, plus the quickest trip a
      // packet has made. It creeps up slowly, so a route that got slower is
      // followed too.
      var off = recv - ts;
      rm.off = rm.off == null ? off : Math.min(off, rm.off + creep);
      creep = 0;
      rm.buf.push({
        t: ts,
        x: num(a[1]),
        y: num(a[2]),
        h: clamp(num(a[3], 1), 0, 1),
        vx: clamp(num(a[4]), -60, 60),
        vy: clamp(num(a[5]), -60, 60),
        g: num(a[6]) < 0 ? -1 : 1,
        r: clamp(num(a[7]), -360, 360),
        st: Math.floor(num(a[8])),
        keys: Math.floor(num(a[9])) & 15,
      });
    }
    if (rm.buf.length > 60) rm.buf.splice(0, rm.buf.length - 60);
    // Packets without the skin keep the one before
    if (typeof pkt.sk === "string") rm.skin = pkt.sk.slice(0, 64);
    else if (!rm.skin) rm.skin = "default";
    if (pkt.ct != null) {
      rm.ct = Math.max(0, Math.floor(num(pkt.ct)));
      rm.cl = clamp(Math.floor(num(pkt.cl)), 0, rm.ct);
      rm.dt = Math.max(0, Math.floor(num(pkt.dt)));
    }
    if (pkt.gr && run && lv === run.token) takeGrinderStates(id, pkt.gr);
    // Moving again means the emote is over, even if its end never arrived
    var newest = rm.buf[rm.buf.length - 1];
    if (
      rm.emote &&
      newest &&
      rm.off != null &&
      newest.t + rm.off > rm.emote.at + 200 &&
      Math.abs(newest.vx) + Math.abs(newest.vy) > 0.05
    )
      rm.emote = null;
  }

  // Where a remote racer should be drawn now.
  //
  // Over a direct link: where they are right now, as best we can tell -- their
  // newest packet carried forward by its speed across the trip it took (half
  // the measured round trip). Drawing them in the past instead put them a
  // block or more behind when running, and a bump landed before you could see
  // anyone touch you.
  //
  // Over the fallback: the same, from further back. Its messages come a few
  // times a second, so playing their path back late (as it used to) drew
  // them up to a few seconds behind where they really were.
  //
  // "Carried forward" is their block run on through this level with the
  // game's own physics and the keys they were holding, so a jump arcs and
  // lands, a wall stops them, and letting go stops them -- a straight line
  // at their last speed overshot every landing and turn.
  //
  // The run-on is kept from frame to frame: each frame only plays the time
  // since the last one (a step or so), and it starts again from their newest
  // packet only when one arrives. Rerunning the whole way every frame cost
  // up to 42 steps per racer per frame on the fallback.
  function remoteTarget(rm, t) {
    var peer = room.peers[rm.id];
    var b = rm.buf;
    rm.direct = !rm.relayed && !!peer && peer.open;
    var last = b[b.length - 1];
    var oneWay = rm.direct
      ? peer.rttMin != null
        ? peer.rttMin / 2
        : 25
      : RELAY_ONE_WAY_MS;
    // Where they are now on their own clock. It runs at our frame rate and
    // is only eased toward the estimate: a packet that made the trip quicker
    // than the rest moves the estimate at once, and drawing that straight
    // away made the block leap forward.
    var want = t - rm.off + oneWay;
    if (rm.clock == null || rm.snap || Math.abs(want - rm.clock - (t - rm.clockAt)) > CLOCK_SNAP_MS)
      rm.clock = want;
    else {
      rm.clock += t - rm.clockAt;
      rm.clock += (want - rm.clock) * (1 - Math.exp(-(t - rm.clockAt) / CLOCK_EASE_MS));
    }
    rm.clockAt = t;
    var theirNow = rm.clock;
    var pr = rm.pr || (rm.pr = newPredictor());
    if (pr.from !== last) {
      // A fresh packet. Where the old run-on had them this frame, against
      // where the new one does, is the correction placeRemotes eases out.
      if (pr.from && !rm.snap) {
        runOn(pr, clamp(theirNow - pr.from.t, 0, PREDICT_MAX_MS));
        var ox = pr.out.x;
        var oy = pr.out.y;
        startRunOn(pr, last);
        runOn(pr, clamp(theirNow - last.t, 0, PREDICT_MAX_MS));
        rm.jx += ox - pr.out.x;
        rm.jy += oy - pr.out.y;
        return pr.out;
      }
      startRunOn(pr, last);
    }
    runOn(pr, clamp(theirNow - last.t, 0, PREDICT_MAX_MS));
    return pr.out;
  }

  // Their block run on from a snapshot, as their game would run it with the
  // same keys held. It can't set anything off or die here: whatever it
  // bumps into just stops it.
  var PREDICT_STEP = 1 / 60;
  var PREDICT_STEP_MS = 1000 / 60;
  // Your block, while a run-on is going: in their game you are solid to
  // them sideways (see PUSHING), so walking into you stops them at your edge.
  // Run on without that, someone pushing you was drawn half inside you and
  // pulled back out at every packet.
  var predictBlocker = null;
  function predictLevel() {
    var lv = run.level;
    if (run.predictFor === lv) return run.predictLevel;
    var pl = Object.create(lv);
    pl.playerTouched = function () {};
    pl.obstacleAt = function (pos, size, actor) {
      var o = lv.obstacleAt(pos, size);
      if (o) return typeof o === "string" ? o : "wall";
      var me = collisionsOn() ? predictBlocker : null;
      // Only a sideways move (moveX keeps y as it was), as in touchOthers
      if (me && actor && pos.y === actor.pos.y) {
        var ox = Math.min(pos.x + size.x, me.pos.x + me.size.x) - Math.max(pos.x, me.pos.x);
        var oy = Math.min(pos.y + size.y, me.pos.y + me.size.y) - Math.max(pos.y, me.pos.y);
        if (ox > 0 && oy >= 0.35) return "wall";
      }
      return o;
    };
    run.predictFor = lv;
    run.predictLevel = pl;
    return pl;
  }
  function newPredictor() {
    return {
      from: null,
      p: typeof Player === "function" && Player.prototype.moveY ? Object.create(Player.prototype) : null,
      keys: { left: false, right: false, up: false, down: false },
      // How far past the snapshot it has been run, in whole steps (ms)
      ms: 0,
      // Where it was a step before, to carry it on between steps
      px: 0,
      py: 0,
      broken: false,
      out: { t: 0, x: 0, y: 0, h: 1, vx: 0, vy: 0, g: 1, r: 0, st: 0, keys: 0 },
    };
  }
  function startRunOn(pr, s) {
    pr.from = s;
    pr.ms = 0;
    pr.broken = !pr.p;
    var o = pr.out;
    o.t = s.t;
    o.x = pr.px = s.x;
    o.y = pr.py = s.y;
    o.h = s.h;
    o.vx = s.vx;
    o.vy = s.vy;
    o.g = s.g;
    o.r = s.r;
    o.st = s.st;
    o.keys = s.keys;
    if (pr.broken || s.st) return;
    var p = pr.p;
    p.pos = new Vector(s.x, s.y);
    p.size = new Vector(0.5, Math.max(0.05, s.h));
    p.speed = new Vector(s.vx, s.vy);
    p.gravityDirection = s.g;
    p.baseGravityDirection = s.g;
    p.windSpeedX = 0;
    p.dashDir = 0;
    p.onIce = false;
    p.inWater = false;
    p.waterHopping = false;
    pr.keys.left = !!(s.keys & 1);
    pr.keys.right = !!(s.keys & 2);
    pr.keys.up = !!(s.keys & 4);
    pr.keys.down = !!(s.keys & 8);
    // Already overlapping you (a shared spawn) they walk out freely, as in
    // touchOthers
    var me = run.level.player;
    pr.clear =
      !me ||
      Math.min(s.x + 0.5, me.pos.x + me.size.x) - Math.max(s.x, me.pos.x) <= 0 ||
      Math.min(s.y + s.h, me.pos.y + me.size.y) - Math.max(s.y, me.pos.y) <= 0;
  }
  // On to `ahead` ms past the snapshot: whole steps of the game's physics,
  // run to the step just past it, and drawn between that step and the one
  // before. Carrying the last step on past the newest one instead drew them
  // poking into a wall or the floor for a frame and snapping back.
  function runOn(pr, ahead) {
    var s = pr.from;
    var o = pr.out;
    if (s.st) return;
    if (pr.broken) {
      var c = carry(s, ahead / 1000);
      o.x = c.x;
      o.y = c.y;
      return;
    }
    // Further back than it has run already (their clock estimate moved):
    // start over
    if (ahead < pr.ms - PREDICT_STEP_MS - 0.5) startRunOn(pr, s);
    var p = pr.p;
    var lv = predictLevel();
    var me = run.level.player;
    predictBlocker =
      pr.clear && me && !run.level.status && !run.finished && run.kind !== "flip" ? me : null;
    try {
      while (pr.ms < ahead - 1e-6) {
        pr.px = p.pos.x;
        pr.py = p.pos.y;
        p.moveX(PREDICT_STEP, lv, pr.keys);
        p.moveY(PREDICT_STEP, lv, pr.keys);
        pr.ms += PREDICT_STEP_MS;
      }
    } catch (e) {
      predictBlocker = null;
      pr.broken = true;
      runOn(pr, ahead);
      return;
    }
    predictBlocker = null;
    var f = pr.ms > 0 ? 1 - (pr.ms - ahead) / PREDICT_STEP_MS : 1;
    o.x = pr.px + (p.pos.x - pr.px) * f;
    o.y = pr.py + (p.pos.y - pr.py) * f;
    o.vx = p.speed.x;
    o.vy = p.speed.y;
    o.g = p.gravityDirection < 0 ? -1 : 1;
  }

  // A snapshot moved on by its own speed, stopping at walls (both players
  // have the same level, so the prediction can use its blocks)
  function carry(s, dt) {
    if (s.st || dt <= 0 || (!s.vx && !s.vy)) return s;
    var x = s.x + s.vx * dt;
    var y = s.y + s.vy * dt;
    if (solidAt(x, s.y, s.h)) x = s.x;
    if (solidAt(x, y, s.h)) y = s.y;
    return { x: x, y: y };
  }
  function solidAt(x, y, h) {
    var o = run.level.obstacleAt(new Vector(x, y), new Vector(0.5, Math.max(0.05, h)));
    if (!o) return false;
    return !(typeof deadlyObstacleType === "function" && deadlyObstacleType(o));
  }

  // The drawn position is the target plus a correction that springs back to
  // nothing. A fresh packet that moves the target adds to the correction
  // rather than moving the block, and the spring takes it out without ever
  // changing the drawn speed in one frame -- easing the position itself
  // jolted the block's speed at every packet. A correction past SNAP_BLOCKS
  // (a respawn, a teleport) is drawn at once.
  function placeRemotes(t, step) {
    for (var id in room.remotes) {
      var rm = room.remotes[id];
      var member = memberOf(id);
      rm.live = !!(member && rm.lv === run.token && rm.buf.length && t - rm.heard < 8000);
      if (!rm.live) {
        rm.box = null;
        rm.disp = null;
        continue;
      }
      if (rm.jx == null) rm.jx = rm.jy = rm.ex = rm.ey = rm.evx = rm.evy = 0;
      var at = remoteTarget(rm, t);
      var d = rm.disp;
      rm.ex += rm.jx;
      rm.ey += rm.jy;
      rm.jx = rm.jy = 0;
      if (!d || rm.snap || Math.abs(rm.ex) + Math.abs(rm.ey) > SNAP_BLOCKS) {
        d = rm.disp = rm.disp || { x: 0, y: 0 };
        rm.snap = false;
        rm.ex = rm.ey = rm.evx = rm.evy = 0;
      } else if (rm.ex || rm.ey || rm.evx || rm.evy) {
        // A critically damped spring, solved exactly for this frame's step
        var w = 1 / (rm.direct ? SMOOTH_S : SMOOTH_RELAY_S);
        var decay = Math.exp(-w * step);
        var kx = (rm.evx + w * rm.ex) * step;
        var ky = (rm.evy + w * rm.ey) * step;
        rm.ex = (rm.ex + kx) * decay;
        rm.ey = (rm.ey + ky) * decay;
        rm.evx = (rm.evx - w * kx) * decay;
        rm.evy = (rm.evy - w * ky) * decay;
        if (Math.abs(rm.ex) + Math.abs(rm.ey) + (Math.abs(rm.evx) + Math.abs(rm.evy)) * 0.01 < 1e-4)
          rm.ex = rm.ey = rm.evx = rm.evy = 0;
      }
      d.x = at.x + rm.ex;
      d.y = at.y + rm.ey;
      rm.at = at;
      var box = rm.boxObj || (rm.boxObj = { x: 0, y: 0, w: 0.5, h: 1, vx: 0, st: 0 });
      box.x = d.x;
      box.y = d.y;
      box.h = at.h;
      box.vx = at.st ? 0 : at.vx;
      box.st = at.st;
      rm.box = box;
    }
  }

  // ---- SHARED BLOCKS ------------------------------------------------------------
  // Everyone in a race is in the same level, so whatever happens to its
  // blocks happens for everyone: a spike block one player sets off is up for
  // all of them, a breakable block one of them lands on breaks for all of
  // them. Four things make that so:
  // - One clock. The level runs from GO and a death no longer rebuilds it:
  //   the dead player and their coins go back to the start and everything
  //   else carries on, so moving blocks, falling blocks, rising lava and timed
  //   flashes are in the same place for everyone.
  // - Triggers are passed on. When your block sets one off, the others are
  //   told which block it was and set it off in their game too.
  // - Grinders chase whoever is nearest at their height. One game works that
  //   out (the lowest id still racing) and the rest copy where its grinders
  //   are, so they carve the same walls everywhere.
  // - What you break is yours, and it mends itself when you are done: when
  //   you die (at the end of the death animation), finish or leave, every
  //   block you broke comes back, the walls a grinder carved chasing you fill
  //   in again (once nobody is standing there) and the grinder goes home, in
  //   every game. Without that, one player's run could leave the level
  //   impossible for everyone after them. Spike and wall blocks stay set off.
  // Random flickers are dealt from the clock instead of Math.random, and a
  // touch flicker shows while anyone touches it. Jump flickers stay your own
  // (they answer your jumps), and so do coins: it is a race.
  var TRIGGERED_TYPES = {
    "breakable-block": true,
    "spike-block": true,
    "spike-block-u": true,
    "spike-block-l": true,
    "spike-block-r": true,
    "wall-block": true,
  };
  var SPAWNER_TYPES = {
    "spike-block": true,
    "spike-block-u": true,
    "spike-block-l": true,
    "spike-block-r": true,
    "wall-block": true,
  };
  var PERSONAL_TYPES = { player: true, coin: true, "blue-coin": true, trail: true };
  // World messages that came before their level was up
  var pendingWorld = [];

  function shareLevel(level, seed) {
    level.lvShared = true;
    level.lvSeed = seed | 0;
    // Grinders wait for the player to move; in a race everyone does at GO
    level.playerHasMoved = true;
    run.ageAtGo = level.age;
    run.trig = {};
    run.byId = {};
    run.triggerables = [];
    run.grinders = [];
    run.grTargets = {};
    run.spawnActors = [];
    // Every change still standing, by whom, and the ones waiting for their
    // spot to clear before they can be undone. Broken blocks and what the
    // grinders carve go back; spikes and walls a block put out stay.
    run.changes = [];
    run.changeOf = {};
    run.undoQueue = [];
    run.deaths = 0;
    level.actors.forEach(function (a) {
      run.byId[a.id] = a;
      if (TRIGGERED_TYPES[a.type]) {
        run.triggerables.push(a);
        // Set off while settling: the same in every game, nothing to tell
        if (a.triggered) run.trig[a.id] = true;
        else if (SPAWNER_TYPES[a.type]) a.act = spawnerAct;
      }
      if (a.type === "grinder") {
        run.grinders.push(a);
        a.lvHome = { x: a.pos.x, y: a.pos.y };
        a.act = grinderAct;
      }
      if (PERSONAL_TYPES[a.type] && a.type !== "trail") run.spawnActors.push(cloneActor(a));
    });
    run.coinTotal = run.spawnActors.filter(function (a) {
      return a.type === "coin" && !a.fake;
    }).length;
    // Water flicker patches have no id of their own; they are made in plan
    // order, so their place in the list is the same in every game
    (level.waterFlickers || []).forEach(function (patch, i) {
      patch.lvId = 1e6 + i;
    });
    var waiting = pendingWorld.filter(function (m) {
      return m.lv === run.token;
    });
    pendingWorld = [];
    waiting.forEach(applyWorld);
  }

  // Installed on spike and wall blocks: the game's own, keeping a note of
  // what it put out, so a wall someone else raised can lift you clear
  function spawnerAct(step, level) {
    if (this.triggered) return;
    var actors = level.actors;
    var before = actors.length;
    Object.getPrototypeOf(this).act.call(this, step, level);
    if (this.triggered) this.lvSpawned = level.actors === actors ? actors.slice(before) : [];
  }

  // Coins taken by this player in this life, for the board
  function coinsTaken() {
    if (!run || !run.level || !run.coinTotal) return 0;
    var left = 0;
    var actors = run.level.actors;
    for (var i = 0; i < actors.length; i++)
      if (actors[i].type === "coin" && !actors[i].fake) left++;
    return run.coinTotal - left;
  }

  // A death in a race: you and your coins back to the start, as the game
  // would after rebuilding the level, while the rest of it carries on --
  // except what you changed, which goes back as well
  function softRespawn() {
    var level = run.level;
    var keep = level.actors.filter(function (a) {
      return !PERSONAL_TYPES[a.type];
    });
    var fresh = run.spawnActors.map(cloneActor);
    // A new array, so the level's actor index is rebuilt
    level.actors = keep.concat(fresh);
    level.players = fresh.filter(function (a) {
      return a.type === "player";
    });
    level.player = level.players[0] || null;
    level.status = null;
    level.finishDelay = 0;
    level.blueCoinsCollected = 0;
    run.spawnId++;
    run.deaths++;
    pushesOnMe = {};
    undoMine();
  }

  // Undo my changes here and in every other game
  function undoMine() {
    if (!run || !run.changes) return;
    undoChangesBy(myId);
    sendWorld({ k: "w", lv: run.token, undo: 1, sp: run.spawnId });
  }

  function recordChange(by, c) {
    c.by = by;
    run.changes.push(c);
    if (c.actor) run.changeOf[c.actor.id] = c;
  }

  // After each frame: the blocks your own block set off, noted and passed on
  function noteTriggers() {
    var out = [];
    for (var i = 0; i < run.triggerables.length; i++) {
      var a = run.triggerables[i];
      if (a.triggered && !run.trig[a.id]) {
        run.trig[a.id] = true;
        if (!a.lvRemote) {
          out.push(a.id);
          // Spike and wall blocks stay set off; only a broken block comes back
          if (!SPAWNER_TYPES[a.type]) recordChange(myId, { kind: "break", actor: a });
        }
      }
    }
    if (out.length)
      sendWorld({ k: "w", lv: run.token, at: Math.round(run.level.age * 1000) / 1000, t: out });
  }

  function sendWorld(msg) {
    var json = JSON.stringify(msg);
    var behind = false;
    room.members.forEach(function (m) {
      if (m.id === myId) return;
      var peer = room.peers[m.id];
      if (!(peer && peer.open && peer.send(json, true))) behind = true;
    });
    if (behind) send(room.ch, "wev", Object.assign({ from: myId }, msg));
  }

  function onWorldMessage(id, m) {
    if (!room || !room.knownIds[id] || !m || typeof m.lv !== "string") return;
    if (!run || run.kind !== "race" || !run.level || !run.level.lvShared || m.lv !== run.token) {
      if (pendingWorld.length < 300) pendingWorld.push(Object.assign({ from: id }, m));
      return;
    }
    applyWorld(Object.assign({ from: id }, m));
  }

  function applyWorld(m) {
    var level = run.level;
    var from = String(m.from);
    if (m.undo) {
      // After a death the blocks come back when this game draws them back at
      // the start -- the end of their death as it is seen here. The changes
      // are set aside now, so whatever they break in their next life stays.
      var rm = room.remotes[from];
      if (rm && m.sp != null && rm.lv === run.token && num(rm.sp) < num(m.sp)) {
        var held = rm.lateUndo ? rm.lateUndo.list : [];
        rm.lateUndo = {
          lv: run.token,
          sp: num(m.sp),
          list: held.concat(takeChangesBy(from)),
          by: now() + 1500,
        };
        return;
      }
      undoChangesBy(from);
      return;
    }
    (Array.isArray(m.t) ? m.t : []).slice(0, 300).forEach(function (id) {
      var a = run.byId[id];
      if (!a || !TRIGGERED_TYPES[a.type]) return;
      if (run.trig[id] || a.triggered) {
        // Both of us set it off at once: it belongs to the lower id, in
        // every game alike, so it is undone together
        var c = run.changeOf[id];
        if (c && from < c.by) c.by = from;
        return;
      }
      run.trig[id] = true;
      a.lvRemote = true;
      if (a.type === "breakable-block") {
        a.trigger();
        // It went off a moment ago in their game
        a.timer = Math.max(0, a.timer - clamp(level.age - num(m.at), 0, 0.4));
        recordChange(from, { kind: "break", actor: a });
        return;
      }
      // A spawner looks for a player in reach; for a moment there is one
      var real = level.player;
      level.player = {
        pos: new Vector(a.pos.x + 0.25, a.pos.y),
        size: new Vector(0.5, 1),
        speed: new Vector(0, 0),
      };
      try {
        a.act(0, level);
      } finally {
        level.player = real;
      }
      // A wall that rises where you stand lifts you clear, as the game does
      // for the player who set it off
      if (a.type === "wall-block" && real) liftOutOf(level, real, a.lvSpawned || []);
    });
  }

  function liftOutOf(level, p, spawned) {
    var up = -worldDown(level);
    spawned.forEach(function (w) {
      if (w.type !== "visual-wall" || w.fake) return;
      if (
        p.pos.x < w.pos.x + w.size.x &&
        p.pos.x + p.size.x > w.pos.x &&
        p.pos.y < w.pos.y + w.size.y &&
        p.pos.y + p.size.y > w.pos.y
      ) {
        p.pos.y = up < 0 ? w.pos.y - p.size.y - 0.01 : w.pos.y + w.size.y + 0.01;
        if (up < 0 ? p.speed.y > 0 : p.speed.y < 0) p.speed.y = 0;
      }
    });
  }

  // Everything one player broke goes back. A broken block or a carved wall
  // waits until nobody is standing where it comes back (see tryUndo).
  function undoChangesBy(id) {
    if (!run || !run.changes) return;
    putBack(id, takeChangesBy(id));
  }
  function takeChangesBy(id) {
    var mine = [];
    var keep = [];
    run.changes.forEach(function (c) {
      (c.by === id ? mine : keep).push(c);
    });
    run.changes = keep;
    return mine;
  }
  function putBack(id, list) {
    list.forEach(function (c) {
      run.undoQueue.push(c);
    });
    // A grinder that was chasing them goes home, as it would in a rebuilt
    // level. Only the boss moves it; everyone else follows the boss.
    if (grinderBoss() === myId)
      run.grinders.forEach(function (g) {
        if (g.lvChasing !== id) return;
        g.pos = new Vector(g.lvHome.x, g.lvHome.y);
        g.grinding = false;
        g.lvChasing = null;
      });
    tryUndo();
  }

  // A player's held changes go back (see applyWorld)
  function releaseUndo(rm) {
    var u = rm.lateUndo;
    rm.lateUndo = null;
    if (u && run && run.kind === "race" && run.changes && u.lv === run.token)
      putBack(rm.id, u.list);
  }
  // Never held for long: if their next life doesn't show up, they go back anyway
  function lateUndos() {
    var t = now();
    Object.keys(room.remotes).forEach(function (id) {
      var rm = room.remotes[id];
      if (rm.lateUndo && t > rm.lateUndo.by) releaseUndo(rm);
    });
  }

  // Each frame while anything waits: whatever can go back now, does
  function tryUndo() {
    if (!run.undoQueue.length) return;
    var level = run.level;
    var still = [];
    var add = [];
    run.undoQueue.forEach(function (c) {
      var a = c.actor;
      if (c.kind === "break") {
        if (spotTaken(a.pos.x, a.pos.y, a.size.x, a.size.y)) return still.push(c);
        rearm(a);
        a.timer = -1;
        a.toRemove = false;
        a.lvGround = false;
        if (level.actors.indexOf(a) === -1) add.push(a);
        return;
      }
      if (c.kind === "cell") {
        if (spotTaken(c.x, c.y, 1, 1)) return still.push(c);
        if (!level.grid[c.y][c.x]) {
          level.grid[c.y][c.x] = "wall";
          level.backgroundDirty = true;
        }
      }
    });
    run.undoQueue = still;
    // A new array, so the level's actor index is rebuilt
    if (add.length) level.actors = level.actors.concat(add);
  }

  // A block back as it started: set off again by whoever comes near next
  function rearm(a) {
    a.triggered = false;
    a.lvRemote = false;
    run.trig[a.id] = false;
    if (run.changeOf[a.id]) delete run.changeOf[a.id];
  }

  // Is a racer or a grinder in this box right now?
  function spotTaken(x, y, w, h) {
    function hits(bx, by, bw, bh) {
      return bx < x + w && bx + bw > x && by < y + h && by + bh > y;
    }
    var p = run.level.player;
    if (p && hits(p.pos.x, p.pos.y, p.size.x, p.size.y)) return true;
    var taken = false;
    Object.keys(room.remotes).forEach(function (id) {
      var rm = room.remotes[id];
      if (rm.live && rm.box && rm.lv === run.token && hits(rm.box.x, rm.box.y, rm.box.w, rm.box.h))
        taken = true;
    });
    run.grinders.forEach(function (g) {
      if (hits(g.pos.x, g.pos.y, g.size.x, g.size.y)) taken = true;
    });
    return taken;
  }

  // Whose game moves the grinders: the lowest id racing in this level
  function grinderBoss() {
    var boss = run && run.kind === "race" ? myId : null;
    Object.keys(room.remotes).forEach(function (id) {
      var rm = room.remotes[id];
      if (rm.live && rm.lv === run.token && (boss === null || id < boss)) boss = id;
    });
    return boss;
  }

  // The walls a grinder could carve this step, to see afterwards which it did
  function wallsAround(g, level) {
    var out = [];
    var x0 = Math.max(0, Math.floor(g.pos.x) - 1);
    var x1 = Math.min(level.width, Math.ceil(g.pos.x + g.size.x) + 1);
    var y0 = Math.max(0, Math.floor(g.pos.y));
    var y1 = Math.min(level.height, Math.ceil(g.pos.y + g.size.y));
    for (var y = y0; y < y1; y++)
      for (var x = x0; x < x1; x++) if (level.grid[y][x] === "wall") out.push({ x: x, y: y });
    return out;
  }
  // What a grinder carved or smashed this step, put down to the racer it
  // was after
  function noteGrinding(g, level, walls, by) {
    if (!by) return;
    walls.forEach(function (w) {
      if (!level.grid[w.y][w.x]) recordChange(by, { kind: "cell", x: w.x, y: w.y });
    });
    run.triggerables.forEach(function (a) {
      if (a.type === "breakable-block" && a.toRemove && !a.triggered && !a.lvGround) {
        a.lvGround = true;
        recordChange(by, { kind: "break", actor: a });
      }
    });
  }

  // Installed on each grinder in a race in place of Grinder.prototype.act
  function grinderAct(step, level) {
    if (!level.lvShared || !run || run.level !== level)
      return Grinder.prototype.act.call(this, step, level);
    if (grinderBoss() !== myId) return followGrinder(this, step, level);
    var target = grinderTarget(this, level);
    if (!target) {
      this.grinding = false;
      return;
    }
    // The game's own grinder, chasing whoever is nearest instead of only you
    var walls = wallsAround(this, level);
    var real = level.player;
    level.player = target;
    try {
      Grinder.prototype.act.call(this, step, level);
    } finally {
      level.player = real;
    }
    this.lvChasing = target.lvId;
    noteGrinding(this, level, walls, target.lvId);
  }

  // The nearest racer at the grinder's height, still running
  function grinderTarget(g, level) {
    var top = g.pos.y;
    var bottom = g.pos.y + g.size.y;
    var gx = g.pos.x + g.size.x / 2;
    var best = null;
    var bestD = Infinity;
    function consider(id, x, y, h) {
      var cy = y + h / 2;
      if (cy < top || cy > bottom) return;
      var d = Math.abs(x + 0.25 - gx);
      if (d < bestD) {
        bestD = d;
        best = {
          lvId: id,
          pos: new Vector(x, y),
          size: new Vector(0.5, h),
          speed: new Vector(0, 0),
        };
      }
    }
    var p = level.player;
    if (p && !level.status && !run.finished) consider(myId, p.pos.x, p.pos.y, p.size.y);
    Object.keys(room.remotes).forEach(function (id) {
      var rm = room.remotes[id];
      if (rm.live && rm.box && !rm.box.st && rm.lv === run.token)
        consider(id, rm.box.x, rm.box.y, rm.box.h);
    });
    return best;
  }

  // Everyone else's grinders go where the boss's are, and carve on the way
  function followGrinder(g, step, level) {
    var tgt = run.grTargets[g.id];
    if (!tgt) return;
    var dx = tgt.x - g.pos.x;
    var dy = tgt.y - g.pos.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) g.pos = new Vector(tgt.x, tgt.y);
    else {
      var k = Math.min(1, step * 20);
      g.pos = new Vector(g.pos.x + dx * k, g.pos.y + dy * k);
    }
    g.grinding = !!tgt.grinding;
    g.lvChasing = tgt.by;
    var walls = wallsAround(g, level);
    var x0 = Math.floor(g.pos.x);
    var x1 = Math.ceil(g.pos.x + g.size.x);
    var y0 = Math.floor(g.pos.y);
    var y1 = g.fake ? y0 : Math.ceil(g.pos.y + g.size.y);
    for (var y = y0; y < y1; y++)
      for (var x = x0; x < x1; x++)
        if (y >= 0 && y < level.height && x >= 0 && x < level.width && level.grid[y][x] === "wall") {
          level.grid[y][x] = null;
          level.backgroundDirty = true;
        }
    if (!g.fake) {
      var other = level.obstacleAt(g.pos, g.size, g);
      if (other && typeof other !== "string" && (other.type === "breakable-block" || other.type === "moving-block"))
        other.toRemove = true;
    }
    noteGrinding(g, level, walls, tgt.by);
  }

  // For the boss's packets: where each grinder is, and who it is after
  function grinderStates() {
    return run.grinders.map(function (g) {
      return [
        g.id,
        Math.round(g.pos.x * 1000) / 1000,
        Math.round(g.pos.y * 1000) / 1000,
        g.grinding ? 1 : 0,
        g.lvChasing || "",
      ];
    });
  }
  function takeGrinderStates(id, list) {
    if (!run || run.kind !== "race" || !run.grTargets || !Array.isArray(list)) return;
    if (id !== grinderBoss()) return;
    list.slice(0, 200).forEach(function (s) {
      if (!Array.isArray(s)) return;
      run.grTargets[num(s[0], -1)] = {
        x: num(s[1]),
        y: num(s[2]),
        grinding: !!s[3],
        by: s[4] ? String(s[4]).slice(0, 32) : null,
      };
    });
  }

  // A number in [0, 1) that every game deals the same for one block in one
  // fifth of a second
  function slotChance(seed, id, slot) {
    var h = (seed | 0) ^ Math.imul(id | 0, 0x9e3779b1) ^ Math.imul(slot | 0, 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function touching(p, a, margin) {
    return !(
      p.pos.x > a.pos.x + a.size.x + margin ||
      p.pos.x + p.size.x < a.pos.x - margin ||
      p.pos.y > a.pos.y + a.size.y + margin ||
      p.pos.y + p.size.y < a.pos.y - margin
    );
  }

  // updateFlicker for a shared race level: the game's rules, with the random
  // flicker and the flash timed off the level's clock, and a touch flicker
  // shown while anybody in the level touches it
  function sharedFlicker(actor, step, level) {
    var show = false;
    var age = level.age;
    if (actor.isFlash) {
      var every = actor.flashInterval || 1;
      if (age >= every && age % every < 0.2) show = true;
    }
    if (actor.isFlicker) {
      var id = actor.id != null ? actor.id : actor.lvId;
      if (slotChance(level.lvSeed, id, Math.floor(age / 0.2)) < 0.1) show = true;
    }
    if (actor.isJumpFlicker) {
      var p = level.player;
      if (p && level.obstacleAt(p.pos.plus(new Vector(0, 0.1)), p.size, p)) show = true;
    }
    if (actor.isTouchFlicker) {
      if (level.player && touching(level.player, actor, 0.1)) show = true;
      else if (room)
        Object.keys(room.remotes).forEach(function (rid) {
          var rm = room.remotes[rid];
          if (rm.live && rm.box && !rm.box.st && rm.lv === run.token)
            if (touching({ pos: rm.box, size: { x: rm.box.w, y: rm.box.h } }, actor, 0.1))
              show = true;
        });
    }
    actor.isVisible = show;
  }

  // ---- DRAWING THE OTHERS ---------------------------------------------------------
  var trailPool = [];

  function clearTrails(rm) {
    (rm.trails || []).forEach(function (tr) {
      tr.n.remove();
      trailPool.push(tr.n);
    });
    rm.trails = [];
  }
  function detachRemote(rm) {
    if (rm.el) rm.el.remove();
    if (rm.tag) rm.tag.remove();
    dropRemoteEmote(rm);
    rm.el = rm.tag = null;
    rm.box = null;
    rm.disp = null;
    clearTrails(rm);
  }
  function removeRemote(id) {
    // Gone mid-race: what they changed in the level goes back
    if (run && run.kind === "race" && run.changes) {
      if (room.remotes[id]) releaseUndo(room.remotes[id]);
      undoChangesBy(id);
    }
    var rm = room.remotes[id];
    if (rm) detachRemote(rm);
    delete room.remotes[id];
    delete pushesOnMe[id];
    if (room.peers[id]) {
      room.peers[id].close();
      delete room.peers[id];
    }
  }

  // ---- EMOTES ----
  // An emote you start (the game's startEmote) goes to everyone in the room,
  // and so does its end ("" for none). In their game your block takes the
  // same pose (the game's emotePose) and what the emote draws -- the 67, the
  // tears, the mog's sign -- is drawn around it (its buildEmote and
  // placeEmote). The Blue Coin Mog carries your balance (`n`). An alt (Red
  // Balloons, say) travels as its own id and is drawn in its own colours.
  function sendEmote(id, dir, coins) {
    if (!room || !run) return;
    var msg = { k: "emo", id: String(id || "").slice(0, 32), lv: run.token, dir: dir > 0 ? 1 : -1 };
    if (coins != null) msg.n = coins;
    var json = JSON.stringify(msg);
    var behind = false;
    room.members.forEach(function (m) {
      if (m.id === myId) return;
      var peer = room.peers[m.id];
      if (!(peer && peer.open && peer.send(json, true))) behind = true;
    });
    if (behind) send(room.ch, "wev", Object.assign({ from: myId }, msg));
  }
  function onRemoteEmote(id, m) {
    if (!room || !room.knownIds[id] || !m) return;
    var rm = room.remotes[id];
    if (!rm) return;
    if (!m.id || typeof EMOTE_DEFINITIONS !== "object" || !EMOTE_DEFINITIONS[m.id]) {
      rm.emote = null;
      return;
    }
    var same = rm.emote && rm.emote.id === m.id && rm.emote.lv === String(m.lv);
    rm.emote = {
      id: String(m.id),
      lv: String(m.lv),
      // The mog's balance coming in again (once their wallet has loaded)
      // only changes its number; anything else starts over
      at: same && m.id === "bluecoinmog" ? rm.emote.at : now(),
      dir: m.dir === 1 ? 1 : -1,
      n: Math.min(1e9, Math.max(0, Math.floor(Number(m.n)) || 0)),
    };
  }
  // Their emote as this game should draw it, or null
  function remoteEmote(rm) {
    var e = rm.emote;
    if (!e || !run || e.lv !== run.token) return null;
    return typeof emotesEnabled === "function" && emotesEnabled() ? e : null;
  }
  function remotePose(rm, t) {
    var e = remoteEmote(rm);
    return e ? emotePose(e.id, t - e.at, e.dir) : null;
  }
  // Returns how far their name has to go up to stay clear of it, in px
  function drawRemoteEmote(rm, px, py, pw, ph, s, flipped, t) {
    var e = remoteEmote(rm);
    if (!e || typeof EMOTE_DRAWN !== "object" || !EMOTE_DRAWN[e.id]) {
      dropRemoteEmote(rm);
      return 0;
    }
    // Drawn afresh for a new emote; the mog's number can change in place.
    // In The Dark goes under every racer and the level's things, so it
    // darkens the level round them without hiding anyone; the rest go over
    // everything, with the name tags.
    var key = e.id + "|" + e.at;
    if (rm.emoteEl && rm.emoteKey !== key) dropRemoteEmote(rm);
    if (!rm.emoteEl) {
      var under = typeof emoteDrawnUnder === "function" && emoteDrawnUnder(e.id);
      var layer = under ? run.layers.racers : run.layers.tags;
      rm.emoteEl = layer.insertBefore(buildEmote(e.id, e.n, e.at), under ? layer.firstChild : null);
      rm.emoteKey = key;
      rm.emoteN = e.n;
    }
    if (rm.emoteN !== e.n) {
      rm.emoteN = e.n;
      var num = rm.emoteEl.querySelector(".emote-mog-num");
      if (num) num.textContent = e.n;
    }
    placeEmote(rm.emoteEl, px, py, pw, ph, s, flipped);
    return emoteHeadroom(e.id, s, flipped);
  }
  function dropRemoteEmote(rm) {
    if (rm.emoteEl) rm.emoteEl.remove();
    rm.emoteEl = null;
    rm.emoteKey = null;
  }

  function isImageSkin(skin) {
    return (
      skin !== "default" && !(TRAIL_SKINS[skin] && TRAIL_SKINS[skin].color) && !colorSkin(skin)
    );
  }
  // A Blocky in another colour: the plain block in that colour (the game's
  // plainSkinColor, from SOLID_SKIN_COLORS in skins.js)
  function colorSkin(skin) {
    return typeof plainSkinColor === "function" ? plainSkinColor(skin) : null;
  }

  // The skins that change picture when you win or die, as the game draws them
  var EMO_FACES = {
    emo: ["emo.png", "emowin.png", "emodeath.png"],
    emo2: ["emo2.png", "emo2win.png", "emo2death.png"],
    emo3: ["emo3.png", "emo3win.png", "emo3death.png"],
    vintageemo: ["vintageemo.png", "vintageemowin.png", "vintageemodeath.png"],
  };
  // Skins that keep their own picture through a win instead of turning green
  var PLAIN_WIN = { rainbownoir: true, coolguynoir: true };
  var WIN_FILTER =
    "grayscale(100%) sepia(100%) hue-rotate(100deg) saturate(600%) contrast(0.8)";

  // A skin drawn from frames (the game's SKIN_FRAMES: the Chairlords): the
  // frame it shows now -- blinking, its win or death face, or its emote's
  // frames while it does that emote (Chairlord Tongue Shake) -- or null
  function racerFrame(skin, st, e) {
    if (typeof SKIN_FRAMES !== "object" || !SKIN_FRAMES[skin]) return null;
    return skinFrameFile(
      skin,
      st === 1 ? "lost" : st === 2 ? "won" : null,
      e ? e.id : null,
      e ? now() - e.at : 0,
    );
  }

  // Drawn the way syncActors draws the player: green when through, red when
  // down, the emo faces, the ghost's float, a framed skin's frames and crown.
  // `e` is the emote they are doing, if any.
  function paintRacer(node, skin, st, e) {
    var frame = racerFrame(skin, st, e);
    var key = skin + "|" + st + "|" + (frame || "");
    if (node.lvKey === key) return;
    node.lvKey = key;
    if (typeof syncSkinCrown === "function")
      syncSkinCrown(node, frame && SKIN_FRAMES[skin].crown);
    var s = node.style;
    s.backgroundImage = "";
    s.filter = "";
    s.opacity = "";
    var trail = TRAIL_SKINS[skin];
    if (trail && trail.color) {
      s.backgroundColor = trail.color;
    } else if (colorSkin(skin)) {
      s.backgroundColor = st === 1 ? "#a04040" : st === 2 ? "#2ecc71" : colorSkin(skin);
    } else if (frame) {
      // Its own win and death faces: never tinted
      s.backgroundImage = "url('" + frame + "')";
      s.backgroundColor = "transparent";
    } else if (skin !== "default") {
      var faces = EMO_FACES[skin];
      var pic = faces ? faces[st === 2 ? 1 : st === 1 ? 2 : 0] : skinImageFile(skin);
      s.backgroundImage = "url('" + pic + "')";
      s.backgroundColor = "transparent";
      if (st === 2 && !faces && !PLAIN_WIN[skin]) s.filter = WIN_FILTER;
    } else {
      s.backgroundColor = st === 1 ? "#a04040" : st === 2 ? "#2ecc71" : "#335699";
    }
    if (skin === GHOST_SKIN) s.opacity = String(GHOST_OPACITY);
  }

  function hideRemote(rm) {
    if (rm.hidden !== true) {
      rm.hidden = true;
      if (rm.el) rm.el.style.display = "none";
      if (rm.tag) rm.tag.style.display = "none";
    }
    dropRemoteEmote(rm);
    if (rm.trails && rm.trails.length) clearTrails(rm);
  }

  function drawRemotes(t, step) {
    var s = run.display.scale;
    var L = run.layers;
    if (run.kind === "hub") drawPodium(L, s);
    Object.keys(room.remotes).forEach(function (id) {
      var rm = room.remotes[id];
      if (!rm.live) {
        hideRemote(rm);
        return;
      }
      var member = memberOf(id);
      if (!rm.el) {
        rm.el = L.racers.appendChild(el("div", "lv-racer"));
        rm.tag = L.tags.appendChild(el("div", "lv-tag"));
      }
      if (rm.hidden !== false) {
        rm.hidden = false;
        rm.el.style.display = "";
        rm.tag.style.display = "";
      }
      var name = cleanName(member.n);
      if (rm.tag.lvName !== name) rm.tag.textContent = rm.tag.lvName = name;

      var at = rm.at;
      var skin = shownSkin(member, rm.skin);
      paintRacer(rm.el, skin, at.st, remoteEmote(rm));
      var w = isImageSkin(skin) ? 1 : 0.5;
      var x = rm.disp.x - (w - 0.5) / 2;
      var y = rm.disp.y;
      if (skin === GHOST_SKIN) y -= at.g < 0 ? -GHOST_FLOAT : GHOST_FLOAT;
      // An emote's pose: lifted, or toppled over its back corner
      var pose = remotePose(rm, t);
      if (pose && pose.lift) y += at.g < 0 ? pose.lift : -pose.lift;
      if (pose && pose.dx) x += pose.dx;
      // Tongue Shake grows them from the middle: moved to keep their feet put
      if (pose && pose.grow) y += ((pose.grow - 1) * at.h / 2) * (at.g < 0 ? 1 : -1);
      // You see your shove land straight away; the shove itself shows up
      // when their next packets arrive
      if (rm.nudge && t - rm.nudge.at < 180)
        x += rm.nudge.dir * 0.3 * (1 - (t - rm.nudge.at) / 180);
      var px = Math.round(x * s);
      var py = Math.round(y * s);
      var pw = Math.round(w * s);
      var ph = Math.max(1, Math.round(at.h * s));
      var n = rm.el;
      if (n.lvX !== px || n.lvY !== py) {
        n.lvX = px;
        n.lvY = py;
        n.style.translate = px + "px " + py + "px";
      }
      if (n.lvW !== pw || n.lvH !== ph) {
        n.lvW = pw;
        n.lvH = ph;
        n.style.width = pw + "px";
        n.style.height = ph + "px";
      }
      var turned = !!(pose && pose.rot);
      // Give Me Tuff's flip turns them about their middle
      var spin = pose && pose.spin ? pose.spin : 0;
      // Its turn as a number first, so the string is only built on a change
      var deg = turned ? (at.g < 0 ? -pose.rot : pose.rot) : spin ? (at.g < 0 ? -spin : spin) : at.r;
      var flipY = !turned && at.g < 0;
      if (n.lvDeg !== deg || n.lvFlipY !== flipY) {
        n.lvDeg = deg;
        n.lvFlipY = flipY;
        n.style.transform = "rotate(" + deg + "deg)" + (flipY ? " scaleY(-1)" : "");
      }
      var origin = turned
        ? (pose.rot < 0 ? "left" : "right") + (at.g < 0 ? " top" : " bottom")
        : "";
      if (n.lvOrigin !== origin) {
        n.lvOrigin = origin;
        n.style.transformOrigin = origin;
      }
      var grow = pose && pose.grow ? String(pose.grow) : "";
      if (n.lvGrow !== grow) {
        n.lvGrow = grow;
        n.style.scale = grow;
      }

      // The reflection skin's mirrors show this level, a few times a second
      if (skin === REFLECTION_SKIN) {
        if (t - (rm.reflAt || 0) > 90) {
          rm.reflAt = t;
          run.display.syncSkinReflection(n, null);
        }
      } else if (n.dataset.reflected) clearSkinReflection(n);

      drawTrail(rm, skin, at, step, s);
      var lift = drawRemoteEmote(rm, px, py, pw, ph, s, at.g < 0, t);

      // Kept inside the level's edges, so a spawn in a corner still shows
      // the whole name (its width is guessed from the letters, not measured)
      var half = (name.length * 7 + 14) / 2;
      var tx = Math.round(
        clamp((rm.disp.x + 0.25) * s, half, Math.max(half, run.level.width * s - half)),
      );
      var ty = Math.round((at.g < 0 ? rm.disp.y + at.h + 0.6 : rm.disp.y) * s) - 4 - lift;
      if (rm.tag.lvX !== tx || rm.tag.lvY !== ty) {
        rm.tag.lvX = tx;
        rm.tag.lvY = ty;
        rm.tag.style.translate = tx + "px " + ty + "px";
      }
    });
  }

  // A trail skin leaves ghosts the way the game's Trail actors do: only while
  // a key is held and the block is actually going somewhere, half a second
  // each, a picture trail a little less often than a coloured one.
  function drawTrail(rm, skin, at, step, s) {
    for (var i = rm.trails.length - 1; i >= 0; i--) {
      var tr = rm.trails[i];
      tr.life -= step;
      if (tr.life <= 0) {
        tr.n.remove();
        trailPool.push(tr.n);
        rm.trails.splice(i, 1);
      } else tr.n.style.opacity = (tr.life / 0.5).toFixed(2);
    }
    var trail = TRAIL_SKINS[skin];
    var moved =
      rm.lastTrailX == null ||
      Math.abs(rm.disp.x - rm.lastTrailX) + Math.abs(rm.disp.y - rm.lastTrailY) > 0.001;
    rm.lastTrailX = rm.disp.x;
    rm.lastTrailY = rm.disp.y;
    if (!trail || at.st || !at.keys || !moved) return;
    rm.trailClock -= step;
    if (rm.trailClock > 0) return;
    rm.trailClock = trail.img ? 0.05 : 0.02;
    var n = trailPool.pop() || el("div", "lv-trail");
    var w = trail.img ? 1 : 0.5;
    var x = trail.img ? rm.disp.x - 0.25 : rm.disp.x;
    n.style.backgroundColor = trail.img ? "transparent" : trail.color;
    n.style.backgroundImage = trail.img ? "url('" + trail.img + "')" : "";
    n.style.transform = trail.img && at.g < 0 ? "scaleY(-1)" : "";
    n.style.width = Math.round(w * s) + "px";
    n.style.height = Math.round(s) + "px";
    n.style.translate = Math.round(x * s) + "px " + Math.round(rm.disp.y * s) + "px";
    n.style.opacity = "1";
    run.layers.racers.insertBefore(n, rm.el);
    rm.trails.push({ n: n, life: 0.5 });
  }

  function drawPodium(L, s) {
    if (L.podiumScale === s) return;
    L.podiumScale = s;
    if (!L.podium)
      L.podium = (roomEnv().podiumLabels || []).map(function (p) {
        return L.tags.appendChild(el("div", "lv-podium", p.text));
      });
    (roomEnv().podiumLabels || []).forEach(function (p, i) {
      var n = L.podium[i];
      n.style.translate = Math.round(p.x * s) + "px " + Math.round(p.y * s) + "px";
      n.style.fontSize = Math.round(s * 0.6) + "px";
    });
  }

  // Other people's skins are shown only if their account owns them, read
  // from the same users row the game keeps their skins in.
  var skinOwners = {};
  function shownSkin(member, skin) {
    if (!skin || skin === "default" || !knownSkin(skin)) return "default";
    var u = member && member.u ? String(member.u) : null;
    if (!u) return "default";
    if (u === currentUser) return getAvailableSkins().indexOf(skin) !== -1 ? skin : "default";
    var rec = skinOwners[u];
    if (!rec || rec.set === undefined) {
      loadOwnedSkins(u);
      return "default";
    }
    // The check itself failed, so take their word for it
    if (rec.set === null) return skin;
    if (rec.set[skin]) return skin;
    // Maybe bought a moment ago
    if (now() - rec.at > 15000) loadOwnedSkins(u);
    return "default";
  }
  function loadOwnedSkins(u) {
    var rec = skinOwners[u] || (skinOwners[u] = { set: undefined, at: 0, busy: false });
    if (rec.busy) return;
    rec.busy = true;
    rec.at = now();
    _supabase
      .from("users")
      .select("skins")
      .eq("username", u)
      .limit(1)
      .then(function (res) {
        rec.busy = false;
        rec.at = now();
        if (res.error) {
          if (rec.set === undefined) rec.set = null;
          return;
        }
        var row = res.data && res.data[0];
        var set = {};
        (row && Array.isArray(row.skins) ? row.skins : []).forEach(function (id) {
          set[id] = true;
        });
        rec.set = set;
      });
  }

  // ---- PUSHING ------------------------------------------------------------------
  // Each player only ever moves their own block. Walk into someone and you
  // stop at their edge, as at a wall, and they are pushed along at your speed
  // for as long as you keep walking; hit them hard (a dash, a run-up, a fall)
  // and they get shoved. Both work on the real hitboxes, half a block wide,
  // at the positions you can see. The pushing itself happens in their game,
  // from your messages: it rides on windSpeedX, which moveX already adds to
  // the player's motion and eases off by itself.
  var pushesOnMe = {};

  function touchOthers(level, t) {
    var p = level.player;
    if (!p || level.status || run.finished) return;
    // Collisions off: everyone walks through everyone
    if (!collisionsOn()) return;
    if (typeof emoteFrozen === "function" && emoteFrozen(level)) return;
    Object.keys(room.remotes).forEach(function (id) {
      var rm = room.remotes[id];
      var b = rm.box;
      if (!b || b.st) {
        rm.touching = false;
        return;
      }
      var ox = Math.min(p.pos.x + p.size.x, b.x + b.w) - Math.max(p.pos.x, b.x);
      var oy = Math.min(p.pos.y + p.size.y, b.y + b.h) - Math.max(p.pos.y, b.y);
      if (ox <= 0 || oy <= 0) {
        rm.touching = false;
        rm.stacked = false;
        return;
      }
      // Met already on top of each other (everyone starts on the same
      // spawn): walk apart freely rather than burst apart
      if (!rm.touching) {
        rm.touching = true;
        rm.stacked = ox > 0.3 && oy > 0.5;
      }
      // Stacked, or passing over or under them: no push
      if (rm.stacked || oy < 0.35) return;
      var dir = b.x + b.w / 2 >= p.pos.x + p.size.x / 2 ? 1 : -1;
      var toward = run.vx * dir;
      var closing = (run.vx - b.vx) * dir;
      var direct = room.peers[id] && room.peers[id].open;
      if (closing >= SHOVE_CLOSING && t - (rm.shovedAt || 0) > SHOVE_COOLDOWN_MS) {
        rm.shovedAt = t;
        sendBump(id, "shove", dir * clamp(closing * 0.8, 9, SHOVE_MAX), 0);
        p.windSpeedX = (p.windSpeedX || 0) - dir * 3;
        rm.nudge = { dir: dir, at: t };
      } else if (
        toward > 0.5 &&
        t - (rm.pushedAt || 0) >= (direct ? PUSH_SEND_MS : PUSH_RELAY_MS)
      ) {
        rm.pushedAt = t;
        sendBump(
          id,
          "push",
          dir * Math.min(toward, PUSH_MAX),
          direct ? PUSH_HOLD_MS : PUSH_RELAY_MS * 1.6,
        );
      }
      // Solid: back out to their edge, unless a wall is there
      var nx = dir > 0 ? b.x - p.size.x - 0.001 : b.x + b.w + 0.001;
      if (
        Math.abs(nx - p.pos.x) <= 0.5 &&
        !level.obstacleAt(new Vector(nx, p.pos.y), p.size, p)
      )
        p.pos.x = nx;
    });
  }

  function sendBump(id, kind, vx, hold) {
    vx = Math.round(vx * 100) / 100;
    var peer = room.peers[id];
    var msg = { k: "b", m: kind, vx: vx, hold: hold };
    if (peer && peer.open && peer.send(JSON.stringify(msg), true)) return;
    send(room.ch, "bump", { to: id, from: myId, m: kind, vx: vx, hold: hold });
  }

  function onBump(fromId, msg) {
    if (!run || !room || !room.knownIds[fromId] || run.kind === "flip") return;
    var level = run.level;
    var p = level.player;
    if (!p || level.status || run.finished) return;
    if (run.kind === "race" && now() < run.goAt) return;
    if (!collisionsOn()) return;
    var vx = clamp(num(msg.vx), -SHOVE_MAX, SHOVE_MAX);
    if (msg.m === "push") {
      pushesOnMe[fromId] = {
        vx: clamp(vx, -PUSH_MAX, PUSH_MAX),
        until: now() + clamp(num(msg.hold, PUSH_HOLD_MS), 50, 800),
      };
      return;
    }
    // A shove (or a bump from an older copy of LIVE)
    p.windSpeedX = clamp((p.windSpeedX || 0) + vx, -SHOVE_MAX * 1.3, SHOVE_MAX * 1.3);
    var g = p.gravityDirection < 0 ? -1 : 1;
    if (level.onGround && level.onGround(p.pos, p.size, g, 0.08))
      p.speed.y = -g * SHOVE_HOP;
  }

  // Being pushed: carried at the pusher's speed while their pushes keep
  // coming. Walking against it is a shoving match. windSpeedX is eased off
  // once inside animate before it moves you, so it is set that much higher.
  function applyPushes(p, t, step) {
    // An emoting block isn't pushed
    if (typeof emoteFrozen === "function" && run && emoteFrozen(run.level)) return;
    if (!collisionsOn()) {
      pushesOnMe = {};
      return;
    }
    var sum = 0;
    var any = false;
    Object.keys(pushesOnMe).forEach(function (id) {
      var ps = pushesOnMe[id];
      if (ps.until < t) delete pushesOnMe[id];
      else {
        sum += ps.vx;
        any = true;
      }
    });
    if (!any) return;
    var want = clamp(sum, -PUSH_MAX, PUSH_MAX) / Math.pow(0.02, Math.min(step, 0.05));
    var w = p.windSpeedX || 0;
    if (w * want <= 0 || Math.abs(w) < Math.abs(want)) p.windSpeedX = want;
  }

  // ---- DIRECT CONNECTIONS ---------------------------------------------------------
  // One RTCPeerConnection per pair, the lower id calling the higher. Each
  // carries two channels agreed in advance (so no extra handshake): "s", for
  // positions, which drops a late packet rather than wait for it, and "e", for
  // pushes and pings, which always arrives. The offer and answer travel over
  // the room's Realtime channel once ICE gathering is done, so it is two
  // messages a pair.
  var iceServersReady = null;
  function iceServers() {
    if (!TURN_CREDENTIALS_URL) return Promise.resolve(ICE_SERVERS);
    if (!iceServersReady)
      iceServersReady = fetch(TURN_CREDENTIALS_URL)
        .then(function (r) {
          return r.json();
        })
        .then(function (list) {
          return ICE_SERVERS.concat(Array.isArray(list) ? list : []);
        })
        .catch(function () {
          iceServersReady = null;
          return ICE_SERVERS;
        });
    return iceServersReady;
  }

  function Peer(id) {
    this.id = id;
    this.pc = null;
    this.dc = null;
    this.ev = null;
    this.open = false;
    this.state = "new"; // new | connecting | open | failed
    this.since = now();
    this.failedAt = 0;
    this.tries = 0;
    this.gen = 0;
    this.pingAt = 0;
    this.rtt = null;
    this.rttMin = null;
  }
  Peer.prototype.close = function () {
    if (this.pc) {
      try {
        this.pc.close();
      } catch (e) {}
    }
    this.pc = this.dc = this.ev = null;
    this.open = false;
  };
  Peer.prototype.fail = function () {
    this.close();
    this.state = "failed";
    this.failedAt = now();
    if (room) renderBoard();
  };
  Peer.prototype.setup = function (servers) {
    this.close();
    var self = this;
    var pc = new RTCPeerConnection({ iceServers: servers || ICE_SERVERS });
    this.pc = pc;
    this.state = "connecting";
    this.since = now();
    var dc = pc.createDataChannel("s", {
      negotiated: true,
      id: 0,
      ordered: false,
      maxRetransmits: 0,
    });
    var ev = pc.createDataChannel("e", { negotiated: true, id: 1, ordered: true });
    dc.onopen = function () {
      if (self.pc !== pc) return;
      self.open = true;
      self.state = "open";
      if (room) renderBoard();
    };
    dc.onclose = function () {
      if (self.pc === pc) self.fail();
    };
    var onMsg = function (e) {
      if (self.pc === pc) onPeerMessage(self, e.data);
    };
    dc.onmessage = onMsg;
    ev.onmessage = onMsg;
    pc.onconnectionstatechange = function () {
      if (self.pc !== pc) return;
      if (pc.connectionState === "failed" || pc.connectionState === "closed")
        self.fail();
    };
    this.dc = dc;
    this.ev = ev;
    return pc;
  };
  Peer.prototype.send = function (text, reliable) {
    var ch = reliable ? this.ev : this.dc;
    if (!ch || ch.readyState !== "open") return false;
    try {
      ch.send(text);
      return true;
    } catch (e) {
      return false;
    }
  };
  Peer.prototype.call = function () {
    var self = this;
    var gen = ++this.gen;
    this.tries++;
    this.state = "connecting";
    this.since = now();
    iceServers().then(function (servers) {
      if (self.gen !== gen || !room) return;
      var pc = self.setup(servers);
      pc.createOffer()
        .then(function (offer) {
          return pc.setLocalDescription(offer);
        })
        .then(function () {
          return iceGathered(pc);
        })
        .then(function () {
          if (self.pc !== pc || !room) return;
          send(room.ch, "sig", {
            to: self.id,
            from: myId,
            kind: "offer",
            gen: gen,
            sdp: pc.localDescription.sdp,
          });
        })
        .catch(function () {
          if (self.pc === pc) self.fail();
        });
    });
  };
  Peer.prototype.answer = function (msg) {
    var self = this;
    this.gen = msg.gen;
    this.state = "connecting";
    this.since = now();
    iceServers().then(function (servers) {
      if (self.gen !== msg.gen || !room) return;
      var pc = self.setup(servers);
      pc.setRemoteDescription({ type: "offer", sdp: msg.sdp })
        .then(function () {
          return pc.createAnswer();
        })
        .then(function (answer) {
          return pc.setLocalDescription(answer);
        })
        .then(function () {
          return iceGathered(pc);
        })
        .then(function () {
          if (self.pc !== pc || !room) return;
          send(room.ch, "sig", {
            to: self.id,
            from: myId,
            kind: "answer",
            gen: msg.gen,
            sdp: pc.localDescription.sdp,
          });
        })
        .catch(function () {
          if (self.pc === pc) self.fail();
        });
    });
  };
  Peer.prototype.accept = function (msg) {
    var self = this;
    var pc = this.pc;
    if (!pc || msg.gen !== this.gen || pc.signalingState !== "have-local-offer") return;
    pc.setRemoteDescription({ type: "answer", sdp: msg.sdp }).catch(function () {
      if (self.pc === pc) self.fail();
    });
  };

  function iceGathered(pc) {
    return new Promise(function (resolve) {
      if (pc.iceGatheringState === "complete") return resolve();
      var done = setTimeout(resolve, TURN_CREDENTIALS_URL ? 4000 : 2500);
      pc.addEventListener("icegatheringstatechange", function () {
        if (pc.iceGatheringState === "complete") {
          clearTimeout(done);
          resolve();
        }
      });
    });
  }

  function syncPeers() {
    if (typeof RTCPeerConnection !== "function") return;
    var here = {};
    room.members.forEach(function (m) {
      here[m.id] = true;
      if (m.id !== myId && !room.peers[m.id]) room.peers[m.id] = new Peer(m.id);
    });
    Object.keys(room.peers).forEach(function (id) {
      if (!here[id]) {
        room.peers[id].close();
        delete room.peers[id];
      }
    });
  }

  // Also the pings: the round trip is what says how far ahead to draw
  // someone, so each open link measures it every second
  function tendPeers(t) {
    Object.keys(room.peers).forEach(function (id) {
      var peer = room.peers[id];
      var caller = myId < id;
      if (peer.state === "open") {
        if (t - peer.pingAt > PING_EVERY_MS) {
          peer.pingAt = t;
          peer.send(JSON.stringify({ k: "p", t: Math.round(t * 10) / 10 }), true);
        }
      } else if (peer.state === "new") {
        if (caller) peer.call();
        else if (t - peer.since > CONNECT_TIMEOUT_MS) peer.fail();
      } else if (peer.state === "connecting" && t - peer.since > CONNECT_TIMEOUT_MS) {
        peer.fail();
      } else if (
        peer.state === "failed" &&
        caller &&
        peer.tries < 3 &&
        t - peer.failedAt > 15000
      ) {
        peer.call();
      }
    });
  }

  function onSignal(msg) {
    if (msg.to !== myId || typeof msg.sdp !== "string" || msg.sdp.length > 20000)
      return;
    if (typeof RTCPeerConnection !== "function") return;
    var from = String(msg.from);
    var peer = room.peers[from] || (room.peers[from] = new Peer(from));
    msg.gen = num(msg.gen);
    if (msg.kind === "offer" && from < myId) peer.answer(msg);
    else if (msg.kind === "answer") peer.accept(msg);
  }

  function onPeerMessage(peer, data) {
    if (typeof data !== "string" || data.length > 16000) return;
    var m;
    try {
      m = JSON.parse(data);
    } catch (e) {
      return;
    }
    if (!m) return;
    if (m.k === "s") onRemoteState(peer.id, m, false);
    else if (m.k === "b") onBump(peer.id, m);
    else if (m.k === "w") onWorldMessage(peer.id, m);
    else if (m.k === "emo") onRemoteEmote(peer.id, m);
    else if (m.k === "p") peer.send(JSON.stringify({ k: "q", t: m.t }), true);
    else if (m.k === "q") {
      var rtt = now() - num(m.t, now());
      if (rtt < 0 || rtt > 5000) return;
      peer.rtt = peer.rtt == null ? rtt : peer.rtt * 0.8 + rtt * 0.2;
      peer.rttMin = peer.rttMin == null ? rtt : Math.min(rtt, peer.rttMin + 3);
    }
  }

  // ---- THE LEVEL PICKER -----------------------------------------------------------
  // The levels flick past with you standing in each one: every card is the
  // real level, built in place of the room with your block at its spawn. It
  // slows down and lands on the pick, which is the race level itself.
  var levelCache = {};

  function fetchLevels(ids) {
    var need = ids.filter(function (id) {
      return !levelCache[id];
    });
    if (!need.length) return;
    var table = typeof levelsTable === "function" ? levelsTable() : "published_levels";
    _supabase
      .from(table)
      .select("id, name, creator, difficulty, version, data")
      .in("id", need)
      .then(function (res) {
        if (res.error || !res.data) return;
        res.data.forEach(function (row) {
          var had = levelCache[row.id];
          if (!had || num(row.version, 1) > num(had.version, 1)) levelCache[row.id] = row;
        });
      });
  }

  function levelDataOf(row) {
    var data = row.data;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch (e) {
        data = {};
      }
    }
    return Object.assign({}, data, {
      name: row.name,
      levelType: "custom",
      customLevelIndex: -1,
    });
  }

  // The cards and when each goes up: quick at first, slowing towards the
  // landing at FLIP_MS, which is always the pick.
  function pickerFlips(ids, pick) {
    var others = ids.filter(function (id) {
      return id !== pick;
    });
    var flips = 16;
    var seq = [];
    for (var k = 0; k < flips; k++) seq.push(others.length ? others[k % others.length] : pick);
    var gaps = [];
    var total = 0;
    for (var g = 0; g < flips; g++) {
      var gap = 1 + 6 * Math.pow(g / (flips - 1), 2.2);
      gaps.push(gap);
      total += gap;
    }
    var times = [];
    var acc = 0;
    gaps.forEach(function (gap) {
      times.push((acc / total) * FLIP_MS);
      acc += gap;
    });
    return { seq: seq, times: times };
  }

  // On a timer of its own rather than the frame loop: each card replaces the
  // level (and the loop) that was running.
  function pickerTick() {
    var pk = room && room.picker;
    if (!pk) return;
    var t = now();
    var since = t - pk.start;
    if (since >= FLIP_MS) {
      if (levelCache[pk.pick]) land(pk);
      else if (t - pk.askedAt > 2000) {
        pk.askedAt = t;
        fetchLevels([pk.pick]);
        showLabel("LOADING THE LEVEL...", "", null);
      }
      return;
    }
    var i = 0;
    while (i + 1 < pk.times.length && pk.times[i + 1] <= since) i++;
    if (i === pk.shown) return;
    var row = levelCache[pk.seq[i]];
    // Not here yet: whatever is up stays up
    if (!row) return;
    pk.shown = i;
    showFlip(levelDataOf(row));
    showLabel("", row.name || "UNTITLED", row);
  }

  function land(pk) {
    stopPicker();
    if (!room || room.state.phase !== "race" || room.state.round !== pk.round) return;
    var row = levelCache[pk.pick];
    showLevel(levelDataOf(row), "race", "r" + pk.round, null);
    showLabel(
      "NEXT LEVEL",
      row.name || "UNTITLED",
      row,
      raceCoinOn(room.state, row.difficulty) ? "WINNER GETS 1 BLUE COIN" : "",
    );
    // The intro's landing shake, once
    var gc = document.getElementById("game-container");
    if (gc) {
      gc.classList.remove("lv-shake");
      void gc.offsetWidth;
      gc.classList.add("lv-shake");
      setTimeout(function () {
        gc.classList.remove("lv-shake");
      }, 400);
    }
  }

  function stopPicker() {
    if (room && room.picker) {
      clearInterval(room.picker.timer);
      room.picker = null;
    }
    hideLabel();
  }

  // ---- THE OVERLAY --------------------------------------------------------------
  var hud = null;

  function buildHud() {
    if (hud) return hud;
    injectStyles();
    var root = el("div");
    root.id = "lv-hud";
    var board = el("div", "lv-board lv-block");
    var label = el("div", "lv-label lv-block");
    var big = el("div", "lv-big");
    var bigMain = el("div", "lv-big-main");
    var bigSub = el("div", "lv-big-sub");
    big.appendChild(bigMain);
    big.appendChild(bigSub);
    var bar = el("div", "lv-bar");
    [board, label, big, bar].forEach(function (n) {
      root.appendChild(n);
    });
    document.body.appendChild(root);
    // Where the bar ends, for the board under it on narrow screens
    if (typeof ResizeObserver === "function")
      new ResizeObserver(function () {
        root.style.setProperty("--lv-bar-bottom", bar.offsetTop + bar.offsetHeight + "px");
      }).observe(bar);
    hud = {
      root: root,
      board: board,
      label: label,
      big: big,
      bigMain: bigMain,
      bigSub: bigSub,
      bigUntil: 0,
      bar: bar,
      note: null,
      boardRows: -1,
    };
    return hud;
  }
  function showHud() {
    buildHud().root.style.display = "block";
    watchPanels();
  }

  // The panels go clear while your block is behind one, like the game's own
  // HUD: they join the list updateHudOcclusion checks every frame
  var LIVE_PANELS =
    "#lv-hud .lv-board, #lv-hud .lv-bar, #lv-hud .lv-label";
  function watchPanels() {
    if (typeof HUD_OCCLUDERS !== "string" || typeof watchHudOccluders !== "function")
      return;
    if (HUD_OCCLUDERS.indexOf(LIVE_PANELS) === -1)
      HUD_OCCLUDERS += ", " + LIVE_PANELS;
    // Observed again, so a panel that changed size is measured afresh
    watchHudOccluders();
  }
  function hideHud() {
    if (!hud) return;
    hud.root.style.display = "none";
    hideReveal();
    stopPicker();
    clearBanner();
    hud.bar.innerHTML = "";
    hud.note = null;
    hud.boardRows = -1;
    if (room) room.barKey = "";
  }

  // ---- small blocks ----
  // A player as a block: their skin's picture, or the plain block a default
  // or a colour-trail skin is
  function swatch(skin) {
    var s = el("span", "lv-sw");
    var trail = TRAIL_SKINS[skin];
    if (!skin || skin === "default" || !knownSkin(skin)) {
      s.className += " plain";
      s.style.background = "#335699";
    } else if (trail && trail.color) {
      s.className += " plain";
      s.style.background = trail.color;
    } else if (colorSkin(skin)) {
      s.className += " plain";
      s.style.background = colorSkin(skin);
    } else
      s.style.backgroundImage =
        "url('" + (EMO_FACES[skin] ? EMO_FACES[skin][0] : skinImageFile(skin)) + "')";
    return s;
  }
  function memberSkin(m) {
    if (m.id === myId) return wornSkin();
    var rm = room.remotes[m.id];
    return rm ? shownSkin(m, rm.skin) : "default";
  }
  // A row of seats, the taken ones lit
  function seats(taken, total) {
    var row = el("span", "lv-slots" + (total > 10 ? " wide" : ""));
    for (var i = 0; i < total; i++) row.appendChild(el("span", "lv-slot" + (i < taken ? " on" : "")));
    return row;
  }
  // A place on the podium as a block: gold, silver, bronze, then grey
  function placeBlock(place) {
    var b = el("span", "lv-place" + (place <= 3 ? " p" + place : ""), place ? String(place) : "-");
    b.title = place ? ordinal(place) : "Did not finish";
    return b;
  }
  // Coins taken as ten blocks, lit in coin yellow
  function progress(taken, total) {
    var row = el("span", "lv-prog");
    var lit = total ? Math.round((taken / total) * 10) : 0;
    for (var i = 0; i < 10; i++) row.appendChild(el("i", i < lit ? "on" : ""));
    row.title = taken + " / " + total + " coins";
    return row;
  }

  // The countdown's numbers and GO, built from blocks
  var GLYPHS = {
    1: [" X ", "XX ", " X ", " X ", "XXX"],
    2: ["XXX", "  X", "XXX", "X  ", "XXX"],
    3: ["XXX", "  X", "XXX", "  X", "XXX"],
    G: ["XXX", "X  ", "X X", "X X", "XXX"],
    O: ["XXX", "X X", "X X", "X X", "XXX"],
  };
  function blockWord(text) {
    var word = el("div", "lv-glyphs" + (text === "GO" ? " go" : ""));
    String(text)
      .split("")
      .forEach(function (ch) {
        var rows = GLYPHS[ch];
        if (!rows) return;
        var g = el("div", "lv-glyph");
        rows
          .join("")
          .split("")
          .forEach(function (c) {
            g.appendChild(el("i", c === "X" ? "on" : ""));
          });
        word.appendChild(g);
      });
    return word;
  }

  // The level's name while the picker runs, and what it landed on
  function showLabel(head, name, row, extra) {
    buildHud();
    var box = hud.label;
    box.innerHTML = "";
    if (head) box.appendChild(el("div", "lv-label-head", head));
    if (name) box.appendChild(el("div", "lv-label-name", name));
    if (row) {
      var d = Math.round(num(row.difficulty, 1));
      var by = el("div", "lv-label-by", "BY " + (row.creator || "?"));
      var chip = el("span", "lv-label-diff", d + " " + ((window.DIFFICULTY_LABELS || {})[d] || ""));
      chip.style.marginLeft = "10px";
      chip.style.color = (window.DIFFICULTY_COLORS || {})[d] || "#fff";
      by.appendChild(chip);
      box.appendChild(by);
    }
    if (extra) {
      var coin = el("div", "lv-label-coin");
      coin.appendChild(el("span", "lv-tagblock", extra));
      box.appendChild(coin);
    }
    box.style.display = "block";
  }
  function hideLabel() {
    if (hud) hud.label.style.display = "none";
  }

  // blocks: draw `main` with the block glyphs rather than as text
  // `cls` dresses it differently ("ev": on a block, for the awards show;
  // "intro": the show's one-line name)
  function bigBanner(main, sub, drop, ms, blocks, cls) {
    buildHud();
    hud.big.className = "lv-big" + (cls ? " " + cls : "");
    hud.bigMain.textContent = "";
    if (blocks) hud.bigMain.appendChild(blockWord(main));
    else hud.bigMain.textContent = main;
    hud.bigSub.textContent = sub || "";
    hud.big.style.display = "flex";
    hud.big.classList.remove("drop");
    if (drop) {
      void hud.big.offsetWidth;
      hud.big.classList.add("drop");
    }
    hud.bigUntil = ms ? now() + ms : 0;
  }
  function clearBanner() {
    if (!hud) return;
    hud.big.style.display = "none";
    hud.bigUntil = 0;
  }

  // Per frame, but every write is skipped unless the text changed. The race
  // clock is written 20 times a second, not every frame: each new text lays
  // the page out again, and every frame of that cost as much as the rest of
  // the frame.
  function hudTick(t) {
    if (!hud) return;
    var timer = document.getElementById("timer-display");
    if (run.kind === "race") {
      var exact = run.finished && room.myFinish != null;
      if (exact || t - run.timerAt >= TIMER_EVERY_MS) {
        run.timerAt = t;
        var text = formatTime(Math.max(0, exact ? room.myFinish : t - run.goAt));
        if (timer.lvText !== text) {
          timer.lvText = text;
          timer.textContent = text;
        }
      }
      if (timer.style.display !== "block") timer.style.display = "block";
      if (t < run.goAt) {
        if (run.goAt - t <= COUNTDOWN_MS) {
          var n = clamp(Math.ceil((run.goAt - t) / 1000), 1, 3);
          if (n !== run.shownCount) {
            run.shownCount = n;
            bigBanner(String(n), "", true, 0, true);
          }
        }
      } else if (!run.wentGo) {
        run.wentGo = true;
        bigBanner("GO", "", true, 700, true);
        hideLabel();
      }
    }
    if (hud.bigUntil && t > hud.bigUntil) clearBanner();

    var note = "";
    var st = room.state;
    if (st.ev) note = evNote;
    else if (st.phase === "race" && room.firstFinAt && t >= st.goAt) {
      var left = Math.ceil((AFTER_FIRST_MS - (t - room.firstFinAt)) / 1000);
      if (left > 0) note = "RACE ENDS IN " + left;
    }
    if (hud.note && hud.note.textContent !== note) hud.note.textContent = note;
  }

  // The room as blocks: who is in it, wearing what, how they are doing.
  // During a race each racer shows their coins as a bar of blocks, finishers
  // their place and time; between races the link to each player.
  // Built aside and only put up when it reads differently: it is redrawn
  // twice a second in a race, and swapping it every time restyled and
  // relaid the panel even when nothing on it had changed.
  function renderBoard() {
    if (!room || !hud) return;
    var next = el("div");
    fillBoard(next);
    var html = next.innerHTML;
    if (html === hud.boardHtml && hud.board.firstChild) return;
    hud.boardHtml = html;
    hud.board.replaceChildren.apply(hud.board, Array.prototype.slice.call(next.childNodes));
  }
  // The board can be put away (HIDE) so it doesn't cover the level; kept
  // on this device
  var boardHidden = false;
  try {
    boardHidden = localStorage.getItem("boi-live-board-hidden") === "1";
  } catch (e) {}
  function toggleBoard(ev) {
    if (ev) ev.stopPropagation();
    boardHidden = !boardHidden;
    try {
      localStorage.setItem("boi-live-board-hidden", boardHidden ? "1" : "0");
    } catch (e) {}
    if (hud) hud.boardHtml = null;
    renderBoard();
    watchPanels();
  }
  function fillBoard(b) {
    var r = room;
    hud.board.classList.toggle("lv-folded", boardHidden);
    var top = el("div", "lv-board-top");
    var code = el("div", "lv-code", "ROOM " + r.code);
    top.appendChild(code);
    var hide = el("button", "lv-hide", boardHidden ? "SHOW" : "HIDE");
    hide.type = "button";
    hide.title = boardHidden ? "Show the players" : "Hide the players";
    hide.onpointerdown = function (e) {
      e.stopPropagation();
    };
    hide.onclick = toggleBoard;
    top.appendChild(hide);
    b.appendChild(top);
    hud.board.classList.toggle("lv-ev", !!r.state.ev && !boardHidden);
    if (boardHidden) return;
    if (r.state.ev) return fillEventBoard(b);
    var sub = el("div", "lv-sub");
    sub.appendChild(seats(r.members.length, roomSize(r)));
    sub.appendChild(document.createTextNode(r.state.priv ? "PRIVATE" : "PUBLIC"));
    b.appendChild(sub);

    var st = r.state;
    var racing = st.phase === "race";
    var wins = st.wins || {};
    // After a race: how it went, in finishing order, then anyone who came
    // in since
    if (st.phase === "showoff" && Array.isArray(st.results)) {
      b.appendChild(el("div", "lv-board-head", "ROUND " + st.round + " RESULTS"));
      var place = 0;
      var coin = raceCoinOn(st);
      var shown = {};
      st.results.forEach(function (res, i) {
        shown[res.id] = true;
        var row = el("div", "lv-row" + (res.id === myId ? " me" : ""));
        if (res.time != null) place++;
        row.appendChild(placeBlock(res.time != null ? place : 0));
        var m = memberOf(res.id);
        row.appendChild(swatch(m ? memberSkin(m) : "default"));
        row.appendChild(el("span", "lv-nm", cleanName(res.n)));
        if (coin && i === 0 && res.time != null) {
          var bc = el("span", "lv-tagblock", "+1");
          bc.title = "1 Blue Coin for the win";
          row.appendChild(bc);
        }
        if (res.d) row.appendChild(el("span", "lv-st dead", res.d + (res.d === 1 ? " DEATH" : " DEATHS")));
        row.appendChild(
          el("span", "lv-st" + (res.time != null ? " done" : ""), res.time != null ? formatTime(res.time) : "DNF"),
        );
        if (canKick(m)) row.appendChild(kickButton(m));
        b.appendChild(row);
      });
      r.members.forEach(function (m) {
        if (shown[m.id]) return;
        var row = el("div", "lv-row" + (m.id === myId ? " me" : ""));
        row.appendChild(swatch(memberSkin(m)));
        row.appendChild(el("span", "lv-nm", cleanName(m.n)));
        if (canKick(m)) row.appendChild(kickButton(m));
        b.appendChild(row);
      });
      var count = st.results.length + r.members.length;
      if (hud.boardRows !== count) {
        hud.boardRows = count;
        watchPanels();
      }
      return;
    }
    var coinsOf = function (m) {
      if (m.id === myId) return run && run.kind === "race" ? coinsTaken() : 0;
      var rm = r.remotes[m.id];
      return rm && rm.lv === "r" + st.round ? num(rm.cl) : 0;
    };
    var rows = r.members.slice();
    if (racing)
      rows.sort(function (a, c) {
        var fa = r.fins[a.id];
        var fc = r.fins[c.id];
        if (fa != null && fc != null) return fa - fc;
        if (fa != null || fc != null) return (fa == null) - (fc == null);
        return coinsOf(c) - coinsOf(a);
      });
    rows.forEach(function (m) {
      var row = el("div", "lv-row" + (m.id === myId ? " me" : ""));
      var fin = racing ? r.fins[m.id] : null;
      if (fin != null) row.appendChild(placeBlock(finishPlace(m.id)));
      row.appendChild(swatch(memberSkin(m)));
      row.appendChild(el("span", "lv-nm", cleanName(m.n)));
      if (wins[m.id]) {
        var w = el("span", "lv-tagblock gold", wins[m.id] + "W");
        w.title = wins[m.id] + (wins[m.id] === 1 ? " win" : " wins") + " in this room";
        row.appendChild(w);
      }
      // Mid-race the row is about the race; the host is shown between races
      if (m.id === r.hostId && !racing) row.appendChild(el("span", "lv-tagblock", "HOST"));
      if (racing) {
        var inIt = st.players.some(function (p) {
          return p.id === m.id;
        });
        if (fin != null) row.appendChild(el("span", "lv-st done", formatTime(fin)));
        else if (!inIt) row.appendChild(el("span", "lv-st", "WAITING"));
        else if (now() < st.goAt) row.appendChild(el("span", "lv-st", "READY"));
        else {
          var rm = r.remotes[m.id];
          var total = m.id === myId ? (run && run.coinTotal) || 0 : num(rm && rm.ct);
          row.appendChild(progress(coinsOf(m), total));
        }
      } else if (m.id !== myId) {
        // How good the link to them is: the round trip when direct, RELAY
        // when the slow fallback is carrying them
        var peer = r.peers[m.id];
        var status =
          peer && peer.open
            ? peer.rtt != null
              ? Math.round(peer.rtt) + "MS"
              : ""
            : peer && peer.state === "failed"
              ? "RELAY"
              : "LINKING";
        if (status) row.appendChild(el("span", "lv-st", status));
      }
      if (canKick(m)) row.appendChild(kickButton(m));
      b.appendChild(row);
    });
    // Measured again only when the panel grew or shrank
    if (hud.boardRows !== rows.length) {
      hud.boardRows = rows.length;
      watchPanels();
    }
  }

  // Your friends, to invite into the room: the ones on now can be sent an
  // invite (it shows in their Friends page). There is no link to share.
  var invitePanel = null;
  function openInvitePanel() {
    if (!room) return;
    var fr = currentUser && window.boiFriends ? window.boiFriends.list() : [];
    if (!fr.length) {
      notify("ADD FRIENDS TO INVITE THEM");
      return;
    }
    closeInvitePanel();
    var wrap = el("div");
    wrap.className = "lv-pick";
    var panel = el("div", "lv-sk-panel lv-block");
    panel.appendChild(el("div", "lv-sk-title", "INVITE"));
    var list = el("div", "lv-lc-list");
    fr.sort(function (a, b) {
      return (b.online - a.online) || (a.name < b.name ? -1 : 1);
    }).forEach(function (f) {
      var row = el("div", "lv-lc-row lv-inv-row");
      row.appendChild(el("span", "lv-lc-name", f.name));
      row.appendChild(el("span", "lv-lc-by", f.online ? f.playing || "ONLINE" : "OFFLINE"));
      var b = el("button", "boi-btn" + (f.online ? " blue" : ""), f.online ? "INVITE" : "OFFLINE");
      b.disabled = !f.online;
      b.onmousedown = function (e) {
        e.preventDefault();
      };
      b.onclick = function () {
        if (!room) return;
        window.boiFriends.inviteToLive(f.name, room.code);
        b.textContent = "INVITED";
        b.disabled = true;
      };
      row.appendChild(b);
      list.appendChild(row);
    });
    panel.appendChild(list);
    var foot = el("div", "lv-sk-foot");
    var close = el("button", "boi-btn", "CLOSE");
    close.onclick = closeInvitePanel;
    foot.appendChild(close);
    panel.appendChild(foot);
    wrap.appendChild(panel);
    wrap.onclick = function (e) {
      if (e.target === wrap) closeInvitePanel();
    };
    document.body.appendChild(wrap);
    invitePanel = wrap;
  }
  function closeInvitePanel() {
    if (!invitePanel) return;
    invitePanel.remove();
    invitePanel = null;
  }

  // Buttons here never take focus: Space is jump, and a focused button would
  // press itself every time.
  function barButton(text, cls, onClick) {
    var b = el("button", "boi-btn" + (cls ? " " + cls : ""), text);
    b.onmousedown = function (e) {
      e.preventDefault();
    };
    b.onclick = function () {
      b.blur();
      onClick();
    };
    return b;
  }

  function renderBar() {
    if (!room || !hud) return;
    var r = room;
    var st = r.state;
    var host = isHost();
    var key = [host, st.phase, st.maxDiff, st.priv, r.starting, r.hostId, nameOf(r.hostId, ""), st.ev ? st.ev.m : "", st.env, st.coll].join("|");
    if (key === r.barKey) return;
    r.barKey = key;
    var bar = hud.bar;
    bar.innerHTML = "";
    if (st.ev) {
      // The Level Awards: nothing to start or pick. A preview or a replay
      // can skip ahead; on the day everyone plays it as it happens.
      if (host && st.ev.m !== "live") bar.appendChild(barButton("SKIP", "blue", evSkip));
      hud.note = bar.appendChild(el("div", "lv-note lv-block", evNote));
      hud.flash = bar.appendChild(el("div", "lv-note lv-block lv-flash", ""));
      if (st.ev.m === "live") bar.appendChild(barButton("INVITE", "", openInvitePanel));
      bar.appendChild(barButton("LEAVE", "", askLeave));
      watchPanels();
      return;
    }
    if (host && st.phase !== "race") {
      // How hard the random level can be -- the level itself is never picked
      var items = [];
      for (var d = 1; d <= 10; d++) items.push({ value: String(d), label: "MAX " + diffName(d) });
      var dd = makeBlockDropdown(items, String(st.maxDiff), function (v) {
        if (isHost() && room.state.phase !== "race")
          hostSetState({ maxDiff: clamp(Math.round(num(v, 5)), 1, 10) });
      });
      bar.appendChild(dd);
      bar.appendChild(
        barButton(st.priv ? "PRIVATE" : "PUBLIC", "", function () {
          if (isHost()) hostSetState({ priv: !room.state.priv });
        }),
      );
      // The lobby: any environment the host owns (and the one the room is
      // in, even if it isn't theirs -- a host who took over)
      var envIds = window.boiOwnedEnvironments ? window.boiOwnedEnvironments() : ["default"];
      var here = st.env || "default";
      if (envIds.indexOf(here) === -1) envIds = [here].concat(envIds);
      bar.appendChild(
        makeBlockDropdown(
          envIds.map(function (id) {
            return { value: id, label: window.boiEnvironment(id).name.toUpperCase() };
          }),
          here,
          function (v) {
            if (isHost() && room.state.phase !== "race") hostSetState({ env: cleanEnv(v) });
          },
        ),
      );
      bar.appendChild(
        barButton(st.coll === false ? "COLLISIONS OFF" : "COLLISIONS ON", "", function () {
          if (isHost()) hostSetState({ coll: room.state.coll === false });
        }),
      );
      var go = barButton(r.starting ? "PICKING..." : "START RACE", "blue", hostStart);
      go.disabled = r.starting;
      bar.appendChild(go);
    } else if (host && st.phase === "race") {
      bar.appendChild(barButton("END RACE", "", endRace));
    } else if (st.phase === "lobby") {
      bar.appendChild(
        el(
          "div",
          "lv-note lv-block",
          "WAITING FOR " + nameOf(r.hostId, "THE HOST") + " (MAX " + diffName(st.maxDiff) +
            (st.coll === false ? ", NO COLLISIONS" : "") + ")",
        ),
      );
    }
    hud.note = bar.appendChild(el("div", "lv-note lv-block", ""));
    hud.flash = bar.appendChild(el("div", "lv-note lv-block lv-flash", ""));
    bar.appendChild(barButton("INVITE", "", openInvitePanel));
    bar.appendChild(barButton("LEAVE", "", askLeave));
    watchPanels();
  }

  // ---- THE BLUE COIN FOR A WIN ----------------------------------------------------
  // Winning a race on a level above difficulty LIVE_COIN_MIN_DIFF pays the
  // winner one Blue Coin -- when there was somebody to beat (two racers or
  // more), the winner is signed in, and at most LIVE_COINS_PER_DAY times a
  // day, so a pair of friends cannot farm it by trading wins. It is a
  // bluecoin_claims row like the game's other payouts, keyed
  // live:<level>:<race> so one race never pays twice. Not being a campaign: or
  // custom: row, it counts towards neither Blocktober nor the custom-level
  // limit.
  function raceCoinOn(st, diff) {
    return num(diff != null ? diff : st.diff) > LIVE_COIN_MIN_DIFF && (st.players || st.results || []).length >= 2;
  }

  function claimWin(st) {
    var first = st.results[0];
    if (!first || first.id !== myId || first.time == null || !st.raceId) return;
    var row = levelCache[st.pick];
    var diff = row ? num(row.difficulty) : num(st.diff);
    if (diff <= LIVE_COIN_MIN_DIFF || st.results.length < 2) return;
    if (!currentUser) {
      notify("SIGN IN TO GET BLUE COINS FOR WINS");
      return;
    }
    var user = currentUser;
    var key = "live:" + st.pick + ":" + st.raceId;
    var others = st.results.length - 1;
    var name = row && row.name ? row.name : "the level";
    Promise.resolve(typeof blueCoinsReady !== "undefined" ? blueCoinsReady : null)
      .then(function () {
        if (!blueCoinsSupported || !blueCoinClaimsSupported) return;
        return _supabase
          .from("bluecoin_claims")
          .select("level_key")
          .eq("username", user)
          .like("level_key", "live:%")
          .gte("created_at", new Date(startOfTodayMs()).toISOString())
          .then(function (res) {
            if (res.error) return;
            var rows = res.data || [];
            if (rows.some(function (r) { return r.level_key === key; })) return;
            if (rows.length >= LIVE_COINS_PER_DAY) {
              notify("DAILY LIMIT OF LIVE BLUE COINS REACHED");
              return;
            }
            // The server pays it and keeps the daily limit (boi_claim)
            return serverClaim(key)
              .then(function (claim) {
                if (!claim.ok) {
                  if (claim.reason === "daily-limit")
                    notify("DAILY LIMIT OF LIVE BLUE COINS REACHED");
                  return;
                }
                return Promise.resolve(claim.balance).then(function (total) {
                  if (currentUser !== user) return;
                  blueCoinWallet.balance =
                    typeof total === "number" ? total : blueCoinWallet.balance + 1;
                  updateBlueCoinDisplays();
                  showBlueCoinReward(
                    "LIVE WIN",
                    1,
                    "For winning " + name + " against " + others + (others === 1 ? " player." : " players."),
                  );
                });
              });
          });
      })
      .catch(function () {});
  }

  // Escape closes the invite list before the game's own handler can read it as
  // "leave the level"
  window.addEventListener(
    "keydown",
    function (e) {
      if (invitePanel && e.key === "Escape") {
        e.stopImmediatePropagation();
        e.preventDefault();
        closeInvitePanel();
      }
    },
    true,
  );

  // ---- LEAVING ------------------------------------------------------------------
  function askLeave() {
    if (!room) return;
    if (run && run.kind === "race" && !run.finished && typeof popupManager === "object") {
      popupManager.show({
        title: "LEAVE THE ROOM?",
        message: "You'll drop out of this race.",
        buttons: [
          { text: "LEAVE", onClick: function () { leaveRoom(); } },
          { text: "STAY", class: "secondary", onClick: function () {} },
        ],
      });
      return;
    }
    leaveRoom();
  }

  function setRoomLink(code) {
    try {
      var params = new URLSearchParams(location.search);
      // The room is no longer put in the address (no sharing links); an
      // old ?live= is only taken away
      params.delete("live");
      var q = params.toString();
      history.replaceState(
        history.state,
        "",
        location.pathname + (q ? "?" + q : "") + location.hash,
      );
    } catch (e) {}
  }

  // ---- THE LEVEL AWARDS LIVE EVENT ---------------------------------------------
  // The Legends Level Awards for October, given out live. The game says when
  // (window.LEVEL_AWARDS_EVENT: 4pm Sunday 25 October, Los Angeles) and which
  // level_awards rows are its categories (title says "Legends" and
  // "October"). Each category is announced, then its 3rd, 2nd and 1st place
  // are revealed one at a time, and after each reveal everyone plays that
  // level together for PLAY_MS. Best Overall Level comes last.
  //
  // It runs on the clock, not on the host: every event room works out where
  // the show is from the start time alone, so all rooms -- and anyone who
  // comes in late -- are at the same moment. On the day the start is the
  // fixed time; an admin's preview, or a replay once it is over, starts when
  // its (private) room is made, and its host can SKIP to the next part.
  var EV_TITLE_MS = 7000;
  var EV_CAT_MS = 5000;
  var EV_REVEAL_MS = 6000;
  var EV_PLAY_MS = 30000;
  var EV_END_MS = 10000;
  // Coming in after the start, the show's name is up this long first
  var EV_LATE_INTRO_MS = 3500;
  // JOIN opens this long before the start, to wait in the hub with the others
  var EV_DOORS_MS = 10 * 60000;
  var PLACE_NAMES = { 1: "1ST PLACE", 2: "2ND PLACE", 3: "3RD PLACE" };

  function evInfo() {
    return window.LEVEL_AWARDS_EVENT || null;
  }

  // Everyone who plays in the show on the day (not a preview or a replay)
  // gets the Blue Coin Mog emote once it is over. Playing is noted on this
  // device ("1"), and once the emote is given ("done") it isn't again.
  var EV_REWARD = "emote:bluecoinmog";
  function evRewardKey() {
    var info = evInfo();
    return info && currentUser ? "boi-awards-played:" + info.startsAt + ":" + currentUser : null;
  }
  function evRewardState() {
    var key = evRewardKey();
    try {
      return key ? localStorage.getItem(key) : null;
    } catch (e) {
      return null;
    }
  }
  function setEvRewardState(v) {
    var key = evRewardKey();
    try {
      if (key) localStorage.setItem(key, v);
    } catch (e) {}
  }
  function noteEvPlayed() {
    if (!evRewardState()) setEvRewardState("1");
  }
  var evGiving = false;
  function giveEvReward() {
    if (evGiving || evRewardState() !== "1" || typeof grantCosmetic !== "function") return;
    evGiving = true;
    grantCosmetic(EV_REWARD, "event:level-awards")
      .then(function (got) {
        evGiving = false;
        if (got === "error") return;
        setEvRewardState("done");
        // The game's own "new emote" reveal; owning it already, just thanks
        if (got === "ok" && typeof showCosmeticUnlock === "function")
          showCosmeticUnlock(EV_REWARD, "For playing in the " + evInfo().name + ".", {
            title: "LEVEL AWARDS",
          });
        else if (typeof showTopNotification === "function")
          showTopNotification(
            got === "ok"
              ? "You got the Blue Coin Mog emote for playing in the Level Awards"
              : "Thanks for playing in the Level Awards! You already have the Blue Coin Mog emote",
          );
      })
      .catch(function () {
        evGiving = false;
      });
  }
  // Wherever you are in the game: once the show you played in is over,
  // the emote comes (not only at the end of the show or on the LIVE menu,
  // so leaving early or going elsewhere still gets it)
  setInterval(function () {
    if (evRewardState() !== "1") return;
    if (!evData) return void loadEvData();
    if (evPhase() === "over" && !(room && room.state.ev)) giveEvReward();
  }, 5000);
  // "LEGENDS LEVEL AWARDS OCTOBER"
  function evTitle() {
    var info = evInfo();
    return (String(info.name) + " " + String(info.month)).toUpperCase();
  }

  // The award rows, in the order they were added, Best Overall Level last;
  // and the show they make (evData.segs)
  var evData = null;
  var evLoading = null;
  function loadEvData() {
    if (evData) return Promise.resolve(evData);
    if (evLoading) return evLoading;
    var info = evInfo();
    if (!info || typeof _supabase === "undefined" || !_supabase) return Promise.resolve(null);
    evLoading = _supabase
      .from("level_awards")
      .select("*")
      .order("created_at", { ascending: true })
      .then(function (res) {
        if (res.error) {
          evLoading = null;
          return null;
        }
        var rows = (res.data || []).filter(function (row) {
          return info.match(row.title);
        });
        return browserLevels(rows).then(function (byId) {
          evLoading = null;
          evData = buildShow(rows, byId);
          refreshMenu();
          return evData;
        });
      })
      .catch(function () {
        evLoading = null;
        return null;
      });
    return evLoading;
  }

  // "2026 Best Overall Level Legends Level Awards October" -> "BEST OVERALL LEVEL"
  function categoryName(title) {
    var name = String(title || "")
      .replace(/\b(19|20)\d\d\b/g, " ")
      .replace(/\blegends?\b/gi, " ")
      .replace(/\blevel awards?\b/gi, " ")
      .replace(/\bawards?\b/gi, " ")
      .replace(/\boctober\b/gi, " ")
      .replace(/[-:|·]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return (name || "AWARD").toUpperCase();
  }

  function awardLevel(raw) {
    var data = raw;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch (e) {
        return null;
      }
    }
    if (!data || typeof data !== "object" || !Array.isArray(data.plan)) return null;
    return Object.assign({}, data, { levelType: "custom", customLevelIndex: -1 });
  }

  // The level browser's levels the rows name by id (level1_id..level3_id),
  // as they are now: id -> row. Nothing for a row without ids, or offline.
  function browserLevels(rows) {
    var ids = [];
    rows.forEach(function (row) {
      [1, 2, 3].forEach(function (place) {
        var id = row["level" + place + "_id"];
        if (id != null && ids.indexOf(Number(id)) === -1) ids.push(Number(id));
      });
    });
    if (!ids.length || typeof levelsTable !== "function") return Promise.resolve({});
    var ready = typeof levelsViewReady !== "undefined" ? levelsViewReady : Promise.resolve();
    return Promise.resolve(ready)
      .then(function () {
        return _supabase
          .from(levelsTable())
          .select("id, name, creator, difficulty, data")
          .in("id", ids);
      })
      .then(function (res) {
        var byId = {};
        (res.data || []).forEach(function (r) {
          byId[r.id] = r;
        });
        return byId;
      })
      .catch(function () {
        return {};
      });
  }

  // Each place is the level browser's level when the row names one by id
  // (its current version, name and creator); otherwise the level the row
  // itself holds
  function buildShow(rows, byId) {
    byId = byId || {};
    var cats = rows.map(function (row) {
      var places = [3, 2, 1]
        .map(function (place) {
          var pub = byId[row["level" + place + "_id"]];
          var data = (pub && awardLevel(pub.data)) || awardLevel(row["level" + place]);
          if (!data) return null;
          var name = (pub && pub.name) || data.name || "LEVEL";
          return {
            place: place,
            data: Object.assign(data, { name: name }),
            name: String(name).slice(0, 80),
            creator: (pub && pub.creator) || data.creator || data.visualAuthor || "?",
            difficulty: num(pub && pub.difficulty != null ? pub.difficulty : data.difficulty, 0),
          };
        })
        .filter(Boolean);
      return { name: categoryName(row.title), places: places };
    }).filter(function (c) {
      return c.places.length;
    });
    // Best Overall Level is always the last
    var overall = cats.filter(function (c) {
      return /overall/i.test(c.name);
    });
    cats = cats.filter(function (c) {
      return !/overall/i.test(c.name);
    }).concat(overall);
    var segs = [{ k: "title", ms: EV_TITLE_MS }];
    cats.forEach(function (c, ci) {
      segs.push({ k: "cat", ci: ci, ms: EV_CAT_MS });
      c.places.forEach(function (pl) {
        pl.revealAt = segs.length;
        segs.push({ k: "reveal", ci: ci, pl: pl, ms: EV_REVEAL_MS });
        segs.push({ k: "play", ci: ci, pl: pl, ms: EV_PLAY_MS });
      });
    });
    segs.push({ k: "end", ms: EV_END_MS });
    var at = 0;
    segs.forEach(function (s) {
      s.at = at;
      at += s.ms;
    });
    return { cats: cats, segs: segs, total: at };
  }

  // Where the show is at `ms` from its start: the part's index, or -1
  // before it and segs.length after it
  function segAt(ms) {
    if (!evData || ms < 0) return -1;
    for (var i = 0; i < evData.segs.length; i++) {
      var s = evData.segs[i];
      if (ms < s.at + s.ms) return i;
    }
    return evData.segs.length;
  }

  // On the day: before the doors open, waiting, under way, or over
  function evPhase() {
    var info = evInfo();
    if (!info) return "none";
    var t = Date.now();
    if (t < info.startsAt - EV_DOORS_MS) return "soon";
    if (t < info.startsAt) return "doors";
    var total = evData ? evData.total : 60 * 60000;
    return t < info.startsAt + total ? "on" : "over";
  }

  function evClock(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    var d = Math.floor(s / 86400);
    var h = Math.floor((s % 86400) / 3600);
    var m = Math.floor((s % 3600) / 60);
    var two = function (n) {
      return (n < 10 ? "0" : "") + n;
    };
    var hms = (d || h ? h + ":" + two(m) : m) + ":" + two(s % 60);
    return (d ? d + "D " : "") + hms;
  }

  function amAdmin() {
    return typeof currentUserIsAdmin !== "undefined" && !!currentUserIsAdmin;
  }

  // The event's block on the LIVE menu: when it is, and JOIN once it is on
  // (PREVIEW for admins before then, REPLAY once it is over)
  function evMenuCard() {
    var info = evInfo();
    if (!info) return null;
    loadEvData();
    var card = el("div", "lv-ev-card lv-block");
    card.appendChild(el("div", "lv-ev-title", "LEVEL AWARDS LIVE"));
    card.appendChild(
      el("div", "lv-ev-sub", evTitle()),
    );
    var when = el("div", "lv-ev-when", "");
    card.appendChild(when);
    var btns = el("div", "lv-ev-btns");
    card.appendChild(btns);
    var shown = "";
    var day = new Date(info.startsAt).toLocaleString([], {
      weekday: "long",
      hour: "numeric",
      minute: "2-digit",
    });
    // Stops once the card has been on the page and is gone again
    var placed = false;
    var tick = function () {
      if (document.body.contains(card)) placed = true;
      else if (placed) return clearInterval(timer);
      var ph = evPhase();
      var left = info.startsAt - Date.now();
      // Played in it and left before the end: the emote now it's over
      if (ph === "over") giveEvReward();
      when.textContent =
        ph === "soon" || ph === "doors"
          ? String(day).toUpperCase() + "\nSTARTS IN " + evClock(left)
          : ph === "on"
            ? "HAPPENING NOW"
            : "IT'S OVER\nPLAY IT AGAIN";
      var key = ph + "|" + amAdmin() + "|" + lobby.status;
      if (key === shown) return;
      shown = key;
      btns.innerHTML = "";
      var ok = lobby.status === "on";
      if (ph === "doors" || ph === "on") {
        var join = el("button", "btn", "JOIN");
        join.disabled = !ok;
        join.onclick = function () {
          startEvent("live");
        };
        btns.appendChild(join);
      }
      if (ph === "over") {
        var again = el("button", "btn", "REPLAY");
        again.disabled = !ok;
        again.onclick = function () {
          startEvent("replay");
        };
        btns.appendChild(again);
      }
      if (amAdmin() && ph !== "over") {
        var pre = el("button", "btn", "PREVIEW");
        pre.disabled = !ok;
        pre.title = "Admins only: play it now, on your own";
        pre.onclick = function () {
          startEvent("preview");
        };
        btns.appendChild(pre);
      }
      btns.style.display = btns.childNodes.length ? "" : "none";
    };
    var timer = setInterval(tick, 1000);
    tick();
    return card;
  }

  // JOIN goes into an open event room (or makes one); PREVIEW and REPLAY get
  // a private room of their own that starts in a moment
  function startEvent(mode) {
    if (room) return;
    if (lobby.status !== "on") return notify("NOT CONNECTED YET");
    loadEvData().then(function (data) {
      if (room) return;
      if (!data || !data.cats.length) return notify("THE AWARDS AREN'T IN YET");
      if (mode === "preview" && !amAdmin()) return;
      if (mode === "live") {
        var open = lobbyRooms().find(function (r) {
          return r.ev && !r.priv && r.count < EVENT_ROOM_SIZE && r.v === LIVE_VERSION;
        });
        if (open) return joinRoom(open.code);
        createRoom({ ev: { m: "live", start: evInfo().startsAt }, priv: false });
      } else {
        createRoom({ ev: { m: mode, start: Date.now() + 3000 }, priv: true });
      }
    });
  }

  // ---- the show, in a room ----
  var evShown = null; // the part on screen: an index, "wait", "intro" or "over"
  var evNote = "";
  var evIntroUntil = 0;

  function evStart(ev) {
    return ev.m === "live" && evInfo() ? evInfo().startsAt : ev.start;
  }

  function evTick() {
    if (!room) return;
    var ev = room.state.ev;
    if (!ev) {
      if (evShown !== null) {
        evShown = null;
        evNote = "";
        hideReveal();
        renderBoard();
      }
      return;
    }
    if (!evData) {
      setEvNote("LOADING THE AWARDS...");
      loadEvData();
      return;
    }
    if (!evData.cats.length) return setEvNote("THE AWARDS AREN'T IN YET");
    var ms = Date.now() - evStart(ev);
    var i = segAt(ms);
    if (i === -1) {
      if (evShown !== "wait") {
        evShown = "wait";
        hideReveal();
        enterHub();
        renderBoard();
      }
      return setEvNote("STARTS IN " + evClock(-ms));
    }
    if (i >= evData.segs.length) {
      // Over: everyone goes back to the LIVE menu. An event room never
      // turns into an ordinary room someone could then run races in.
      leaveRoom();
      giveEvReward();
      return;
    }
    if (ev.m === "live") noteEvPlayed();
    var seg = evData.segs[i];
    // In after the start: the show's name first, as if from the beginning,
    // then whatever part it has got to
    if (evShown === null && seg.k !== "title" && seg.k !== "end") {
      evShown = "intro";
      evIntroUntil = Date.now() + EV_LATE_INTRO_MS;
      hideReveal();
      hideLabel();
      enterHub();
      showIntro(EV_LATE_INTRO_MS - 300);
      renderBoard();
      renderBar();
    }
    if (evShown === "intro" && Date.now() < evIntroUntil) return setEvNote("");
    if (evShown !== i) {
      evShown = i;
      enterSeg(seg, i);
      renderBoard();
      renderBar();
    }
    var left = seg.at + seg.ms - ms;
    // While a place is revealed, how long until everyone plays it
    setEvNote(
      seg.k === "play"
        ? "NEXT IN " + Math.ceil(left / 1000)
        : seg.k === "reveal"
          ? "PLAYING IN " + Math.ceil(left / 1000)
          : seg.k === "end"
            ? "THE END"
            : evData.cats[seg.ci]
              ? evData.cats[seg.ci].name
              : "",
    );
  }

  function setEvNote(text) {
    evNote = text;
    if (hud && hud.note && hud.note.textContent !== text) hud.note.textContent = text;
  }

  function enterSeg(seg, i) {
    hideReveal();
    hideLabel();
    clearBanner();
    var cat = seg.ci != null ? evData.cats[seg.ci] : null;
    if (seg.k === "title") {
      enterHub();
      showIntro(seg.ms - 400);
    } else if (seg.k === "cat") {
      enterHub();
      bigBanner(
        cat.name,
        "CATEGORY " + (seg.ci + 1) + " OF " + evData.cats.length,
        true,
        seg.ms - 300,
        false,
        "ev",
      );
    } else if (seg.k === "reveal") {
      // The level itself, still, behind its reveal
      if (!run) enterHub();
      try {
        showFlip(seg.pl.data);
      } catch (e) {
        enterHub();
      }
      showReveal(cat, seg.pl);
    } else if (seg.k === "play") {
      showLevel(seg.pl.data, "event", "ev" + i, null);
      showLabel(
        PLACE_NAMES[seg.pl.place] + " IN " + cat.name,
        seg.pl.name,
        { creator: seg.pl.creator, difficulty: seg.pl.difficulty },
      );
      bigBanner("GO", "", true, 700, true);
    } else if (seg.k === "end") {
      // The board has every result now; then back to the menu
      enterHub();
    }
  }

  // The show's name, in one line
  function showIntro(ms) {
    bigBanner(evTitle(), "", true, ms, false, "ev intro");
  }

  // The reveal: the category, the place as a gold, silver or bronze block,
  // then the level's name and who made it, dropping in one after another
  function showReveal(cat, pl) {
    buildHud();
    if (!hud.reveal) hud.reveal = hud.root.appendChild(el("div", "lv-rev lv-block"));
    var box = hud.reveal;
    box.innerHTML = "";
    box.appendChild(el("div", "lv-rev-cat", cat.name));
    box.appendChild(el("div", "lv-rev-place p" + pl.place, PLACE_NAMES[pl.place]));
    box.appendChild(el("div", "lv-rev-name", pl.name));
    box.appendChild(el("div", "lv-rev-by", "BY " + String(pl.creator).slice(0, 60)));
    box.classList.remove("on");
    void box.offsetWidth;
    box.classList.add("on");
  }
  function hideReveal() {
    if (hud && hud.reveal) hud.reveal.classList.remove("on");
  }

  // SKIP (a preview or a replay): the part on screen ends now
  function evSkip() {
    var ev = room && room.state.ev;
    if (!ev || ev.m === "live" || !isHost() || !evData) return;
    var ms = Date.now() - ev.start;
    var i = segAt(ms);
    var by = i === -1 ? -ms : i < evData.segs.length ? evData.segs[i].at + evData.segs[i].ms - ms : 0;
    if (by <= 0) return;
    hostSetState({ ev: { m: ev.m, start: ev.start - by - 1 } });
    evTick();
  }

  // The board in the event: the results so far, category by category
  function fillEventBoard(b) {
    b.appendChild(el("div", "lv-board-head", evTitle()));
    var at = typeof evShown === "number" ? evShown : evShown === "over" ? 1e9 : -1;
    if (evData && at >= 0) {
      var nowSeg = evData.segs[at];
      evData.cats.forEach(function (c, ci) {
        // Only once its reveal is over, so the board never gives it away
        var shown = c.places.filter(function (pl) {
          return pl.revealAt < at;
        });
        var current = nowSeg && nowSeg.ci === ci;
        if (!shown.length && !current) return;
        b.appendChild(el("div", "lv-ev-cat" + (current ? " now" : ""), c.name));
        shown.forEach(function (pl) {
          var row = el("div", "lv-row" + (nowSeg && nowSeg.pl === pl ? " ev-now" : ""));
          row.appendChild(placeBlock(pl.place));
          row.appendChild(el("span", "lv-nm", pl.name));
          b.appendChild(row);
        });
      });
    }
    var who = el("div", "lv-sub");
    who.appendChild(seats(room.members.length, roomSize(room)));
    who.appendChild(
      document.createTextNode(
        room.state.ev.m === "live" ? room.members.length + (room.members.length === 1 ? " PLAYER" : " PLAYERS") : room.state.ev.m === "preview" ? "PREVIEW" : "REPLAY",
      ),
    );
    b.appendChild(who);
  }

  // ---- HOOKS INTO THE GAME -------------------------------------------------------
  // Escape, the ESC box and U all leave a level through exitToMenu; R and the
  // restart button through restartCurrentLevel. In a room they mean "leave
  // the room" and "back to the start".
  var realExitToMenu = exitToMenu;
  exitToMenu = function () {
    if (room && run) {
      askLeave();
      return;
    }
    return realExitToMenu.apply(this, arguments);
  };

  // Flickers in a shared race level follow the race clock (see SHARED BLOCKS)
  var realUpdateFlicker = updateFlicker;
  updateFlicker = function (actor, step, level) {
    if (level && level.lvShared) return sharedFlicker(actor, step, level);
    return realUpdateFlicker(actor, step, level);
  };

  var realRestart = restartCurrentLevel;
  restartCurrentLevel = function () {
    if (room && run) {
      if (run.kind === "flip") return;
      if (run.kind === "race" && (run.finished || now() < run.goAt)) return;
      respawn();
      return;
    }
    return realRestart.apply(this, arguments);
  };

  // Any other screen the game opens takes you out of the room, and leaving
  // the LIVE menu lets go of the lobby, so nobody counts as online who is not.
  var realShowMenu = showMenu;
  showMenu = function (view) {
    if (view !== "live" && room) leaveRoom();
    var out = realShowMenu.apply(this, arguments);
    if (view !== "live" && !room) {
      menuEls = null;
      if (lobby.ch) dropLobby("off");
    }
    return out;
  };

  // (?live=CODE links were removed: rooms are joined from the LIVE menu
  // or a friend's invite)

  // Opens LIVE and goes into room `code` once the lobby is up
  function joinCode(code) {
    code = String(code || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
    if (room && room.code === code) return;
    if (room) leaveRoom();
    showMenu("live");
    if (code.length !== 4) return;
    var waited = 0;
    var join = setInterval(function () {
      waited++;
      if (room) return clearInterval(join);
      if (lobby.status === "on" && (lobby.synced || waited > 8)) {
        clearInterval(join);
        joinRoom(code);
      } else if (lobby.status === "full" || lobby.status === "offline" || waited > 60) {
        clearInterval(join);
      }
    }, 250);
  }

  window.BoiLive = {
    renderMenu: renderMenu,
    startEvent: startEvent,
    emote: sendEmote,
    joinCode: joinCode,
    // For testing from the console
    debug: function () {
      return {
        myId: myId,
        lobby: lobby,
        room: room,
        run: run,
        relaying: relaying,
        skinOwners: skinOwners,
      };
    },
  };
})();
