/**
 * toon-helper.js — Gedeeld toon-DNA voor alle modules
 *
 * Gebruik:
 *   <script src="toon-helper.js"></script>
 *
 *   TOON.veilig(tekst)               → verwijdert verboden woorden
 *   TOON.vertrouwen(rondeCount)       → 'lijkt' | 'komt terug' | 'aanwezig'
 *   TOON.spiegel(label, type)        → warme spiegel-zin
 *   TOON.safety(casus)               → { klasse, tonen, tekst, crisis }
 *   TOON.spiegelProfiel(profiel)     → samenvatting-zin voor profiel
 *
 * i18n: vervang TOON.t voor andere taal
 */

const TOON = (() => {

  // ── Goedgekeurde woordenschat ──────────────────────────
  // i18n: vervang dit object voor EN/FR/etc.
  const t = {
    // Kernwoorden die ALTIJD gebruikt mogen worden
    kans:          'kans',
    uitdaging:     'uitdaging',
    bescherming:   'bescherming',
    behoefte:      'behoefte',
    gevoeligePlek: 'gevoelige plek',
    experiment:    'experiment',
    patroon:       'patroon',
    signaal:       'signaal',

    // Vertrouwen-taal per niveau
    vertrouwen: {
      low:    { woord: 'lijkt',        zin: 'Het lijkt erop dat',      kans: 'Een mogelijke kans',       uitdaging: 'Een mogelijke uitdaging' },
      medium: { woord: 'komt terug',   zin: 'Dit komt terug:',         kans: 'Een kans die terugkeert',  uitdaging: 'Een uitdaging die terugkeert' },
      high:   { woord: 'aanwezig',     zin: 'Duidelijk aanwezig:',     kans: 'Jouw kans',                uitdaging: 'Jouw uitdaging' },
    },

    // Safety-teksten per klasse
    safety: {
      normaal: null,
      zacht: {
        badge:    '🌿 Gevoelig thema',
        intro:    'Dit thema kan dichtbij komen. Neem de tijd die je nodig hebt.',
        btn:      'Ik ben klaar — verder',
      },
      diep: {
        badge:    '🌊 Diep thema',
        intro:    'Dit gaat over een van de moeilijkste dingen in een relatie. Er is geen goed of fout antwoord. Doe dit alleen als je je er klaar voor voelt.',
        btn:      'Ik ga dit aan — verder',
        reveal:   'Wat je zojuist heeft aangeraakt is niet klein. Neem even de tijd voordat je verder gaat.',
      },
      crisis: {
        badge:    '💙 Kwetsbaar thema',
        intro:    'Dit onderwerp kan raken aan verlies, wanhoop of crisis. Deze app is geen vervanging voor professionele hulp.',
        btn:      'Ik begrijp het — ik ga door',
        reveal:   'Als dit thema te dicht bij een persoonlijke situatie komt: hulp is beschikbaar.',
        hulp:     'Nederland: Luisterlijn 0900-0767 (gratis, 24/7) · België: Tele-onthaal 106',
        hulp_url: 'https://www.luisterlijn.nl',
      },
    },

    // Verboden woorden (nooit gebruiken)
    verboden: [
      'diagnose', 'diagnosticeer', 'stoornis', 'ziek', 'pathologisch',
      'toxic', 'giftig', 'probleemtype', 'zwakte', 'zwak', 'fout', 'schuldig',
      'narcistisch', 'borderline', 'gestoord', 'abnormaal',
    ],

    // Enneagram: altijd als signaal, nooit als label
    ennSignaal:  (type) => `signalen die passen bij Type ${type}-thema's`,
    ennNiet:     (type) => `Je bent Type ${type}`, // ← dit nooit zeggen

    // Spiegel-zinnen per type
    spiegel: {
      behoefte:     (label) => `Wat jij nodig lijkt te hebben: ${label.toLowerCase()}.`,
      bescherming:  (label) => `${label} is een manier om jezelf te beschermen. Dit bewaakt iets waardevols.`,
      gevoelig:     (label) => `Dit kan raken aan momenten waarop iemand zich ${label.toLowerCase()} voelt.`,
      patroon:      (label) => `Een patroon dat terugkomt: ${label.toLowerCase()}. Twee kanten van dezelfde behoefte.`,
      kans:         (tekst) => `Jouw kans: ${tekst}`,
      uitdaging:    (tekst) => `Jouw uitdaging: ${tekst}`,
    },
  };

  // ── Safety classifier ──────────────────────────────────
  /**
   * Bepaalt de safety-klasse van een casus.
   * Retourneert: { klasse: 'normaal'|'zacht'|'diep'|'crisis', teksten: {...} }
   */
  function safety(casus) {
    if (!casus) return { klasse: 'normaal', teksten: null };

    const domein    = casus.domain?.domain_id || '';
    const intensity = casus.intensity || '';
    const caseType  = casus.case_type || '';
    const caseId    = casus.case_id || '';
    const titel     = (casus.situation?.title || '').toLowerCase();
    const safetyObj = casus.safety || {};

    // Crisis: D15_DEEP_002 of expliciete crisis-trigger
    const isCrisis = caseId === 'D15_DEEP_002'
      || safetyObj.crisis_redirect === true
      || titel.includes('crisis')
      || titel.includes('wanhoop')
      || titel.includes('suïcid');

    if (isCrisis) return { klasse: 'crisis', teksten: t.safety.crisis };

    // Diep: intensity=deep of D15+tension/deep
    const isDiep = intensity === 'deep'
      || (domein === 'D15' && (caseType === 'deep' || caseType === 'tension'));

    if (isDiep) return { klasse: 'diep', teksten: t.safety.diep };

    // Zacht: D15 algemeen, D8 deep, D13 deep
    const isZacht = domein === 'D15'
      || (domein === 'D8' && intensity === 'deep')
      || (domein === 'D13' && intensity === 'deep')
      || safetyObj.sensitivity_level === 'high';

    if (isZacht) return { klasse: 'zacht', teksten: t.safety.zacht };

    return { klasse: 'normaal', teksten: null };
  }

  // ── Vertrouwen-taal ────────────────────────────────────
  /**
   * Geeft het taal-niveau terug op basis van aantal rondes.
   * rondeCount: aantal gespeelde rondes
   * type: 'woord' | 'zin' | 'kans' | 'uitdaging'
   */
  function vertrouwen(rondeCount, type = 'woord') {
    const niveau = rondeCount >= 12 ? 'high' : rondeCount >= 8 ? 'medium' : 'low';
    return t.vertrouwen[niveau][type] || t.vertrouwen[niveau].woord;
  }

  // ── Spiegel-zin generator ──────────────────────────────
  /**
   * Genereert een warme spiegel-zin.
   * label: het label van de tag/behoefte/etc.
   * type:  'behoefte' | 'bescherming' | 'gevoelig' | 'patroon' | 'kans' | 'uitdaging'
   */
  function spiegel(label, type = 'behoefte') {
    const fn = t.spiegel[type];
    return fn ? fn(label) : label;
  }

  // ── Profiel samenvatting ───────────────────────────────
  /**
   * Genereert een warme samenvatting-zin voor het profiel.
   * profiel: het gesanitizede profiel-object van de backend
   * rondeCount: voor vertrouwen-taal
   */
  function spiegelProfiel(profiel, rondeCount = 0) {
    const zinnen = [];
    const vw = vertrouwen(rondeCount, 'zin');

    if (profiel.topBehoeften?.[0]) {
      zinnen.push(`${vw} ${t.behoefte}: ${profiel.topBehoeften[0].label.toLowerCase()}.`);
    }
    if (profiel.topBeschermingen?.[0]) {
      zinnen.push(t.spiegel.bescherming(profiel.topBeschermingen[0].label));
    }
    if (profiel.disc?.primary) {
      const kleurNamen = { R: 'rood', G: 'geel', Gr: 'groen', B: 'blauw' };
      zinnen.push(`Je kleurprofiel laat een ${kleurNamen[profiel.disc.primary] || profiel.disc.primary} stijl zien.`);
    }
    if (profiel.kernkwadranten?.topQualities?.[0]) {
      zinnen.push(`Een kernkwaliteit die terugkeert: ${profiel.kernkwadranten.topQualities[0].name}.`);
    }

    return zinnen.length > 0 ? zinnen.join(' ') : 'Je profiel bouwt op. Elke ronde voegt een laag toe.';
  }

  // ── Veiligheidscheck tekst ─────────────────────────────
  /**
   * Verwijdert of markeert verboden woorden in een tekst.
   * Retourneert de gecleande tekst.
   */
  function veilig(tekst) {
    if (!tekst) return tekst;
    let result = tekst;
    t.verboden.forEach(woord => {
      const re = new RegExp(woord, 'gi');
      if (re.test(result)) {
        console.warn(`[toon] Verboden woord gevonden: "${woord}" in tekst`);
        result = result.replace(re, '[•]');
      }
    });
    return result;
  }

  // ── Crisis HTML ────────────────────────────────────────
  /**
   * Genereert het crisis-hulpblok als HTML string.
   */
  function crisisHtml(stijl = 'dark') {
    const c = t.safety.crisis;
    const bg      = stijl === 'dark' ? 'rgba(92,155,232,0.1)' : '#eef4fb';
    const border  = stijl === 'dark' ? 'rgba(92,155,232,0.3)' : '#c3d8f0';
    const kleur   = stijl === 'dark' ? '#5c9be8' : '#2a5c8a';
    return `
      <div style="background:${bg};border:1px solid ${border};border-radius:10px;padding:14px 16px;margin:12px 0;">
        <div style="font-size:0.72rem;font-weight:700;color:${kleur};letter-spacing:0.07em;text-transform:uppercase;margin-bottom:6px;">💙 Hulp beschikbaar</div>
        <div style="font-size:0.84rem;line-height:1.55;">${c.hulp}</div>
        <a href="${c.hulp_url}" target="_blank" rel="noopener"
          style="display:inline-block;margin-top:8px;font-size:0.78rem;color:${kleur};">
          Meer info →
        </a>
      </div>`;
  }

  // ── Safety badge HTML ──────────────────────────────────
  /**
   * Genereert het safety-badge blok voor boven de situatiekaart.
   */
  function safetyBadgeHtml(klasse, stijl = 'dark') {
    const teksten = t.safety[klasse];
    if (!teksten) return '';

    const kleuren = {
      dark: {
        zacht:  { bg: 'rgba(92,232,160,0.08)',  border: 'rgba(92,232,160,0.2)',  text: '#5ce8a0' },
        diep:   { bg: 'rgba(232,196,92,0.1)',   border: 'rgba(232,196,92,0.25)', text: '#e8c45c' },
        crisis: { bg: 'rgba(92,155,232,0.1)',   border: 'rgba(92,155,232,0.3)',  text: '#5c9be8' },
      },
      light: {
        zacht:  { bg: '#eef7f2', border: '#b8dfc8', text: '#3a7c54' },
        diep:   { bg: '#fdf5e8', border: '#e8d4a0', text: '#b87c2a' },
        crisis: { bg: '#eef4fb', border: '#c3d8f0', text: '#2a5c8a' },
      },
    };
    const kl = (kleuren[stijl] || kleuren.dark)[klasse] || kleuren.dark.zacht;

    return `
      <div style="background:${kl.bg};border:1px solid ${kl.border};border-radius:10px;padding:12px 14px;margin-bottom:12px;">
        <div style="font-size:0.8rem;font-weight:700;color:${kl.text};margin-bottom:4px;">${teksten.badge}</div>
        <div style="font-size:0.82rem;line-height:1.5;">${teksten.intro}</div>
      </div>`;
  }

  // ── Public API ─────────────────────────────────────────
  return {
    t,            // ruwe tekst-object (voor overschrijven bij i18n)
    veilig,
    vertrouwen,
    spiegel,
    spiegelProfiel,
    safety,
    crisisHtml,
    safetyBadgeHtml,
  };

})();
