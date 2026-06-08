/**
 * config.js — URL configuratie
 *
 * Detecteert automatisch of we lokaal draaien of live.
 * Voeg altijd als EERSTE script toe in elke HTML pagina.
 *
 * Lokaal:  http://localhost:* → backend op poort 3000
 * Live:    Netlify/Railway URL → productie backend
 */

(function() {
  const isLocal = window.location.hostname === 'localhost'
               || window.location.hostname === '127.0.0.1'
               || window.location.hostname === '';

  window.KOPPEL_BACKEND_URL = isLocal
    ? 'http://localhost:3000'
    : 'https://snakesandladdders-production.up.railway.app';

  if (isLocal) {
    console.log('[config] Lokale modus — backend op http://localhost:3000');
  }
})();
