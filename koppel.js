/**
 * koppel.js — Sync client voor KleurKompas & Kernkwadranten
 * Verbindt via Socket.io met de Railway backend.
 * Gebruik:
 *   KoppelClient.create(app)       → maak nieuwe sessie
 *   KoppelClient.join(code, app)   → sluit aan bij bestaande sessie
 *   KoppelClient.done(data)        → stuur je resultaten op
 *   KoppelClient.onBothConnected   → callback als beide klaar zijn
 *   KoppelClient.onComplete        → callback als beide klaar met invullen
 */

if (!window.KOPPEL_BACKEND_URL) {
  window.KOPPEL_BACKEND_URL =
    (window.location.hostname === 'localhost' || window.location.hostname.startsWith('192.168.')
      ? 'http://' + window.location.hostname + ':3000'
      : 'https://snakesandladdders-production.up.railway.app');
}
const BACKEND_URL = window.KOPPEL_BACKEND_URL;

const KoppelClient = (() => {
  let socket = null;
  let _code = null;
  let _player = null;
  let _app = null;
  let _callbacks = {};

  function on(event, fn) { _callbacks[event] = fn; }
  function emit(event, data) { if (_callbacks[event]) _callbacks[event](data); }

  function connect(afterConnect) {
    if (socket && socket.connected) { afterConnect && afterConnect(); return; }
    // Load socket.io from CDN if not already loaded
    if (!window.io) {
      const s = document.createElement('script');
      s.src = 'https://cdn.socket.io/4.7.5/socket.io.min.js';
      s.onload = () => { _connect(afterConnect); };
      document.head.appendChild(s);
    } else {
      _connect(afterConnect);
    }
  }

  function _connect(afterConnect) {
    socket = io(BACKEND_URL, { transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
      console.log('[koppel] Connected to backend');
      afterConnect && afterConnect();
    });

    socket.on('session_created', ({ code, player, app }) => {
      _code = code; _player = player; _app = app;
      localStorage.setItem('koppel_code', code);
      localStorage.setItem('koppel_player', player);
      emit('session_created', { code, player });
    });

    socket.on('session_joined', ({ code, player, app, state }) => {
      _code = code; _player = player; _app = app;
      localStorage.setItem('koppel_code', code);
      localStorage.setItem('koppel_player', player);
      emit('session_joined', { code, player, state });
    });

    socket.on('session_error', ({ message }) => {
      emit('error', { message });
    });

    socket.on('both_connected', () => {
      emit('both_connected', { code: _code, player: _player });
    });

    socket.on('player_count', ({ count }) => {
      emit('player_count', { count });
    });

    socket.on('session_update', ({ state }) => {
      emit('session_update', { state });
    });

    socket.on('session_complete', ({ state }) => {
      emit('complete', { state });
    });

    socket.on('partner_progress', ({ player, progress }) => {
      emit('partner_progress', { player, progress });
    });

    socket.on('partner_disconnected', ({ player }) => {
      emit('partner_disconnected', { player });
    });

    socket.on('session_reset', () => {
      emit('reset', {});
    });

    socket.on('chat_message', ({ player, text, ts }) => {
      emit('chat_message', { player, text, ts });
    });

    socket.on('typing', () => {
      emit('typing', {});
    });

    socket.on('webrtc_offer',  ({ offer })     => emit('webrtc_offer',  { offer }));
    socket.on('webrtc_answer', ({ answer })    => emit('webrtc_answer', { answer }));
    socket.on('webrtc_ice',    ({ candidate }) => emit('webrtc_ice',    { candidate }));

    socket.on('disconnect', () => {
      emit('disconnected', {});
    });
  }

  // ── Public API ────────────────────────────────────────────

  function create(appName) {
    _app = appName;
    connect(() => {
      socket.emit('create_session', { app: appName });
    });
  }

  function join(code, appName) {
    _app = appName;
    connect(() => {
      socket.emit('join_session', { code: code.toUpperCase().trim() });
    });
  }

  // Maak sessie aan als die niet bestaat, of join als die al bestaat
  function joinOrCreate(code, appName) {
    _app = appName;
    connect(() => {
      socket.emit('join_or_create', { code: code.toUpperCase().trim(), app: appName });
    });
  }

  function done(data) {
    if (!socket || !_code) return;
    socket.emit('player_done', { code: _code, player: _player, data });
  }

  function progress(data) {
    if (!socket || !_code) return;
    socket.emit('player_progress', { code: _code, player: _player, progress: data });
  }

  function reset() {
    if (!socket || !_code) return;
    socket.emit('reset_session', { code: _code });
  }

  function leave() {
    if (socket) socket.disconnect();
    socket = null; _code = null; _player = null;
    localStorage.removeItem('koppel_code');
    localStorage.removeItem('koppel_player');
  }

  function chat(text) {
    if (!socket || !_code) return;
    socket.emit('chat_message', { code: _code, player: _player, text, ts: Date.now() });
  }

  function sendTyping() {
    if (!socket || !_code) return;
    socket.emit('typing', { code: _code });
  }

  function getCode()   { return _code; }
  function getPlayer() { return _player; }
  function isActive()  { return !!socket && socket.connected && !!_code; }

  return { connect, create, join, joinOrCreate, done, progress, reset, leave, on, chat, sendTyping, getCode, getPlayer, isActive,
           get _socket() { return socket; } };
})();
