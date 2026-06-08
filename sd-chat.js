/**
 * sd-chat.js — Slow Dating unified chat widget
 *
 * Gebruik in elk spel:
 *   <script src="sd-chat.js"></script>
 *
 * Optioneel label overschrijven:
 *   <script>window.SD_CHAT_LABEL = 'Praat verder';</script>
 *   (vóór sd-chat.js laden)
 *
 * Verwijdert eigen chat HTML/CSS/JS per spel. Één consistent onderdeel.
 */
(function () {
  if (window._sdChatLoaded) return;
  window._sdChatLoaded = true;

  // ── Stijlen ────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    #sd-chat-widget {
      position: fixed;
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
      width: min(480px, 100vw);
      z-index: 900;
      font-family: inherit;
    }
    #sd-chat-toggle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 16px;
      background: rgba(20, 10, 40, 0.92);
      border-top: 1px solid rgba(255,255,255,0.10);
      cursor: pointer;
      user-select: none;
      backdrop-filter: blur(8px);
    }
    #sd-chat-toggle:hover { background: rgba(30, 15, 55, 0.95); }
    #sd-chat-toggle-label {
      font-size: 0.82rem;
      color: #d4af37;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    #sd-chat-badge {
      display: none;
      background: #e07070;
      color: #fff;
      border-radius: 10px;
      padding: 1px 7px;
      font-size: 0.65rem;
      font-weight: bold;
      line-height: 1.4;
    }
    #sd-chat-arrow {
      font-size: 0.75rem;
      color: #9080a8;
      transition: transform 0.2s;
    }
    #sd-chat-panel {
      display: none;
      flex-direction: column;
      background: rgba(20, 10, 40, 0.96);
      border-top: 1px solid rgba(255,255,255,0.08);
      backdrop-filter: blur(8px);
    }
    #sd-chat-panel.open { display: flex; }
    #sd-chat-messages {
      height: 180px;
      overflow-y: auto;
      padding: 10px 14px 4px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      scroll-behavior: smooth;
    }
    #sd-chat-messages::-webkit-scrollbar { width: 3px; }
    #sd-chat-messages::-webkit-scrollbar-thumb { background: rgba(212,175,55,.3); border-radius: 2px; }
    #sd-chat-messages:empty::before {
      content: 'Nog geen berichten…';
      color: rgba(255,255,255,.25);
      font-size: 0.8rem;
      align-self: center;
      margin-top: 60px;
    }
    .sd-chat-msg {
      max-width: 80%;
      padding: 7px 12px;
      border-radius: 14px;
      font-size: 0.84rem;
      line-height: 1.4;
      word-break: break-word;
    }
    .sd-chat-msg.me {
      background: rgba(212,175,55,0.18);
      color: #f0d060;
      align-self: flex-end;
      border-bottom-right-radius: 4px;
    }
    .sd-chat-msg.them {
      background: rgba(255,255,255,0.09);
      color: #d8d0ee;
      align-self: flex-start;
      border-bottom-left-radius: 4px;
    }
    #sd-chat-input-row {
      display: flex;
      gap: 8px;
      padding: 8px 12px 12px;
      border-top: 1px solid rgba(255,255,255,0.06);
    }
    #sd-chat-input {
      flex: 1;
      background: rgba(255,255,255,0.07);
      border: 1px solid rgba(255,255,255,0.14);
      border-radius: 20px;
      color: #fff;
      font-size: 0.84rem;
      padding: 8px 14px;
      outline: none;
      font-family: inherit;
    }
    #sd-chat-input::placeholder { color: rgba(255,255,255,.3); }
    #sd-chat-input:focus { border-color: rgba(212,175,55,.5); }
    #sd-chat-send {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: none;
      background: #d4af37;
      color: #1a0a2e;
      font-size: 1rem;
      cursor: pointer;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform .15s;
    }
    #sd-chat-send:hover { transform: scale(1.08); }
    #sd-chat-typing {
      display: none;
      font-size: 0.72rem;
      color: rgba(212,175,55,.6);
      padding: 2px 14px 4px;
      height: 16px;
    }
  `;
  document.head.appendChild(style);

  // ── HTML ───────────────────────────────────────────────────────────────────
  const label = window.SD_CHAT_LABEL || 'Chat';
  const widget = document.createElement('div');
  widget.id = 'sd-chat-widget';
  widget.innerHTML = `
    <div id="sd-chat-toggle">
      <span id="sd-chat-toggle-label">
        💬 ${label}
        <span id="sd-chat-badge"></span>
      </span>
      <span id="sd-chat-arrow">▲ open</span>
    </div>
    <div id="sd-chat-panel">
      <div id="sd-chat-messages"></div>
      <div id="sd-chat-typing">… typt</div>
      <div id="sd-chat-input-row">
        <input id="sd-chat-input" type="text" placeholder="Schrijf iets…"
               autocomplete="off"
               onkeydown="if(event.key==='Enter')window._sdChatSend()"/>
        <button id="sd-chat-send" onclick="window._sdChatSend()">↑</button>
      </div>
    </div>
  `;
  // Voeg toe zodra DOM klaar is
  function mount() { document.body.appendChild(widget); }
  if (document.body) { mount(); } else { document.addEventListener('DOMContentLoaded', mount); }

  // ── State ──────────────────────────────────────────────────────────────────
  let _open = false;
  let _unread = 0;
  let _typingTimer = null;

  // ── Toggle ─────────────────────────────────────────────────────────────────
  document.addEventListener('click', function(e) {
    if (e.target.closest('#sd-chat-toggle')) sdChatToggle();
  });

  function sdChatToggle() {
    _open = !_open;
    document.getElementById('sd-chat-panel').classList.toggle('open', _open);
    document.getElementById('sd-chat-arrow').textContent = _open ? '▼ sluit' : '▲ open';
    if (_open) {
      _unread = 0;
      _setBadge(0);
      setTimeout(() => document.getElementById('sd-chat-input').focus(), 50);
    }
  }
  window._sdChatToggle = sdChatToggle;

  // ── Bericht toevoegen ──────────────────────────────────────────────────────
  function _addMsg(text, side) {
    const msgs = document.getElementById('sd-chat-messages');
    const el = document.createElement('div');
    el.className = 'sd-chat-msg ' + side;
    el.textContent = text;
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;
  }

  // ── Badge ──────────────────────────────────────────────────────────────────
  function _setBadge(n) {
    const b = document.getElementById('sd-chat-badge');
    if (!b) return;
    if (n <= 0) { b.style.display = 'none'; b.textContent = ''; }
    else { b.textContent = n > 9 ? '9+' : n; b.style.display = 'inline'; }
  }

  // ── Typing indicator ───────────────────────────────────────────────────────
  function _showTyping() {
    const t = document.getElementById('sd-chat-typing');
    if (!t) return;
    t.style.display = 'block';
    clearTimeout(_typingTimer);
    _typingTimer = setTimeout(() => { t.style.display = 'none'; }, 2500);
  }

  // ── Verzenden ──────────────────────────────────────────────────────────────
  window._sdChatSend = function () {
    const input = document.getElementById('sd-chat-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    _addMsg(text, 'me');
    window.CommLayer?.sendBoardChat(text);
  };

  // ── Ontvangen via CommLayer ────────────────────────────────────────────────
  // Wacht tot CommLayer beschikbaar is (kan async laden)
  function _hookCommLayer() {
    if (window.CommLayer) {
      window.CommLayer.onChatMessage(function ({ text, side }) {
        if (side !== 'them') return;
        _addMsg(text, 'them');
        if (!_open) { _unread++; _setBadge(_unread); }
      });
      if (window.CommLayer.onTyping) {
        window.CommLayer.onTyping(function () { _showTyping(); });
      }
    } else {
      setTimeout(_hookCommLayer, 300);
    }
  }
  _hookCommLayer();

})();
