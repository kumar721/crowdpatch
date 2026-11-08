/* CrowdPatch — Leaflet map, report flow, place search, geolocation */
let reportMode = false;
let markers = {};
let searchMarker = null, meMarker = null, meCircle = null, searchTimer = null;
let lastPos = null;                     // last known device position

const map = L.map('map', { zoomControl: false, preferCanvas: true, worldCopyJump: true })
  .setView(CENTER, 13);

const primaryTiles = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
  { attribution: 'Tiles &copy; Esri', maxZoom: 19, crossOrigin: true }).addTo(map);
const fallbackTiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19, crossOrigin: true });

let tileErrored = false;
primaryTiles.on('tileerror', () => {
  if (tileErrored) return;
  tileErrored = true;
  map.removeLayer(primaryTiles);
  fallbackTiles.addTo(map);
});
L.control.zoom({ position: 'bottomright' }).addTo(map);

let mapRefreshQueued = false;
function refreshMap() {
  if (mapRefreshQueued) return;
  mapRefreshQueued = true;
  requestAnimationFrame(() => {
    mapRefreshQueued = false;
    try { map.invalidateSize({ animate: false, pan: false }); } catch (_) {}
  });
}
window.addEventListener('resize', refreshMap);
window.addEventListener('orientationchange', () => setTimeout(refreshMap, 250));
if (window.ResizeObserver) new ResizeObserver(refreshMap).observe(document.querySelector('.mapWrap'));

const markerLayer = L.layerGroup().addTo(map);

function renderMarkers() {
  markerLayer.clearLayers();
  markers = {};
  state.potholes.forEach(p => {
    const st = STATUS[p.status];
    const pulse = (p.status === 'reported' || p.status === 'funded') ? 'pulse' : '';
    const icon = L.divIcon({
      className: '',
      html: `<div class="pin ${pulse}" style="--c:${st.color}"><span>${p.severity === 3 ? '⚠' : ''}</span></div>`,
      iconSize: [30, 30], iconAnchor: [15, 30]
    });
    const m = L.marker([p.lat, p.lng], { icon, title: p.label }).addTo(markerLayer);
    m.on('click', () => selectPothole(p.id));
    markers[p.id] = m;
  });
}

/* ------------------------- REPORT MODE ------------------------- */
function setReportMode(on) {
  reportMode = on;
  $('reportBtn').classList.toggle('on', on);
  $('reportBtn').innerHTML = on ? '✕ Cancel' : '＋ Report pothole';
  $('hint').classList.toggle('on', on);
}

$('reportBtn').addEventListener('click', () => {
  const u = me();
  if (!u) return exitApp();
  if (u.role !== 'citizen') return toast('Only citizens can report potholes', 'warn');
  setReportMode(!reportMode);
});

map.on('click', e => {
  if (!reportMode) return;
  setReportMode(false);
  openReportModal(e.latlng);
});

function openReportModal(latlng) {
  let photoData = null, severity = 2;
  const dup = nearbyOpenPothole(latlng.lat, latlng.lng);

  openModal(`
    <h3>Report a pothole</h3>
    <p class="sub">📍 ${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}</p>
    ${dup ? `<div class="note" style="border-color:#f59e0b;color:#fbbf24">
      ⚠️ An open report <b>“${esc(dup.label)}”</b> is within ${DUPLICATE_RADIUS} m.
      Consider funding it instead of adding a duplicate.
      <button class="btn ghost" id="rGoDup" type="button" style="margin:8px 0 0">View that report</button>
    </div>` : ''}

    <div class="field"><label for="rFile">Photo evidence</label>
      <input type="file" accept="image/*" id="rFile" /></div>
    <div class="previewBox" id="rPrev">No photo yet</div>

    <div class="field"><label>Severity</label>
      <div class="sevPick" id="rSev">
        <button type="button" data-s="1"><b>🙂</b>Minor</button>
        <button type="button" data-s="2" class="on"><b>😐</b>Moderate</button>
        <button type="button" data-s="3"><b>⚠️</b>Dangerous</button>
      </div></div>

    <div class="field"><label for="rLabel">Landmark</label>
      <input type="text" id="rLabel" maxlength="80" placeholder="e.g. 100 Feet Road, near the bakery" /></div>
    <div class="field"><label for="rNote">Details (optional)</label>
      <textarea id="rNote" maxlength="280" placeholder="Depth, hazards, how long it's been there…"></textarea></div>

    <button class="btn primary" id="rSubmit" type="button">Submit report</button>
    <button class="btn ghost" onclick="closeModal()" type="button">Cancel</button>
  `);

  $('rGoDup')?.addEventListener('click', () => { closeModal(); selectPothole(dup.id); });

  $('rFile').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      photoData = await compressImage(f);
      $('rPrev').innerHTML = `<img src="${photoData}" alt="preview" />`;
    } catch (_) { toast('Could not read that image', 'warn'); }
  });

  $('rSev').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    severity = Number(b.dataset.s);
    [...$('rSev').children].forEach(x => x.classList.toggle('on', x === b));
  });

  $('rSubmit').addEventListener('click', () => {
    try {
      const p = createPothole({
        lat: latlng.lat, lng: latlng.lng, severity, photo: photoData,
        label: $('rLabel').value.trim(), note: $('rNote').value.trim()
      });
      closeModal();
      selectPothole(p.id);
      toast('Reported! Now get neighbours to fund it 💰', 'ok');
    } catch (ex) { toast(ex.message, 'err'); }
  });
}

/* ------------------------- SEARCH ------------------------- */
const searchInput   = $('searchInput');
const searchClear   = $('searchClear');
const searchResults = $('searchResults');
const locBtn        = $('locBtn');

async function searchPlaces(query) {
  const url = 'https://nominatim.openstreetmap.org/search?' +
    new URLSearchParams({ q: query, format: 'json', limit: 6, addressdetails: 1 });
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('Search failed');
  return res.json();
}

function renderSearchResults(items) {
  if (!items.length) {
    searchResults.innerHTML = `<div class="searchItem empty">No places found</div>`;
  } else {
    searchResults.innerHTML = items.map((it, i) => {
      const parts = it.display_name.split(',');
      return `<div class="searchItem" data-idx="${i}">
        <div class="primary">${esc(parts[0])}</div>
        <div class="secondary">${esc(parts.slice(1).join(',').trim())}</div></div>`;
    }).join('');
    searchResults.querySelectorAll('.searchItem[data-idx]').forEach(el =>
      el.addEventListener('click', () => goToSearchResult(items[Number(el.dataset.idx)])));
  }
  searchResults.classList.add('open');
}

function goToSearchResult(item) {
  const lat = parseFloat(item.lat), lng = parseFloat(item.lon);
  if (searchMarker) map.removeLayer(searchMarker);
  searchMarker = L.marker([lat, lng], {
    icon: L.divIcon({ className: '', html: `<div class="searchPin"><span>📍</span></div>`,
      iconSize: [26, 26], iconAnchor: [13, 26] })
  }).addTo(map).bindPopup(esc(item.display_name)).openPopup();
  map.flyTo([lat, lng], 15, { duration: 1.2 });
  searchResults.classList.remove('open');
  searchInput.value = item.display_name.split(',').slice(0, 2).join(',').trim();
  searchClear.style.display = 'block';
}

searchInput.addEventListener('input', e => {
  const q = e.target.value.trim();
  searchClear.style.display = q ? 'block' : 'none';
  clearTimeout(searchTimer);
  if (q.length < 3) return searchResults.classList.remove('open');
  searchResults.innerHTML = `<div class="searchItem loading">Searching…</div>`;
  searchResults.classList.add('open');
  searchTimer = setTimeout(async () => {
    try { renderSearchResults(await searchPlaces(q)); }
    catch (_) { searchResults.innerHTML = `<div class="searchItem empty">Couldn't reach search service</div>`; }
  }, 500);
});

searchInput.addEventListener('keydown', async e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const q = searchInput.value.trim();
    if (q.length < 3) return;
    try { const items = await searchPlaces(q); if (items.length) goToSearchResult(items[0]); }
    catch (_) { toast("Couldn't reach search service", 'warn'); }
  }
  if (e.key === 'Escape') searchResults.classList.remove('open');
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.style.display = 'none';
  searchResults.classList.remove('open');
  if (searchMarker) { map.removeLayer(searchMarker); searchMarker = null; }
});
document.addEventListener('click', e => {
  if (!e.target.closest('.searchWrap')) searchResults.classList.remove('open');
});

/* ------------------------- LOCATE ME ------------------------- */
function dropMeMarker(lat, lng, accuracy) {
  if (meMarker) map.removeLayer(meMarker);
  if (meCircle) map.removeLayer(meCircle);
  meMarker = L.marker([lat, lng], {
    icon: L.divIcon({ className: '', html: `<div class="meMarker"></div>`,
      iconSize: [20, 20], iconAnchor: [10, 10] }),
    zIndexOffset: 1000
  }).addTo(map).bindPopup('You are here');
  if (accuracy && accuracy > 20) {
    meCircle = L.circle([lat, lng], { radius: accuracy, color: '#3b82f6',
      fillColor: '#3b82f6', fillOpacity: 0.12, weight: 1 }).addTo(map);
  }
}

function locate({ report = false } = {}) {
  if (!navigator.geolocation) return toast('Geolocation is not supported by this browser', 'warn');
  locBtn.classList.add('loading');
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude: lat, longitude: lng, accuracy } = pos.coords;
    lastPos = { lat, lng, accuracy };
    dropMeMarker(lat, lng, accuracy);
    map.flyTo([lat, lng], 16, { duration: 1.2 });
    if (searchMarker) { map.removeLayer(searchMarker); searchMarker = null; }
    searchResults.classList.remove('open');
    locBtn.classList.remove('loading');
    toast(`Located you (±${Math.round(accuracy)}m)`, 'ok');
    if (report) openReportModal({ lat, lng });
  }, err => {
    locBtn.classList.remove('loading');
    toast({ 1: 'Location permission denied', 2: 'Location unavailable', 3: 'Location timed out' }[err.code]
      || 'Could not get your location', 'warn');
  }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
}
locBtn.addEventListener('click', () => locate());

$('reportHereBtn').addEventListener('click', () => {
  const u = me();
  if (!u) return exitApp();
  if (u.role !== 'citizen') return toast('Only citizens can report potholes', 'warn');
  locate({ report: true });
});
