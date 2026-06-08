/**
 * sd-client.js — Slow Dating connection client
 * Replaces koppel.js. One socket, one module, no race conditions.
 *
 * Usage in games:
 *   SDClient.joinOrCreate(code + '.L', 'lach_samen');
 *   SDClient.on('both_connected', () => startGame());
 *   SDClient.announceGame('lach_samen', 'Lach Samen');
 *
 * Usage in world.html:
 *   SDClient.onGameInvite(({ game, name }) => showPopup(game, name));
 */

const SDClient = window.SDClient || (() => {
  // ── Backend URL (auto-detect local vs production) ──────────
  const BACKEND = (() => {
    const h = window.location.hostname;
    if (h === 'localhost' || h.match(/^192\.168\./)) return 'http://' + h + ':3000';
    return 'https://snakesandladdders-production.up.railway.app';
  })();

  // ── State ──────────────────────────────────────────────────
  let _socket = null;
  let _code   = null;
  let _player = null;
  const _cbs  = {};          // event callbacks for games
  const _inviteCbs = [];     // game invite callbacks (world.html)

  // ── Internal helpers ───────────────────────────────────────
  function _fire(ev, data) {
    (_cbs[ev] || []).forEach(fn => { try { fn(data); } catch(e) { console.error('[SD] cb error', ev, e); } });
  }

  function _loadIO(cb) {
    if (window.io) { cb(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.socket.io/4.7.5/socket.io.min.js';
    s.onload = cb;
    document.head.appendChild(s);
  }

  function _connect(cb) {
    if (_socket && _socket.connected) { cb(); return; }

    _loadIO(() => {
      // If socket exists but not connected yet, wait for it
      if (_socket) { _socket.once('connect', cb); return; }

      console.log('[SD] connecting to', BACKEND);
      _socket = io(BACKEND, { transports: ['websocket', 'polling'] });
      window._sdSocket = _socket;   // expose for debugging

      _socket.once('connect', () => {
        console.log('[SD] connected', _socket.id);
        cb();
      });

      // ── Session events ───────────────────────────────────
      _socket.on('session_created', ({ code, player, app, state }) => {
        _code = code; _player = player;
        console.log('[SD] session_created', code, 'player', player);
        _fire('session_created', { code, player, app, state });
      });

      _socket.on('session_joined', ({ code, player, app, state }) => {
        _code = code; _player = player;
        console.log('[SD] session_joined', code, 'player', player);
        _fire('session_joined', { code, player, app, state });
      });

      _socket.on('both_connected', data => {
        console.log('[SD] both_connected', data);
        _fire('both_connected', data);
      });

      _socket.on('session_error', ({ message }) => {
        console.warn('[SD] session_error', message);
        _fire('error', { message });
      });

      _socket.on('player_count',    d => _fire('player_count', d));
      _socket.on('session_update',  d => _fire('session_update', d));
      _socket.on('session_complete', d => { _fire('session_complete', d); _fire('complete', d); });
      _socket.on('partner_progress', d => _fire('partner_progress', d));
      _socket.on('reset',           d => _fire('reset', d));
      _socket.on('chat_message',    d => _fire('chat_message', d));
      _socket.on('typing',          d => _fire('typing', d));
      _socket.on('webrtc_offer',    d => _fire('webrtc_offer', d));
      _socket.on('webrtc_answer',   d => _fire('webrtc_answer', d));
      _socket.on('webrtc_ice',      d => _fire('webrtc_ice', d));
      _socket.on('disconnect',      () => _fire('disconnected', {}));

      // ── Game invite (from partner opening a game) ────────
      _socket.on('game_invite', ({ gameKey, gameName }) => {
        console.log('[SD] game_invite received:', gameKey, gameName);
        _inviteCbs.forEach(fn => { try { fn({ game: gameKey, name: gameName }); } catch(e) {} });
      });
    });
  }

  // ── Public API ─────────────────────────────────────────────
  const API = {
    // Register callback for any socket event
    on(ev, fn) {
      _cbs[ev] = _cbs[ev] || [];
      _cbs[ev].push(fn);
    },

    // Create a new pairing session (world.html)
    create(app) {
      _connect(() => _socket.emit('create_session', { app: app || 'global' }));
    },

    // Join existing pairing session by code (world.html)
    join(code, app) {
      _connect(() => _socket.emit('join_session', { code: code.toUpperCase().trim() }));
    },

    // Join or create a session (games use this)
    joinOrCreate(code, app) {
      _connect(() => {
        console.log('[SD] joinOrCreate', code);
        _socket.emit('join_or_create', { code: code.toUpperCase().trim(), app: app || 'global' });
      });
    },

    // Announce to partner that you opened a game
    // Works via direct socket.to() relay — no session needed on backend
    announceGame(gameKey, gameName) {
      const comm = localStorage.getItem('comm_code');
      if (!comm || comm === '1111') return;
      console.log('[SD] announceGame', gameKey);
      _connect(() => {
        _socket.emit('announce_game', { code: comm.toUpperCase().trim(), gameKey, gameName });
      });
    },

    // Register callback for when partner opens a game (world.html)
    onGameInvite(fn) {
      if (!_inviteCbs.includes(fn)) _inviteCbs.push(fn);
      // Also start listening (connect if not yet connected)
      const comm = localStorage.getItem('comm_code');
      if (comm && comm !== '1111') {
        _connect(() => {
          // Join comm room so we receive game_invite events
          _socket.emit('join_comm', { code: comm.toUpperCase().trim() });
        });
      }
    },

    // Send player result data
    done(data) {
      if (_code && _player && _socket) {
        _socket.emit('player_done', { code: _code, player: _player, data });
      }
    },

    // Send incremental progress
    progress(data) {
      if (_code && _player && _socket) {
        _socket.emit('player_progress', { code: _code, player: _player, progress: data });
      }
    },

    // Chat
    chat(text) {
      if (_code && _player && _socket) {
        _socket.emit('chat_message', { code: _code, player: _player, text, ts: Date.now() });
      }
    },

    sendTyping() {
      if (_code && _socket) _socket.emit('typing', { code: _code });
    },

    reset() {
      if (_code && _socket) _socket.emit('reset_session', { code: _code });
    },

    // Accessors
    getCode:   () => _code,
    getPlayer: () => _player,
    isActive:  () => !!(  _socket && _socket.connected),
  };

  return API;
})();

window.KoppelClient = SDClient;
window.SDClient     = SDClient;
