# Slow Dating — Developer Guide
> Patronen en afspraken voor alle kaarten/spellen in de app.  
> Bijgewerkt na implementatie van `waarden.html` + `onthulling.html`.

---

## 1. Portretkaart als achtergrond (het "card frame" patroon)

Elke spelkaart is een **portretafbeelding (941×1672px)** die het scherm vult op mobiel en gecentreerd staat op desktop — net als de wereldkaart in `world.html`.

### CSS (kopieer dit letterlijk)
```css
#s-mijnscherm {
  position: fixed !important; inset: 0 !important;
  background: #0a0a0a; display: none;
  flex-direction: column; align-items: center; justify-content: center;
  overflow: hidden; z-index: 10000; /* boven .back-btn (9999) */
}
#s-mijnscherm.active { display: flex !important; }

.mijn-frame {
  position: relative; flex-shrink: 0; overflow: hidden;
  width: min(calc(100svh * 941 / 1672), 100svw);
  aspect-ratio: 941 / 1672;
}
.mijn-frame > img.mijn-bg {
  position: absolute; inset: 0; width: 100%; height: 100%;
  object-fit: fill; /* BELANGRIJK: fill = geen bijsnijden, pixel-exact */
  display: block;
}
```

### JS (kopieer dit letterlijk)
```javascript
const AW = 941, AH = 1672; // artboard afmetingen

function fitMijnKaart() {
  const ratio = AW / AH;
  let fw, fh;
  if (window.innerWidth / window.innerHeight > ratio) {
    fh = window.innerHeight; fw = fh * ratio;
  } else {
    fw = window.innerWidth; fh = fw / ratio;
  }
  fw = Math.round(fw); fh = Math.round(fh);
  const frame = document.getElementById('mijn-frame');
  if (!frame) return;
  frame.style.width  = fw + 'px';
  frame.style.height = fh + 'px';
  placeHotspots(fw, fh); // zie sectie 2
}
fitMijnKaart();
window.addEventListener('resize', fitMijnKaart);
window.addEventListener('load',   fitMijnKaart);
```

### showScreen() — altijd fit aanroepen
```javascript
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) { el.classList.add('active'); el.scrollTop = 0; }
  if (id === 's-mijnscherm') fitMijnKaart();
}
```

---

## 2. Hotspot positionering (pixel-exact)

Alle interactieve elementen (knoppen, chips, slots) zijn **transparante hotspots** over de achtergrondafbeelding. De afbeelding heeft het visuele design ingebakken.

### Hotspots meten
Gebruik `hotspot_editor.html` op het bureaublad:
1. Laad de afbeelding
2. Teken rechthoeken over elk interactief element
3. Geef elk een naam (popup verschijnt automatisch na tekenen)
4. Exporteer als JSON → plak in DESIGN object

### DESIGN object
```javascript
const DESIGN = {
  back:   { x: 66, y: 48, w: 156, h: 79 },   // terug-knop
  slots:  [                                     // selectie-vakjes
    { x: 189, y: 454, w: 158, h: 102 },
    { x: 390, y: 459, w: 168, h:  92 },
    { x: 589, y: 459, w: 173, h:  92 },
  ],
  chips:  [ /* 16 stuks, van links→rechts, boven→beneden */ ],
  cta:    { x: 189, y: 1376, w: 550, h: 123 }, // hoofdknop
  chatBtn:{ x: 181, y: 1448, w: 250, h:  76 },
  callBtn:{ x: 505, y: 1448, w: 255, h:  84 },
};
```

### px() helper — element positioneren
```javascript
function px(el, d, fw, fh) {
  if (!el) return;
  el.style.left   = (d.x / AW * fw) + 'px';
  el.style.top    = (d.y / AH * fh) + 'px';
  el.style.width  = (d.w / AW * fw) + 'px';
  el.style.height = (d.h / AH * fh) + 'px';
}

function placeHotspots(fw, fh) {
  px(document.querySelector('.mijn-back'), DESIGN.back, fw, fh);
  px(document.querySelector('.mijn-cta'),  DESIGN.cta,  fw, fh);
  px(document.getElementById('mijn-chat'), DESIGN.chatBtn, fw, fh);
  px(document.getElementById('mijn-call'), DESIGN.callBtn, fw, fh);
  // etc.
}
```

### CSS voor hotspot-elementen
```css
/* Terug-knop */
.mijn-back {
  position: absolute; background: transparent !important; border: none !important;
  outline: none !important; font-size: 0; color: transparent;
  display: block; z-index: 10; cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

/* Chip/selecteerbaar element */
.chip {
  position: absolute; pointer-events: auto;
  background: transparent; border: none; cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

/* Chat / bel knop */
.onth-action-btn {
  position: absolute; background: transparent; border: none;
  cursor: pointer; z-index: 10;
  font-size: 0; color: transparent; /* GEEN zichtbare tekst */
  -webkit-tap-highlight-color: transparent;
}
```

**Regel:** de afbeelding heeft het visuele design — HTML-elementen zijn puur klikbare gebieden.

---

## 3. Bellen via CommLayer

### Knop in HTML
```html
<!-- Altijd CommLayer.toggleCall() — nooit een eigen wrapper -->
<button class="onth-action-btn" id="mijn-call"
        onclick="CommLayer.toggleCall()">bellen</button>
```

### Wat CommLayer.toggleCall() doet (automatisch)
| Situatie | Gedrag |
|---|---|
| Bellen nog niet ontgrendeld | Opent progress popup met voortgang |
| Bellen ontgrendeld, partner niet akkoord | Stuurt unlock-verzoek |
| Beiden akkoord | Start WebRTC gesprek |
| Al in gesprek | Stopt gesprek |

### Spelregels voor bellen (server-side, comm.js)
- ✅ **10 minuten** samen online geweest
- ✅ **10 berichten** elk uitgewisseld (via CommLayer chat)
- ✅ **2 spellen** voltooid
- ✅ Beiden expliciet akkoord gegaan

### Progress popup sluiten
Werkt automatisch via `comm.js`:
- **✕ knop** rechtsboven in popup
- **Klik buiten** popup (backdrop)
- Geen extra code nodig per kaart

### z-index volgorde (NIET aanpassen)
```
CommLayer panels:  10200–10900  ← altijd bovenop
Game screens:      10000        ← s-kies, s-reveal etc.
.back-btn:         9999
Normale content:   1–100
```

---

## 4. Swipable vragen

Gebruik dit patroon voor zones met meerdere vragen die je kunt doorswipen.

### HTML
```html
<div class="onth-vraag" id="ovraag1">
  <div class="onth-vraag-track" id="ovraag1-track"></div>
  <div class="onth-dots"        id="ovraag1-dots"></div>
</div>
```

### CSS (minimaal)
```css
.onth-vraag { position: absolute; overflow: hidden; cursor: pointer; }
.onth-vraag-track {
  display: flex; width: 100%; height: 100%;
  transition: transform 0.32s cubic-bezier(.4,0,.2,1);
}
.onth-vraag-slide { min-width: 100%; height: 100%; flex-shrink: 0; }
.onth-dots { position: absolute; bottom: 3px; left: 0; right: 0;
  display: flex; justify-content: center; gap: 4px; pointer-events: none; }
.onth-dot { width: 4px; height: 4px; border-radius: 50%;
  background: rgba(80,40,5,0.25); }
.onth-dot.active { background: rgba(80,40,5,0.75); }
```

### JS
```javascript
// State per zone
const vraagState = {
  1: { idx: 0, items: [] },
  2: { idx: 0, items: [] },
};

// Navigeer naar slide
function goToSlide(n, idx) {
  const state = vraagState[n];
  idx = Math.max(0, Math.min(state.items.length - 1, idx));
  state.idx = idx;
  document.getElementById('ovraag'+n+'-track').style.transform =
    'translateX(-' + (idx * 100) + '%)';
  document.querySelectorAll('#ovraag'+n+'-dots .onth-dot')
    .forEach((d, i) => d.classList.toggle('active', i === idx));
}

// BELANGRIJK: gebruik _swipeInit vlag om dubbele listeners te voorkomen
function setupVraagSwipe(n) {
  const zone = document.getElementById('ovraag'+n);
  if (!zone || zone._swipeInit) return;
  zone._swipeInit = true;
  // ... touch + mouse handlers (zie waarden.html voor volledige implementatie)
}
```

**Let op:** roep `setupVraagSwipe(n)` aan met `_swipeInit` check — anders stapelen listeners bij herbouwen.

---

## 5. Namen verzamelen (koppel-flow)

### State object
```javascript
const S = {
  myName: '', partnerName: '',
  koppelMode: 'create', // 'create' | 'join'
  // ...
};
```

### Naam in sessie meesturen
```javascript
// Bij submitKeuze / done():
KoppelClient.done({ waarden: S.gekozen, naam: S.myName });

// Bij session_complete ontvangen:
KoppelClient.on('session_complete', ({ state }) => {
  const pk = S.player === '1' ? 'p2' : 'p1';
  S.partnerGekozen = state[pk].waarden;
  S.partnerName    = state[pk].naam || '';
});
```

### Naam opslaan in localStorage
```javascript
window.addEventListener('beforeunload', () => {
  if (S.myName) localStorage.setItem('comm_naam', S.myName);
});
// Bij autostart lezen:
const sn = localStorage.getItem('comm_naam');
if (sn) S.myName = sn;
```

---

## 6. Chat overlay

Een volledig scherm chat-window dat bovenop alles opent.

### HTML structuur
```html
<div id="chat-overlay">
  <div id="chat-header">
    <button onclick="closeChat()">← Terug</button>
    <div id="chat-partner-name">Naam partner</div>
  </div>
  <div id="chat-question-bar"></div>  <!-- vraag bovenaan -->
  <div id="chat-messages"></div>
  <div id="chat-input-row">
    <input type="text" id="chat-text-input">
    <button onclick="sendChatMsg()">↑</button>
  </div>
</div>
```

### Openen met vraag
```javascript
function openChat(vraag) {
  document.getElementById('chat-question-bar').textContent = vraag || '';
  document.getElementById('chat-overlay').classList.add('open');
  document.getElementById('chat-partner-name').textContent =
    S.partnerName || 'Je partner';
}
function closeChat() {
  document.getElementById('chat-overlay').classList.remove('open');
}
```

### z-index
```css
#chat-overlay { position: fixed; inset: 0; z-index: 40000; display: none; }
#chat-overlay.open { display: flex; }
```

---

## 7. Nieuwe kaart bouwen — checklist

- [ ] Maak `images/mijnkaart.webp` aan (941×1672px)
- [ ] Meet hotspots met `hotspot_editor.html` → exporteer JSON
- [ ] Kopieer CSS-patroon uit sectie 1 (frame + screen)
- [ ] Maak DESIGN object met gemeten coördinaten (sectie 2)
- [ ] Bel-knop: `onclick="CommLayer.toggleCall()"` — geen wrapper (sectie 3)
- [ ] Chat-knop: `onclick="openChat()"` (sectie 6)
- [ ] `fitMijnKaart()` aanroepen in `showScreen()` en op resize/load
- [ ] Scripts in `<head>`: `config.js` → `sd-client.js` → `sd-chat.js` → `comm.js`
- [ ] Namen ophalen uit `S.myName` / `S.partnerName`
- [ ] Test op mobiel (portrait) én desktop (landscape)

---

## 8. Railway WebSocket — transport volgorde

Railway's proxy blokkeert soms directe WebSocket-upgrades, waardoor spelers elkaar niet zien (`"WebSocket closed before connection established"`).

### Regel: altijd polling-eerst

**`sd-client.js`** (client):
```javascript
_socket = io(BACKEND, {
  transports: ['polling', 'websocket'], // polling eerst — Railway-compatibel
  upgrade: true,                        // upgrade daarna automatisch naar websocket
  reconnectionAttempts: 10,
  reconnectionDelay: 1500,
  timeout: 20000,
});
```

**`koppel-backend/server.js`** (server):
```javascript
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout:    60000,
  pingInterval:   25000,
  upgradeTimeout: 30000,
  transports:     ['polling', 'websocket'], // zelfde volgorde als client
});
```

### Hoe het werkt
1. Verbinding start via HTTP long-polling (werkt altijd via Railway)
2. Socket.io upgradet automatisch naar WebSocket zodra dat lukt
3. In devtools zie je eerst een XHR-request, daarna een WS-verbinding

**Nooit** `['websocket', 'polling']` — dat probeert WS first en faalt op Railway.

---

## 9. Bestandsstructuur

```
koppel-frontend/
├── images/
│   ├── waarden.webp       ← 941×1672
│   ├── onthulling.webp    ← 941×1672
│   └── [nieuwe kaart].webp
├── lib/
│   ├── DEV_GUIDE.md       ← dit bestand
│   └── [versie-archief].html
├── comm.js                ← globale CommLayer (bellen + chat) — NIET per spel aanpassen
├── sd-client.js           ← KoppelClient
├── sd-chat.js             ← chat hulpfuncties
├── config.js              ← server URL e.d.
├── world.html             ← wereldkaart / navigatie
├── waarden.html           ← ✅ referentie-implementatie
└── hotspot_editor.html    ← staat op desktop, niet in repo
```

---

## 10. Afbeeldingen transparant maken

Stone/chip-afbeeldingen worden vaak aangeleverd als **RGB webp zonder alpha-kanaal** — de witte achtergrond is letterlijk ingebakken.

### Checken
```python
from PIL import Image
img = Image.open('steen.webp')
print(img.mode)  # RGB = geen alpha, RGBA = wel transparant
```

### Batch-fix (flood-fill vanuit hoeken)
```python
from PIL import Image
import numpy as np, os

for fname in os.listdir('images/brug'):
    if not fname.endswith('.webp'): continue
    img = Image.open(fname).convert('RGBA')
    data = np.array(img, dtype=np.uint8)
    r,g,b = data[:,:,0], data[:,:,1], data[:,:,2]
    near_white = (r > 220) & (g > 220) & (b > 220)
    h, w = data.shape[:2]
    visited = np.zeros((h,w), dtype=bool)
    stack = [(y,x) for y,x in [(0,0),(0,w-1),(h-1,0),(h-1,w-1)] if near_white[y,x]]
    while stack:
        y,x = stack.pop()
        if visited[y,x]: continue
        visited[y,x] = True
        for dy,dx in [(-1,0),(1,0),(0,-1),(0,1)]:
            ny,nx = y+dy, x+dx
            if 0<=ny<h and 0<=nx<w and not visited[ny,nx] and near_white[ny,nx]:
                stack.append((ny,nx))
    data[visited, 3] = 0
    Image.fromarray(data).save(fname, 'webp', quality=90)
```

**Drempel 220** werkt voor puur-witte achtergronden. Bij crème/beige achtergrond verlagen naar 200.  
**Nooit** `mix-blend-mode: multiply` gebruiken als workaround — dat vervormt kleuren.

---

## 11. Refresh-bestendig maken (session_complete missen)

### Probleem
Na een page refresh mist de client het `session_complete` event — dat werd al verstuurd naar de oude socket. De speler hangt op het wacht-scherm.

### Oplossing: state checken bij herverbinding
Bij `session_joined` en `session_created` komt de huidige `state` mee. Check altijd of beide spelers al klaar zijn:

```javascript
KoppelClient.on('session_joined', ({ code, player, state }) => {
  window.CommLayer?.setSession(code, player);

  // Beide al klaar? Direct naar reveal
  if (state?.p1?.done && state?.p2?.done) { onDone(state); return; }

  // Ikzelf al klaar? Toon wacht-scherm
  const myKey = 'p' + player;
  if (state?.[myKey]?.done) { showS('s-wacht'); return; }

  // Normaal: start het spel
  startGame();
});
```

### Sessie vol na refresh (polling transport)
Met polling transport detecteert de server disconnects pas na `pingTimeout` (60s).  
Fix zit in `sd-client.js` (beforeunload → `player_leaving`) + server `disconnectedAt` tracking.  
**Nooit** `['websocket', 'polling']` — gebruik altijd `['polling', 'websocket']` op Railway.  
**Let op:** dit geldt voor ALLE socket-verbindingen: `sd-client.js`, `comm.js`, en elk nieuw bestand dat `io()` aanroept.

---

## 12. Veelgemaakte fouten

| Fout | Oorzaak | Oplossing |
|---|---|---|
| Kaart vult heel scherm op desktop | Geen `fitKies()` of niet aangeroepen | Kopieer JS-patroon uit sectie 1 |
| Hotspots staan op verkeerde plek | Percentage-CSS i.p.v. JS-pixels | Gebruik `px()` helper met `fw`/`fh` |
| Bel-knop doet niks | z-index CommLayer panels te laag | Panels staan nu op 10200-10900 in comm.js |
| Dubbele swipe-listeners | `setupVraagSwipe` meerdere keren aangeroepen | Check `zone._swipeInit` vlag |
| Slot toont nummers (1,2,3) | `textContent = i+1` voor lege slots | Gebruik `textContent = ''` voor leeg |
| `object-fit: cover` snijdt bij | Gebruik `object-fit: fill` voor pixel-exacte mapping |
| Spelers zien elkaar niet op Railway | `transports: ['websocket','polling']` — WS first | Zet naar `['polling','websocket']` in sd-client.js én server.js |
| Wacht-scherm hangt na refresh | `session_complete` al verstuurd naar oude socket | Check `state.p1.done && state.p2.done` in `session_joined` callback |
| "Sessie is al vol" na refresh | Polling detecteert disconnect pas na 60s | `beforeunload` → `player_leaving` emit (zit in sd-client.js) |
| Afbeelding heeft witte achtergrond | webp opgeslagen als RGB zonder alpha | Flood-fill script (zie sectie 10) |
