/**
 * comm.js — Persistente globale communicatielaag
 * Beheert naadloos bellen + chatten over pagina-navigaties heen.
 * Injecteert GEEN zichtbare balk — pagina's renderen hun eigen knoppen
 * via CommLayer.renderControls(containerEl) of world.html's eigen map-overlay.
 *
 * Publieke API:
 *   CommLayer.setSession(code, player)  — sla sessie op bij koppelen
 *   CommLayer.toggleChat()              — open/sluit chatpaneel
 *   CommLayer.toggleCall()              — start/stop gesprek
 *   CommLayer.toggleSett()              — open/sluit instellingen
 *   CommLayer.sendChat()                — stuur chatbericht vanuit invoerveld
 *   CommLayer.getUnread()               — huidig aantal ongelezen berichten
 *   CommLayer.isInCall()                — true als gesprek actief
 */

(function () {
  'use strict';

  const K = {
    code:    'comm_code',
    player:  'comm_player',
    call:    'comm_call_active',
    calling: 'comm_calling_pref',
    chatLog: 'comm_chat_log',
    unread:  'comm_unread',
  };

  const C = {
    code:        localStorage.getItem(K.code)   || null,
    player:      localStorage.getItem(K.player) || '1',
    callActive:  localStorage.getItem(K.call)   === 'true',
    callingPref: localStorage.getItem(K.calling) !== 'false',
    pc:          null,
    stream:      null,
    inCall:      false,
    koppelReady: false,
    unread:      parseInt(localStorage.getItem(K.unread) || '0'),
    chatOpen:    false,
    settOpen:    false,
    progOpen:    false,
    ringing:     false,
    ringTimer:   null,
    audioCtx:    null,
    _pendingOffer: null,
  };

  // ── Calling state (ontvangen van server) ────────────────────
  const CS = {
    sharedSeconds: 0, messages: { p1: 0, p2: 0 },
    boardsCompleted: 0, callUnlocked: false,
    consent: { p1: null, p2: null }, asker: null,
    conditionsMet: false, cooldownUntil: null, showCooldown: false,
  };
  let cdInterval = null; // countdown interval

  // ── Beltoon via Web Audio (geen extern bestand nodig)
  function playRing() {
    try {
      C.audioCtx = C.audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      let tick = 0;
      C.ringTimer = setInterval(() => {
        if (tick++ > 8) { stopRing(); return; }
        const osc = C.audioCtx.createOscillator();
        const g   = C.audioCtx.createGain();
        osc.connect(g); g.connect(C.audioCtx.destination);
        osc.frequency.value = tick % 2 === 0 ? 480 : 440;
        g.gain.setValueAtTime(0.28, C.audioCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, C.audioCtx.currentTime + 0.45);
        osc.start(); osc.stop(C.audioCtx.currentTime + 0.45);
      }, 900);
    } catch (e) {}
  }
  function stopRing() { clearInterval(C.ringTimer); C.ringTimer = null; C.ringing = false; }

  // ── Panelen injecteren (chat, inkomend gesprek, instellingen)
  function injectPanels() {
    if (document.getElementById('__cl_panels')) return;
    const div = document.createElement('div');
    div.id = '__cl_panels';
    div.innerHTML = `
      <style>
        #__cl_chat {
          position:fixed;bottom:0;left:0;right:0;z-index:10200;
          max-width:440px;margin:0 auto;
          background:rgba(6,12,5,.97);border-top:1px solid rgba(200,160,64,.18);
          border-radius:18px 18px 0 0;
          display:none;flex-direction:column;max-height:55vh;
          box-shadow:0 -4px 20px rgba(0,0,0,.45);
        }
        #__cl_chat.open{display:flex;}
        #__cl_chat_hd{display:flex;align-items:center;justify-content:space-between;
          padding:10px 16px 4px;flex-shrink:0;}
        #__cl_chat_hd span{font-size:.8rem;color:#c8a040;font-weight:700;}
        #__cl_chat_hd button{background:none;border:none;color:#6a7860;font-size:1.1rem;cursor:pointer;}
        #__cl_msgs{flex:1;overflow-y:auto;padding:6px 14px;}
        .cl_msg{padding:5px 10px;margin:3px 0;border-radius:11px;font-size:.82rem;max-width:78%;}
        .cl_msg.me{background:rgba(200,160,64,.2);color:#e8c060;margin-left:auto;text-align:right;}
        .cl_msg.them{background:rgba(255,255,255,.1);color:#c8c0a8;}
        #__cl_irow{display:flex;gap:7px;padding:7px 12px 14px;flex-shrink:0;}
        #__cl_inp{flex:1;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);
          border-radius:20px;padding:8px 13px;color:#f0e8d0;font-size:.84rem;outline:none;font-family:inherit;}
        #__cl_send{background:#c8a040;color:#1a1208;border:none;border-radius:50%;
          width:34px;height:34px;font-size:1rem;cursor:pointer;flex-shrink:0;}

        #__cl_incoming{position:fixed;inset:0;z-index:10500;background:rgba(0,0,0,.82);
          display:none;flex-direction:column;align-items:center;justify-content:center;gap:18px;}
        #__cl_incoming.show{display:flex;}
        #__cl_incoming .ri{font-size:4rem;animation:cl_rng .5s ease-in-out infinite alternate;}
        @keyframes cl_rng{from{transform:rotate(-18deg)}to{transform:rotate(18deg)}}
        #__cl_incoming h3{color:#e8c060;font-size:1.3rem;font-family:inherit;}
        #__cl_incoming p{color:#9ab080;font-size:.86rem;font-family:inherit;}
        .cl_ans{background:rgba(122,196,122,.18);border:2px solid #7ac47a;color:#7ac47a;
          border-radius:40px;padding:11px 26px;font-size:.95rem;font-weight:700;cursor:pointer;font-family:inherit;}
        .cl_dec{background:rgba(200,80,80,.14);border:2px solid #e07070;color:#e07070;
          border-radius:40px;padding:11px 26px;font-size:.95rem;font-weight:700;cursor:pointer;font-family:inherit;}

        #__cl_sett{position:fixed;bottom:0;left:0;right:0;z-index:10200;
          max-width:440px;margin:0 auto;
          background:rgba(6,12,5,.97);border-top:1px solid rgba(200,160,64,.18);
          border-radius:18px 18px 0 0;display:none;padding:22px 20px 28px;
          box-shadow:0 -4px 20px rgba(0,0,0,.45);}
        #__cl_sett.open{display:block;}
        #__cl_sett_hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;}
        #__cl_sett h3{color:#e8c060;font-size:1rem;font-family:inherit;}
        #__cl_sett p{color:#6a7860;font-size:.82rem;font-style:italic;font-family:inherit;}

        /* ── Progress card ─────────────────────────────────── */
        #__cl_prog_backdrop{
          position:fixed;inset:0;z-index:10299;display:none;
        }
        #__cl_prog_backdrop.open{display:block;}
        #__cl_progress{
          position:fixed;bottom:72px;left:50%;transform:translateX(-50%);
          z-index:10300;width:calc(100% - 40px);max-width:320px;
          background:rgba(6,14,4,.97);border:1px solid rgba(160,200,80,.2);
          border-radius:16px;padding:16px;box-shadow:0 4px 24px rgba(0,0,0,.55);
          display:none;
        }
        #__cl_progress.open{display:block;}
        #__cl_prog_close{
          position:absolute;top:10px;right:12px;background:none;border:none;
          color:#6a7860;font-size:1.1rem;cursor:pointer;line-height:1;padding:2px 6px;
        }
        #__cl_prog_close:hover{color:#c0d860;}
        .cl-prog-title{color:#c0d860;font-size:.82rem;font-weight:700;letter-spacing:.06em;
          text-transform:uppercase;margin-bottom:12px;text-align:center;font-family:inherit;}
        .cl-prog-item{margin-bottom:10px;}
        .cl-prog-label{display:flex;justify-content:space-between;align-items:center;
          font-size:.75rem;color:#8a9870;margin-bottom:4px;font-family:inherit;}
        .cl-prog-label .cl-done{color:#90d890;}
        .cl-prog-bar{height:5px;background:rgba(255,255,255,.08);border-radius:3px;overflow:hidden;}
        .cl-prog-fill{height:100%;border-radius:3px;background:linear-gradient(90deg,#6a9030,#c0d850);
          transition:width .6s ease;width:0%;}
        .cl-prog-fill.done{background:#90d890;}
        #__cl_prog_ready{padding-top:10px;text-align:center;font-size:.78rem;
          color:#c8a040;font-family:inherit;line-height:1.5;}

        /* ── Fireworks ─────────────────────────────────────── */
        #__cl_fireworks{position:fixed;inset:0;z-index:10900;pointer-events:none;overflow:hidden;display:none;}
        #__cl_fireworks.show{display:block;}
        .cl-fw-msg{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
          text-align:center;z-index:1;}
        .cl-fw-msg .cl-fw-ico{font-size:3.5rem;animation:cl_fw_pop .4s ease-out;}
        .cl-fw-msg p{color:#e8c060;font-size:1.1rem;font-family:serif;margin:8px 0 0;}
        @keyframes cl_fw_pop{from{transform:scale(.5);opacity:0}to{transform:scale(1);opacity:1}}
        .cl-particle{position:absolute;width:8px;height:8px;border-radius:50%;
          animation:cl_part 1.2s ease-out forwards;}
        @keyframes cl_part{
          0%{transform:translate(0,0) scale(1);opacity:1;}
          100%{transform:translate(var(--tx),var(--ty)) scale(0);opacity:0;}
        }

        /* ── Pulsing call button ───────────────────────────── */
        @keyframes cl_pulse{0%,100%{box-shadow:0 0 0 0 rgba(144,216,144,.4);}
          50%{box-shadow:0 0 0 10px rgba(144,216,144,.0);}}
        .co-btn.call-active{animation:cl_pulse 2s ease-in-out infinite;}
      </style>

      <div id="__cl_chat">
        <div id="__cl_chat_hd">
          <span>💬 Chat</span>
          <button onclick="CommLayer.closeChat()">✕</button>
        </div>
        <div id="__cl_msgs"></div>
        <div id="__cl_irow">
          <input id="__cl_inp" placeholder="Schrijf iets..."
                 onkeydown="if(event.key==='Enter')CommLayer.sendChat()"/>
          <button id="__cl_send" onclick="CommLayer.sendChat()">↑</button>
        </div>
      </div>

      <div id="__cl_incoming">
        <div class="ri">📞</div>
        <h3>Partner belt</h3>
        <p>Wil je opnemen?</p>
        <div style="display:flex;gap:14px;">
          <button class="cl_ans" onclick="CommLayer.answerCall()">✓ Opnemen</button>
          <button class="cl_dec" onclick="CommLayer.declineCall()">✕ Afwijzen</button>
        </div>
      </div>

      <!-- Progress card backdrop (klik buiten = sluiten) -->
      <div id="__cl_prog_backdrop" onclick="CommLayer.closeProgress()"></div>

      <!-- Progress card -->
      <div id="__cl_progress">
        <button id="__cl_prog_close" onclick="CommLayer.closeProgress()">✕</button>
        <div class="cl-prog-title">Op weg naar bellen 📞</div>
        <div class="cl-prog-item">
          <div class="cl-prog-label">
            <span>🕐 Tijd samen</span>
            <span id="__cl_pt_val">0 / 10 min</span>
          </div>
          <div class="cl-prog-bar"><div id="__cl_pt_fill" class="cl-prog-fill"></div></div>
        </div>
        <div class="cl-prog-item">
          <div class="cl-prog-label">
            <span>💬 Berichten</span>
            <span id="__cl_pm_val">jij: 0 · p: 0 / 10</span>
          </div>
          <div class="cl-prog-bar"><div id="__cl_pm_fill" class="cl-prog-fill"></div></div>
        </div>
        <div class="cl-prog-item">
          <div class="cl-prog-label">
            <span>🌿 Ontdekking</span>
            <span id="__cl_pb_val">Nog niet</span>
          </div>
          <div class="cl-prog-bar"><div id="__cl_pb_fill" class="cl-prog-fill"></div></div>
        </div>
        <div id="__cl_pcd_item" class="cl-prog-item" style="display:none;">
          <div class="cl-prog-label">
            <span>⏳ Wachttijd</span>
            <span id="__cl_pcd_val">—</span>
          </div>
          <div class="cl-prog-bar"><div id="__cl_pcd_fill" class="cl-prog-fill" style="background:rgba(200,120,80,.7);"></div></div>
        </div>
        <div id="__cl_prog_ready" style="display:none;">
          Klaar! Ga naar ⚙️ Instellingen om bellen te activeren.
        </div>
      </div>

      <!-- Fireworks overlay -->
      <div id="__cl_fireworks">
        <div class="cl-fw-msg">
          <div class="cl-fw-ico">🎉</div>
        </div>
      </div>

      <div id="__cl_sett">
        <div id="__cl_sett_hd">
          <h3>⚙️ Instellingen</h3>
          <button onclick="CommLayer.closeSett()"
                  style="background:none;border:none;color:#6a7860;font-size:1.1rem;cursor:pointer;">✕</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <label style="display:flex;justify-content:space-between;align-items:center;color:#c8c0a8;font-size:.86rem;font-family:inherit;">
            <span>📞 Automatisch opnemen</span>
            <input type="checkbox" id="__cl_calling_toggle" onchange="CommLayer.setCallingPref(this.checked)"
                   style="width:18px;height:18px;cursor:pointer;accent-color:#c8a040;"/>
          </label>
          <div style="height:1px;background:rgba(255,255,255,.08);"></div>
          <p style="color:#6a7860;font-size:.76rem;font-style:italic;font-family:inherit;">Meer instellingen komen binnenkort</p>
          <div style="height:1px;background:rgba(255,255,255,.08);"></div>

          <!-- Calling unlock section (hidden until relevant) -->
          <div id="__cl_su_conds" style="display:none;">
            <p style="color:#c8c0a8;font-size:.82rem;font-family:inherit;">Jullie kunnen nu bellen.</p>
            <button onclick="CommLayer.askUnlock()"
                    style="margin-top:6px;background:rgba(100,180,100,.18);border:1.5px solid rgba(100,180,100,.5);
                           color:#90d890;border-radius:12px;padding:10px;font-size:.84rem;font-weight:600;
                           cursor:pointer;font-family:inherit;width:100%;">
              📞 Bellen inschakelen
            </button>
          </div>
          <div id="__cl_su_waiting" style="display:none;">
            <p style="color:#9ab080;font-size:.82rem;text-align:center;font-family:inherit;">⏳ Wachten op partner...</p>
          </div>
          <div id="__cl_su_asked" style="display:none;">
            <p style="color:#c8c0a8;font-size:.84rem;text-align:center;margin-bottom:10px;font-family:inherit;">Partner wil bellen. Jij ook?</p>
            <div style="display:flex;gap:8px;">
              <button onclick="CommLayer.answerUnlock('yes')"
                      style="flex:1;background:rgba(100,180,100,.18);border:1.5px solid rgba(100,180,100,.5);color:#90d890;
                             border-radius:12px;padding:10px;font-size:.9rem;font-weight:700;cursor:pointer;font-family:inherit;">✓ Ja</button>
              <button onclick="CommLayer.showNoReason()"
                      style="flex:1;background:rgba(200,80,80,.14);border:1.5px solid rgba(200,80,80,.4);color:#e07070;
                             border-radius:12px;padding:10px;font-size:.9rem;font-weight:700;cursor:pointer;font-family:inherit;">✗ Nee</button>
            </div>
          </div>
          <div id="__cl_su_no_reason" style="display:none;">
            <p style="color:#9ab080;font-size:.82rem;margin-bottom:6px;font-family:inherit;">Wil je iets zeggen? (optioneel)</p>
            <input id="__cl_no_inp" placeholder="..." onkeydown="if(event.key==='Enter')CommLayer.answerUnlock('no')"
                   style="width:100%;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);
                          border-radius:10px;padding:8px 12px;color:#f0e8d0;font-size:.84rem;outline:none;font-family:inherit;"/>
            <button onclick="CommLayer.answerUnlock('no')"
                    style="width:100%;margin-top:6px;background:rgba(200,80,80,.14);border:1.5px solid rgba(200,80,80,.4);
                           color:#e07070;border-radius:12px;padding:9px;font-size:.84rem;font-weight:600;cursor:pointer;font-family:inherit;">
              Nee bevestigen
            </button>
          </div>
          <div id="__cl_su_withdraw" style="display:none;">
            <p style="color:#9ab080;font-size:.82rem;margin-bottom:6px;font-family:inherit;">Je hebt nee gezegd. Vergissing?</p>
            <button onclick="CommLayer.withdrawNo()"
                    style="width:100%;background:rgba(100,180,100,.14);border:1.5px solid rgba(100,180,100,.4);color:#90d890;
                           border-radius:12px;padding:9px;font-size:.84rem;font-weight:600;cursor:pointer;font-family:inherit;">
              ↩ Nee terugtrekken
            </button>
          </div>
          <div id="__cl_su_unlocked" style="display:none;">
            <p style="color:#90d890;font-size:.82rem;text-align:center;margin-bottom:8px;font-family:inherit;">📞 Bellen is ingeschakeld</p>
            <button onclick="CommLayer.relockCall()"
                    style="width:100%;background:rgba(200,80,80,.1);border:1px solid rgba(200,80,80,.3);color:#e07070;
                           border-radius:12px;padding:9px;font-size:.82rem;cursor:pointer;font-family:inherit;">
              Bellen uitschakelen
            </button>
          </div>

          <div style="height:1px;background:rgba(255,255,255,.08);"></div>
          <button onclick="CommLayer.unpair()"
                  style="background:rgba(200,80,80,.14);border:1.5px solid rgba(200,80,80,.4);color:#e07070;
                         border-radius:12px;padding:10px;font-size:.84rem;font-weight:600;cursor:pointer;font-family:inherit;width:100%;">
            🔗 Ontkoppelen
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(div);
  }

  // ── Chat log
  function loadLog()  { try { return JSON.parse(localStorage.getItem(K.chatLog) || '[]'); } catch { return []; } }
  function saveLog(l) { try { localStorage.setItem(K.chatLog, JSON.stringify(l.slice(-80))); } catch {} }

  function renderChat() {
    const msgs = document.getElementById('__cl_msgs');
    if (!msgs) return;
    msgs.innerHTML = '';
    loadLog().forEach(m => addBubble(m.text, m.side, false));
    msgs.scrollTop = msgs.scrollHeight;
  }
  function addBubble(text, side, scroll = true) {
    const msgs = document.getElementById('__cl_msgs');
    if (!msgs) return;
    const b = document.createElement('div');
    b.className = 'cl_msg ' + side;
    b.textContent = text;
    msgs.appendChild(b);
    if (scroll) msgs.scrollTop = msgs.scrollHeight;
  }

  // ── Badge bijwerken (op alle knoppen met data-comm-chat)
  function updateBadge() {
    document.querySelectorAll('[data-comm-badge]').forEach(el => {
      el.textContent = C.unread > 0 ? (C.unread > 9 ? '9+' : C.unread) : '';
      el.style.display = C.unread > 0 ? 'inline' : 'none';
    });
  }

  // ── Belknop bijwerken (op alle knoppen met data-comm-call)
  function updateCallBtns() {
    document.querySelectorAll('[data-comm-call]').forEach(el => {
      if (C.ringing)            { el.textContent = '📲'; el.style.animation = 'cl_rng .5s ease-in-out infinite alternate'; }
      else if (C.inCall)        { el.textContent = '🔴'; el.style.animation = ''; }
      else if (CS.callUnlocked) { el.textContent = '📞'; el.style.animation = ''; }
      else                      { el.textContent = '📵'; el.style.animation = ''; } // locked
    });
    // Pulsing op de knop-wrapper als unlocked en niet in call
    document.querySelectorAll('[data-comm-call]').forEach(el => {
      const btn = el.closest('button');
      if (!btn) return;
      btn.classList.toggle('call-active', CS.callUnlocked && !C.inCall && !C.ringing);
    });
  }

  // ── Progress kaart ──────────────────────────────────────────
  function updateProgCard() {
    const timePct  = Math.min(100, (CS.sharedSeconds / 600) * 100);
    const myKey    = C.player === '1' ? 'p1' : 'p2';
    const themKey  = C.player === '1' ? 'p2' : 'p1';
    const myMsg    = CS.messages[myKey]  || 0;
    const themMsg  = CS.messages[themKey] || 0;
    const msgPct   = Math.min(100, (Math.min(myMsg, themMsg) / 10) * 100);
    const minLeft  = Math.max(0, Math.ceil((600 - CS.sharedSeconds) / 60));

    const el = (id) => document.getElementById(id);
    if (!el('__cl_pt_fill')) return;

    el('__cl_pt_fill').style.width = timePct + '%';
    el('__cl_pt_fill').classList.toggle('done', timePct >= 100);
    el('__cl_pt_val').textContent  = timePct >= 100 ? '✓ 10 min' : Math.floor(CS.sharedSeconds / 60) + ' / 10 min';

    el('__cl_pm_fill').style.width = msgPct + '%';
    el('__cl_pm_fill').classList.toggle('done', msgPct >= 100);
    el('__cl_pm_val').textContent  = msgPct >= 100 ? '✓ Genoeg' : 'jij: ' + myMsg + ' · p: ' + themMsg + ' / 10';

    const bCount = CS.boardsCompleted || 0;
    const bPct   = Math.min(100, (bCount / 2) * 100);
    el('__cl_pb_fill').style.width = bPct + '%';
    el('__cl_pb_fill').classList.toggle('done', bPct >= 100);
    el('__cl_pb_val').textContent  = bPct >= 100 ? '✓ 2 gedaan' : bCount + ' / 2 spellen';

    // Cooldown item (alleen voor asker)
    const cdActive = CS.showCooldown && CS.cooldownUntil && CS.cooldownUntil > Date.now();
    el('__cl_pcd_item').style.display = cdActive ? 'block' : 'none';
    if (cdActive) {
      clearInterval(cdInterval);
      cdInterval = setInterval(() => {
        const rem = Math.max(0, CS.cooldownUntil - Date.now());
        const mins = Math.ceil(rem / 60000);
        const pct  = Math.max(0, 100 - (rem / (30 * 60000)) * 100);
        const v = document.getElementById('__cl_pcd_val');
        const f = document.getElementById('__cl_pcd_fill');
        if (v) v.textContent = mins > 0 ? mins + ' min' : 'Bijna...';
        if (f) f.style.width = pct + '%';
        if (rem <= 0) { clearInterval(cdInterval); updateSettBadge(); updateProgCard(); }
      }, 15000);
      // Initial render
      const rem = Math.max(0, CS.cooldownUntil - Date.now());
      const mins = Math.ceil(rem / 60000);
      el('__cl_pcd_val').textContent = mins + ' min';
      el('__cl_pcd_fill').style.width = Math.max(0, 100 - (rem / (30*60000))*100) + '%';
    } else { clearInterval(cdInterval); }

    el('__cl_prog_ready').style.display =
      (CS.conditionsMet && !CS.callUnlocked && !cdActive && !CS.asker) ? 'block' : 'none';
  }

  // ── Settings unlock sectie ──────────────────────────────────
  function updateSettUnlock() {
    const show = (id, visible) => {
      const el = document.getElementById(id);
      if (el) el.style.display = visible ? 'block' : 'none';
    };
    const myKey = C.player === '1' ? 'p1' : 'p2';
    const meConsent = CS.consent[myKey];
    const isAsker   = CS.asker === C.player;
    const cdActive  = CS.showCooldown && CS.cooldownUntil && CS.cooldownUntil > Date.now();
    const iSaidNo   = meConsent === 'no' || (CS.cooldownAsker && CS.cooldownAsker !== C.player && !CS.callUnlocked && !CS.asker && CS.cooldownUntil);

    show('__cl_su_unlocked',   CS.callUnlocked);
    show('__cl_su_conds',      !CS.callUnlocked && CS.conditionsMet && !CS.asker && !cdActive && !iSaidNo);
    show('__cl_su_waiting',    !CS.callUnlocked && isAsker && CS.asker && meConsent === 'yes');
    show('__cl_su_asked',      !CS.callUnlocked && !isAsker && CS.asker && meConsent === null);
    show('__cl_su_no_reason',  false); // only shown on demand
    show('__cl_su_withdraw',   !CS.callUnlocked && iSaidNo);
  }

  // ── Settings badge ──────────────────────────────────────────
  function updateSettBadge() {
    const cdJustExpired = CS.showCooldown && CS.cooldownUntil && CS.cooldownUntil <= Date.now();
    const showBadge = cdJustExpired || (CS.conditionsMet && !CS.callUnlocked && !CS.asker && !CS.showCooldown);
    document.querySelectorAll('[data-comm-sett-badge]').forEach(el => {
      el.style.display = showBadge ? 'inline' : 'none';
    });
  }

  // ── Vuurwerk ────────────────────────────────────────────────
  function showFireworks() {
    const fw = document.getElementById('__cl_fireworks');
    if (!fw) return;
    fw.classList.add('show');
    const colors = ['#e8c060','#90d890','#60c0d8','#e07070','#c080e0','#f0e040'];
    for (let i = 0; i < 50; i++) {
      const p = document.createElement('div');
      p.className = 'cl-particle';
      const angle = (Math.random() * 360) * Math.PI / 180;
      const dist  = 80 + Math.random() * 160;
      p.style.cssText = `
        left:50%;top:50%;
        background:${colors[Math.floor(Math.random()*colors.length)]};
        --tx:${Math.cos(angle)*dist}px;
        --ty:${Math.sin(angle)*dist}px;
        animation-delay:${Math.random()*0.4}s;
        animation-duration:${0.9+Math.random()*0.6}s;
      `;
      fw.appendChild(p);
    }
    setTimeout(() => { fw.classList.remove('show'); fw.querySelectorAll('.cl-particle').forEach(p=>p.remove()); }, 2200);
  }

  // ── WebRTC
  function initPc() {
    C.pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    if (C.stream) C.stream.getTracks().forEach(t => C.pc.addTrack(t, C.stream));
    C.pc.onicecandidate = ({ candidate }) => {
      if (candidate && C.code && window._commSocket)
        window._commSocket.emit('webrtc_ice', { code: C.code, candidate });
    };
    C.pc.ontrack = ({ streams }) => {
      let a = document.getElementById('__cl_audio');
      if (!a) { a = document.createElement('audio'); a.id = '__cl_audio'; a.autoplay = true; document.body.appendChild(a); }
      a.srcObject = streams[0];
    };
    C.pc.onconnectionstatechange = () => {
      if (['disconnected','failed','closed'].includes(C.pc?.connectionState)) {
        C.inCall = false; localStorage.setItem(K.call, 'false'); updateCallBtns();
      }
    };
  }

  async function startCall() {
    try {
      C.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      initPc();
      if (C.player === '1') {
        const offer = await C.pc.createOffer();
        await C.pc.setLocalDescription(offer);
        window._commSocket?.emit('webrtc_offer', { code: C.code, offer });
      }
      C.inCall = true; localStorage.setItem(K.call, 'true'); updateCallBtns();
    } catch (e) { console.warn('[CommLayer] mic:', e.message); }
  }

  function stopCall() {
    if (C.stream) C.stream.getTracks().forEach(t => t.stop());
    if (C.pc) { C.pc.close(); C.pc = null; }
    C.stream = null; C.inCall = false; localStorage.setItem(K.call, 'false');
    const a = document.getElementById('__cl_audio');
    if (a) a.srcObject = null;
    updateCallBtns();
  }

  // ── Eigen socket voor globale comm (los van KoppelClient) ──
  function connectKoppel() {
    if (!C.code || C.koppelReady) return;

    function go() {
      if (!window.KOPPEL_BACKEND_URL) {
        window.KOPPEL_BACKEND_URL =
          (window.location.hostname === 'localhost' || window.location.hostname.startsWith('192.168.')
            ? 'http://' + window.location.hostname + ':3000'
            : 'https://snakesandladdders-production.up.railway.app');
      }
      const BACKEND_URL = window.KOPPEL_BACKEND_URL;
      const sock = io(BACKEND_URL, {
        transports: ['polling', 'websocket'], // polling-eerst — Railway-compatibel
        upgrade: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1500,
        timeout: 20000,
      });
      window._commSocket = sock;

      sock.on('connect', () => {
        // Doe join_session met de globale code (alleen om in de room te zitten)
        sock.emit('join_or_create', { code: C.code, app: 'comm' });
        // koppelReady wordt gezet na server bevestiging (session_created/joined)

        sock.on('webrtc_offer', async ({ offer }) => {
          if (!C.inCall && C.callingPref) {
            C.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }).catch(() => null);
            if (!C.stream) return;
            initPc();
            await C.pc.setRemoteDescription(offer);
            const answer = await C.pc.createAnswer();
            await C.pc.setLocalDescription(answer);
            sock.emit('webrtc_answer', { code: C.code, answer });
            C.inCall = true; localStorage.setItem(K.call, 'true'); updateCallBtns();
          } else if (!C.inCall) {
            C.ringing = true; C._pendingOffer = offer;
            updateCallBtns(); playRing();
            document.getElementById('__cl_incoming')?.classList.add('show');
          } else {
            if (!C.pc) initPc();
            await C.pc.setRemoteDescription(offer);
            const answer = await C.pc.createAnswer();
            await C.pc.setLocalDescription(answer);
            sock.emit('webrtc_answer', { code: C.code, answer });
          }
        });
        sock.on('webrtc_answer', async ({ answer }) => { if (C.pc) await C.pc.setRemoteDescription(answer).catch(() => {}); });
        sock.on('webrtc_ice',    async ({ candidate }) => { if (C.pc) await C.pc.addIceCandidate(candidate).catch(() => {}); });
        sock.on('call_state_update', (state) => {
          Object.assign(CS, state);
          updateProgCard();
          updateSettUnlock();
          updateCallBtns();
          // Badge op settings cog als cooldown voorbij + conditions met
          updateSettBadge();
        });
        sock.on('call_unlocked_celebration', () => showFireworks());

        // Zet koppelReady zodra server bevestigt dat we in de room zitten
        sock.on('session_created', () => { C.koppelReady = true; });
        sock.on('session_joined',  () => { C.koppelReady = true; });

        sock.on('chat_message', ({ player, text }) => {
          // Game invite relay — special prefix __GAME__:key:name
          // Backend uses socket.to() so this only arrives at the partner — no player check needed
          if (typeof text === 'string' && text.startsWith('__GAME__:')) {
            console.log('[CommLayer] game invite received:', text);
            const parts = text.split(':');
            const gameKey  = parts[1] || '';
            const gameName = parts[2] || gameKey;
            const cbs = window.__gameInviteCbs || [];
            console.log('[CommLayer] calling', cbs.length, 'invite callbacks');
            cbs.forEach(fn => { try { fn({ game: gameKey, name: gameName }); } catch(e){ console.error('[CommLayer] invite cb error', e); } });
            return; // never show in chat UI
          }
          const side = player === C.player ? 'me' : 'them';
          const log = loadLog(); log.push({ text, side }); saveLog(log);
          addBubble(text, side);
          if (!C.chatOpen && side === 'them') {
            C.unread++; localStorage.setItem(K.unread, C.unread); updateBadge();
          }
          // Notify board-level chat listeners
          (window.__commChatCbs || []).forEach(fn => { try { fn({ player, text, side }); } catch(e){} });
        });

        if (C.callActive && !C.inCall) startCall();
      });
    }

    if (window.io) { go(); }
    else {
      const s = document.createElement('script');
      s.src = 'https://cdn.socket.io/4.7.5/socket.io.min.js';
      s.onload = go;
      document.head.appendChild(s);
    }
  }

  // ── Init
  function init() {
    injectPanels();
    updateBadge();
    updateCallBtns();
    if (C.code) connectKoppel();
  }

  // ── Publieke API
  window.CommLayer = {
    setSession(code, player) {
      // Never save game sub-codes (e.g. ABCD.L) as comm_code — only base codes
      if (code && code.includes('.')) return;
      C.code = code; C.player = player;
      localStorage.setItem(K.code, code);
      localStorage.setItem(K.player, player);
      setTimeout(connectKoppel, 100);
    },
    toggleChat() {
      C.chatOpen = !C.chatOpen;
      document.getElementById('__cl_chat')?.classList.toggle('open', C.chatOpen);
      if (C.settOpen) this.closeSett();
      if (C.progOpen) this.closeProgress();
      if (C.chatOpen) {
        C.unread = 0; localStorage.setItem(K.unread, '0'); updateBadge();
        renderChat();
        setTimeout(() => document.getElementById('__cl_inp')?.focus(), 60);
      }
    },
    closeChat()  { C.chatOpen = false;  document.getElementById('__cl_chat')?.classList.remove('open'); },
    toggleSett() {
      C.settOpen = !C.settOpen;
      document.getElementById('__cl_sett')?.classList.toggle('open', C.settOpen);
      if (C.chatOpen) this.closeChat();
      if (C.progOpen) this.closeProgress();
      if (C.settOpen) {
        const cb = document.getElementById('__cl_calling_toggle');
        if (cb) cb.checked = C.callingPref;
        updateSettUnlock();
        updateSettBadge();
      }
    },
    closeSett()  { C.settOpen = false;  document.getElementById('__cl_sett')?.classList.remove('open'); },
    toggleCall() {
      if (C.ringing) { this.answerCall(); return; }
      if (!CS.callUnlocked && !CS.callActive) {
        // Bellen nog niet ontgrendeld: toon progress card
        C.progOpen = !C.progOpen;
        document.getElementById('__cl_progress')?.classList.toggle('open', C.progOpen);
        document.getElementById('__cl_prog_backdrop')?.classList.toggle('open', C.progOpen);
        if (C.progOpen) updateProgCard();
        return;
      }
      if (C.inCall) stopCall(); else startCall();
    },
    closeProgress() {
      C.progOpen = false;
      document.getElementById('__cl_progress')?.classList.remove('open');
      document.getElementById('__cl_prog_backdrop')?.classList.remove('open');
    },
    answerCall() {
      stopRing();
      document.getElementById('__cl_incoming')?.classList.remove('show');
      if (!C._pendingOffer) return;
      navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then(async stream => {
        C.stream = stream; initPc();
        await C.pc.setRemoteDescription(C._pendingOffer);
        const answer = await C.pc.createAnswer();
        await C.pc.setLocalDescription(answer);
        window._commSocket?.emit('webrtc_answer', { code: C.code, answer });
        C.inCall = true; localStorage.setItem(K.call, 'true'); updateCallBtns();
        C._pendingOffer = null; C.ringing = false;
      }).catch(() => {});
    },
    declineCall() {
      stopRing(); C.ringing = false; C._pendingOffer = null;
      document.getElementById('__cl_incoming')?.classList.remove('show');
      updateCallBtns();
    },
    sendChat(text) {
      const inp = document.getElementById('__cl_inp');
      const msg = text || inp?.value.trim() || '';
      if (!msg) return;
      if (inp) inp.value = '';
      const log = loadLog(); log.push({ text: msg, side: 'me' }); saveLog(log);
      addBubble(msg, 'me');
      window._commSocket?.emit('chat_message', { code: C.code, player: C.player, text: msg });
    },
    getUnread() { return C.unread; },
    isInCall()  { return C.inCall; },

    // ── Calling unlock API ────────────────────────────────────
    askUnlock() {
      window._commSocket?.emit('call_unlock_ask', { code: C.code });
    },
    answerUnlock(answer) {
      const reason = answer === 'no' ? (document.getElementById('__cl_no_inp')?.value || '') : '';
      window._commSocket?.emit('call_unlock_answer', { code: C.code, answer, reason });
      document.getElementById('__cl_su_no_reason').style.display = 'none';
    },
    showNoReason() {
      document.getElementById('__cl_su_asked').style.display   = 'none';
      document.getElementById('__cl_su_no_reason').style.display = 'block';
      setTimeout(() => document.getElementById('__cl_no_inp')?.focus(), 60);
    },
    withdrawNo() {
      window._commSocket?.emit('call_withdraw_no', { code: C.code });
    },
    relockCall() {
      window._commSocket?.emit('call_relock', { code: C.code });
    },

    // ── Board chat via global socket ──────────────────────────
    sendBoardChat(text) {
      if (!text || !text.trim() || !C.code) return;
      window._commSocket?.emit('chat_message', { code: C.code, player: C.player, text: text.trim() });
    },
    onChatMessage(fn) {
      window.__commChatCbs = window.__commChatCbs || [];
      // Avoid duplicates on page re-load
      window.__commChatCbs = window.__commChatCbs.filter(f => f !== fn);
      window.__commChatCbs.push(fn);
    },

    // ── Game invite systeem (via chat_message relay) ──────────
    announceGame(gameKey, gameName) {
      const msg = '__GAME__:' + gameKey + ':' + gameName;
      const send = () => {
        if (!C.koppelReady || !window._commSocket?.connected) return false;
        window._commSocket.emit('chat_message', {
          code: C.code, player: C.player, text: msg, ts: Date.now()
        });
        console.log('[CommLayer] announceGame sent:', msg);
        return true;
      };
      // Make sure connectKoppel has been called (may not be if called before DOMContentLoaded)
      if (!C.koppelReady) connectKoppel();
      if (!send()) {
        const iv = setInterval(() => { if (send()) clearInterval(iv); }, 400);
        setTimeout(() => clearInterval(iv), 20000);
      }
    },
    onGameInvite(fn) {
      window.__gameInviteCbs = window.__gameInviteCbs || [];
      // Prevent duplicate registrations
      if (!window.__gameInviteCbs.includes(fn)) window.__gameInviteCbs.push(fn);
    },

    setCallingPref(val) {
      C.callingPref = !!val;
      localStorage.setItem(K.calling, val ? 'true' : 'false');
    },
    unpair() {
      stopCall();
      if (window._commSocket) { try { window._commSocket.disconnect(); } catch(e){} }
      C.code = null; C.koppelReady = false; C.inCall = false;
      [K.code, K.player, K.call, K.chatLog, K.unread, 'comm_admin'].forEach(k => localStorage.removeItem(k));
      window.location.href = 'world.html';
    },
  };

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', init);
  else init();
})();
