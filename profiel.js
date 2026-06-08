/**
 * profiel.js — Anoniem gebruikersprofiel opbouwen
 *
 * Genereert een UUID bij eerste bezoek (opgeslagen in localStorage).
 * Stuurt resultaten na elke voltooide sessie naar de backend.
 * Later: koppel de userId aan een account bij login.
 *
 * Gebruik:
 *   ProfielClient.init()
 *   ProfielClient.saveDISC(scores, primary, ...)
 *   ProfielClient.saveKK(topQualities, routes)
 *   ProfielClient.saveWaarden({ gekozenZelf, bevestigdVanPartner, modus })
 *   ProfielClient.saveTags({ caseId, domain, caseType, tags, modus, koppelCode })
 *   ProfielClient.getRelatiekaart(partnerUserId)
 *   ProfielClient.getReport()
 *   ProfielClient.getUserId()
 *
 * i18n-ready: alle user-facing tekst in TEKST object hieronder.
 */

// ── Tekst (i18n) ──────────────────────────────────────────
// Vervang waarden voor EN/FR/etc.
const PROFIEL_TEKST = {
  badge_title:     (n) => `Jouw profiel: ${n} sessie${n !== 1 ? 's' : ''} • Tik voor details`,
  modal_title:     'Jouw profiel',
  section_disc:    'Kleurprofiel',
  section_kk:      'Kernkwaliteiten',
  section_behoeften:    'Jouw behoeften',
  section_beschermingen: 'Jouw beschermingen',
  section_gevoelig:     'Gevoelige plekken',
  section_inzichten:    'Inzichten',
  sessions_label:  (n) => `${n} sessie${n !== 1 ? 's' : ''} • profiel bouwt op`,
  rondes_label:    (n) => `${n} ronde${n !== 1 ? 's' : ''} gespeeld`,
  btn_close:       'Sluiten',
  not_yet:         '—',
  confidence_low:  'lijkt',
  confidence_mid:  'komt terug',
  confidence_high: 'duidelijk aanwezig',
  color_names:     { R: 'Rood', G: 'Geel', Gr: 'Groen', B: 'Blauw' },
};

const ProfielClient = (() => {
  const BACKEND = window.KOPPEL_BACKEND_URL || 'https://snakesandladdders-production.up.railway.app';
  const LS_KEY  = 'kk_user_id';

  let _userId  = null;
  let _profile = null;

  // ── UUID generator ────────────────────────────────────
  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  // ── Init ──────────────────────────────────────────────
  function init() {
    let id = localStorage.getItem(LS_KEY);
    if (!id) {
      id = generateUUID();
      localStorage.setItem(LS_KEY, id);
    }
    _userId = id;

    fetch(`${BACKEND}/api/profile/${_userId}`, {
      headers: { 'x-user-id': _userId }
    })
    .then(r => r.ok ? r.json() : null)
    .then(p => { if (p) _profile = p; })
    .catch(() => {});

    return _userId;
  }

  // ── Private helper ────────────────────────────────────
  async function post(endpoint, body) {
    if (!_userId) return null;
    try {
      const res = await fetch(`${BACKEND}${endpoint}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': _userId },
        body:    JSON.stringify({ userId: _userId, ...body }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.profile) _profile = data.profile;
      return data;
    } catch (e) {
      return null;
    }
  }

  async function get(endpoint) {
    if (!_userId) return null;
    try {
      const res = await fetch(`${BACKEND}${endpoint}`, {
        headers: { 'x-user-id': _userId }
      });
      return res.ok ? res.json() : null;
    } catch (e) { return null; }
  }

  // ── DISC sessie opslaan ───────────────────────────────
  function saveDISC({ scores, primary, secondary, feelingColor, stressColor }) {
    return post('/api/profile/disc', { scores, primary, secondary, feelingColor, stressColor });
  }

  // ── Kernkwadranten sessie opslaan ─────────────────────
  function saveKernkwadranten({ topQualities, routesCompleted }) {
    return post('/api/profile/kernkwadranten', { topQualities, routesCompleted });
  }

  // ── Waarden sessie opslaan ────────────────────────────
  function saveWaarden({ gekozenZelf, bevestigdVanPartner, modus }) {
    return post('/api/profile/waarden', { gekozenZelf, bevestigdVanPartner, modus });
  }

  // ── Tag-scores opslaan (na een ronde in De Grot) ──────
  // tags: { 'needs.attention': 2, 'protections.withdraw': 1, ... }
  function saveTags({ caseId, domain, caseType, tags, modus, koppelCode }) {
    return post('/api/profile/tags', { caseId, domain, caseType, tags, modus: modus || 'solo', koppelCode: koppelCode || null });
  }

  // ── Relatiekaart ophalen ──────────────────────────────
  function getRelatiekaart(partnerUserId) {
    return get(`/api/relatiekaart?partnerUserId=${partnerUserId}`);
  }

  // ── Thema herkenning ──────────────────────────────────
  function addThema(thema) {
    return post('/api/profile/thema', { thema });
  }

  // ── Rapport ophalen ───────────────────────────────────
  function getReport() {
    return get(`/api/profile/${_userId}/report`);
  }

  // ── Content ophalen ───────────────────────────────────
  // Cases gefilterd ophalen van de backend
  function getCases({ domain, type, mode, shuffle, limit } = {}) {
    const params = new URLSearchParams();
    if (domain)  params.set('domain', domain);
    if (type)    params.set('type', type);
    if (mode)    params.set('mode', mode);
    if (shuffle) params.set('shuffle', '1');
    if (limit)   params.set('limit', String(limit));
    return get(`/api/content/cases?${params.toString()}`);
  }

  function getDomains()  { return get('/api/content/domains'); }
  function getPatterns() { return get('/api/content/patterns'); }

  // ── Lokaal profiel ────────────────────────────────────
  function getLocal()   { return _profile; }
  function getUserId()  { return _userId; }

  // ── Confidence helper ─────────────────────────────────
  // Geeft taal-niveau terug op basis van rondeCount
  function getConfidenceLabel(rondeCount) {
    if (rondeCount >= 12) return PROFIEL_TEKST.confidence_high;
    if (rondeCount >= 8)  return PROFIEL_TEKST.confidence_mid;
    return PROFIEL_TEKST.confidence_low;
  }

  // ── Profiel-badge tonen ───────────────────────────────
  function showProfileBadge() {
    if (!_profile) return;

    const colors = { R: '#e53935', G: '#f9a825', Gr: '#43a047', B: '#1e88e5' };
    const hex = colors[_profile.disc && _profile.disc.primary] || '#888';
    const sessions = _profile.totalSessions || 0;

    const old = document.getElementById('profiel-badge');
    if (old) old.remove();

    const badge = document.createElement('div');
    badge.id = 'profiel-badge';
    badge.title = PROFIEL_TEKST.badge_title(sessions);
    badge.style.cssText = `
      position: fixed; top: 12px; right: 12px; z-index: 8888;
      width: 32px; height: 32px; border-radius: 50%;
      background: ${hex}; border: 2px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      cursor: pointer; display: flex; align-items: center;
      justify-content: center; font-size: 0.65rem;
      font-weight: 700; color: white;
    `;
    badge.textContent = sessions > 9 ? '9+' : String(sessions);
    // Op profiel.html zelf: open modal. Overal elders: ga naar profiel.html
    if (window.location.pathname.includes('profiel.html')) {
      badge.onclick = showProfileModal;
    } else {
      badge.onclick = () => { window.location.href = 'profiel.html'; };
    }
    document.body.appendChild(badge);
  }

  // ── Profiel-modal ─────────────────────────────────────
  function showProfileModal() {
    const p = _profile;
    if (!p) return;

    const T = PROFIEL_TEKST;
    const colorHex   = { R: '#e53935', G: '#f9a825', Gr: '#43a047', B: '#1e88e5' };
    const colorNames = T.color_names;

    const old = document.getElementById('profiel-modal');
    if (old) { old.remove(); return; } // toggle

    const topQ   = (p.kernkwadranten && p.kernkwadranten.topQualities || []).slice(0, 3).map(q => q.name || q.id).join(', ') || T.not_yet;
    const insights = (p.insights || []).slice(0, 3);
    const rondeCount = p.rondeCount || 0;

    const disc = p.disc || {};
    const primary   = disc.primary   ? `<span style="background:${colorHex[disc.primary]};color:white;padding:2px 8px;border-radius:4px;font-weight:700;">${colorNames[disc.primary]}</span>` : T.not_yet;
    const secondary = disc.secondary ? `<span style="background:${colorHex[disc.secondary]}22;color:${colorHex[disc.secondary]};padding:2px 8px;border-radius:4px;font-weight:600;">${colorNames[disc.secondary]}</span>` : '';

    // Behoeften-sectie (uit rondes)
    const behoeften = (p.topBehoeften || []).slice(0, 3);
    const bescherm  = (p.topBeschermingen || []).slice(0, 2);

    const modal = document.createElement('div');
    modal.id = 'profiel-modal';
    modal.style.cssText = `
      position: fixed; top: 52px; right: 12px; z-index: 9000;
      background: white; border-radius: 16px; padding: 18px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.18); max-width: 300px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 0.83rem; color: #333; max-height: 85vh; overflow-y: auto;
    `;

    modal.innerHTML = `
      <div style="font-weight:700; font-size:0.95rem; margin-bottom:12px;">&#128100; ${T.modal_title}</div>

      <div style="margin-bottom:8px;">
        <span style="color:#888;font-size:0.75rem;">${T.section_disc}</span><br>
        ${primary} ${secondary}
      </div>

      ${disc.feelingColor ? `
      <div style="margin-bottom:8px;">
        <span style="color:#888;font-size:0.75rem;">Diepere behoefte</span><br>
        ${colorNames[disc.feelingColor] || T.not_yet}
      </div>` : ''}

      <div style="margin-bottom:8px;">
        <span style="color:#888;font-size:0.75rem;">${T.section_kk}</span><br>
        ${topQ}
      </div>

      ${behoeften.length ? `
      <div style="margin-bottom:8px;">
        <span style="color:#888;font-size:0.75rem;">${T.section_behoeften}</span>
        ${behoeften.map(b => `<div style="margin-top:3px;display:inline-block;margin-right:4px;padding:2px 8px;background:#f0f4ff;border-radius:12px;font-size:0.76rem;">${b.label}</div>`).join('')}
      </div>` : ''}

      ${bescherm.length ? `
      <div style="margin-bottom:8px;">
        <span style="color:#888;font-size:0.75rem;">${T.section_beschermingen}</span>
        ${bescherm.map(b => `<div style="margin-top:3px;display:inline-block;margin-right:4px;padding:2px 8px;background:#fff4f0;border-radius:12px;font-size:0.76rem;">${b.label}</div>`).join('')}
      </div>` : ''}

      ${insights.length ? `
      <div style="margin-bottom:10px;">
        <span style="color:#888;font-size:0.75rem;">${T.section_inzichten}</span>
        ${insights.map(i => `<div style="margin-top:4px;padding:6px 8px;background:#f5f5f5;border-radius:6px;font-size:0.78rem;">${i}</div>`).join('')}
      </div>` : ''}

      <div style="font-size:0.7rem;color:#bbb;margin-top:8px;">
        ${T.sessions_label(p.totalSessions || 0)}
        ${rondeCount ? ` &bull; ${T.rondes_label(rondeCount)}` : ''}
      </div>
      <button onclick="document.getElementById('profiel-modal').remove()"
        style="margin-top:10px;width:100%;padding:7px;border:none;border-radius:8px;
               background:#f0f0f0;cursor:pointer;font-size:0.82rem;">
        ${T.btn_close}
      </button>
    `;

    setTimeout(() => {
      document.addEventListener('click', function closer(e) {
        if (!modal.contains(e.target) && e.target.id !== 'profiel-badge') {
          modal.remove();
          document.removeEventListener('click', closer);
        }
      });
    }, 100);

    document.body.appendChild(modal);
  }

  return {
    init,
    saveDISC,
    saveKernkwadranten,
    saveWaarden,
    saveTags,
    getRelatiekaart,
    addThema,
    getReport,
    getCases,
    getDomains,
    getPatterns,
    getLocal,
    getUserId,
    getConfidenceLabel,
    showProfileBadge,
    showProfileModal,
  };
})();
