/* CrowdPatch — sidebar list, stats, legend, drawer, header */
function renderMe() {
  const u = me();
  if (!u) return;
  $('meEmoji').textContent = u.emoji || '🙂';
  $('meName').textContent  = u.name;
  $('meRole').textContent  = u.role;
  $('walletAmt').textContent = inr(Wallet.balanceOf(u.id));
  $('addMoneyBtn').style.display = u.role === 'citizen' ? '' : 'none';
  $('reportBtn').style.display     = u.role === 'citizen' ? '' : 'none';
  $('reportHereBtn').style.display = u.role === 'citizen' ? '' : 'none';
}

function renderLegend() {
  $('legend').innerHTML = Object.values(STATUS).map(s =>
    `<div><span class="dot" style="background:${s.color}"></span>${s.label}</div>`).join('');
}

function renderStats() {
  const total  = state.potholes.length;
  const fixed  = state.potholes.filter(p => p.status === 'fixed').length;
  const pooled = state.potholes.reduce((a, p) => a + p.bounty, 0);
  const open   = total - fixed;
  $('stats').innerHTML = `
    <div class="stat t"><div class="v">${total}</div><div class="l">Reported</div></div>
    <div class="stat a"><div class="v">${open}</div><div class="l">Open</div></div>
    <div class="stat g"><div class="v">${fixed}</div><div class="l">Fixed</div></div>
    <div class="stat p"><div class="v">${inr(pooled)}</div><div class="l">Pooled</div></div>`;
}

function visiblePotholes() {
  const f = $('filter').value;
  const q = $('listSearch').value.trim().toLowerCase();
  const sortBy = $('sort').value;
  const order = { reported: 0, funded: 1, in_repair: 2, fixed: 3 };
  return state.potholes
    .filter(p => f === 'all' || p.status === f)
    .filter(p => !q || p.label.toLowerCase().includes(q) || (p.note || '').toLowerCase().includes(q))
    .sort((a, b) => {
      if (sortBy === 'severity') return b.severity - a.severity || new Date(b.createdAt) - new Date(a.createdAt);
      if (sortBy === 'bounty')   return b.bounty - a.bounty;
      if (sortBy === 'newest')   return new Date(b.createdAt) - new Date(a.createdAt);
      return order[a.status] - order[b.status] || new Date(b.createdAt) - new Date(a.createdAt);
    });
}

function renderList() {
  const items = visiblePotholes();
  const el = $('list');
  if (!items.length) {
    el.innerHTML = `<div class="empty">No potholes match.<br/>Try another filter or report one on the map.</div>`;
    return;
  }
  el.innerHTML = items.map(p => {
    const st = STATUS[p.status], g = goalOf(p);
    const pct = Math.min(100, Math.round((p.bounty / g) * 100));
    return `
      <div class="card ${p.id === currentId ? 'sel' : ''}" data-id="${p.id}" tabindex="0" role="button">
        <img src="${p.photo || ''}" alt="" />
        <div class="info">
          <div class="top"><span class="name">${esc(p.label)}</span>
            <span class="chip" style="background:${st.color};color:#08111a">${st.label}</span></div>
          <div class="sub">${SEVERITY_LABEL[p.severity]} · ${ago(p.createdAt)}</div>
          <div class="bar"><i style="width:${pct}%;background:${st.color}"></i></div>
          <div class="barTxt"><span>${inr(p.bounty)} / ${inr(g)}</span><span>${pct}%</span></div>
        </div>
      </div>`;
  }).join('');
  el.querySelectorAll('.card').forEach(c => {
    c.addEventListener('click', () => selectPothole(c.dataset.id));
    c.addEventListener('keydown', e => { if (e.key === 'Enter') selectPothole(c.dataset.id); });
  });
}

/* ------------------------- DRAWER ------------------------- */
function selectPothole(id) {
  currentId = id;
  renderDrawer();
  $('drawer').classList.add('open');
  renderList();
  const p = byId(id);
  if (p && markers[id]) map.panTo([p.lat, p.lng], { animate: true });
}
function closeDrawer() {
  currentId = null;
  $('drawer').classList.remove('open');
  renderList();
}

function renderDrawer() {
  const el = $('drawerInner');
  const p = currentId ? byId(currentId) : null;
  const u = me();
  if (!p || !u) { el.innerHTML = ''; return; }

  const st = STATUS[p.status], g = goalOf(p);
  const pct = Math.min(100, Math.round((p.bounty / g) * 100));
  const reporter = userOf(p.reporterId);
  const fixer = p.fixerId ? userOf(p.fixerId) : null;
  const myPledge = p.pledges.find(x => x.userId === u.id);
  const isCitizen = u.role === 'citizen', isFixer = u.role === 'fixer';
  const canVerify = isCitizen && p.status === 'in_repair' && p.afterPhoto &&
    p.reporterId !== u.id && !p.verifications.some(v => v.userId === u.id);
  const canPledge = isCitizen && p.status !== 'fixed' && p.status !== 'in_repair';
  const mine = isFixer && p.fixerId === u.id;

  el.innerHTML = `
    <div class="dHead">
      <img src="${p.photo || ''}" alt="Pothole photo" />
      <button class="dClose" id="dClose" type="button" aria-label="Close">✕</button>
      <span class="chip dBadge" style="background:${st.color};color:#08111a">${st.label}</span>
      <span class="dSev">${p.severity === 3 ? '⚠️ ' : ''}${SEVERITY_LABEL[p.severity]} · goal ${inr(g)}</span>
    </div>
    <div class="dBody">
      <div class="dTitle">${esc(p.label)}</div>
      <div class="dMeta">
        Reported by ${reporter.emoji || '👤'} ${esc(reporter.name)} · ${ago(p.createdAt)}<br/>
        ${p.note ? esc(p.note) : ''}
      </div>
      <a class="btn ghost" target="_blank" rel="noopener"
         href="https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=18/${p.lat}/${p.lng}"
         style="text-decoration:none">🧭 Open in maps</a>

      ${p.status === 'fixed' ? `<div class="success"><div class="t">✅ Repaired & community-verified</div>
        <div class="s">${inr(p.bounty)} paid to ${fixer ? esc(fixer.name) : 'the fixer'} · closed ${ago(p.fixedAt)}</div></div>` : ''}

      <div class="box">
        <div class="boxTitle">Community bounty</div>
        <div class="amt"><span class="big">${inr(p.bounty)}</span><span class="goal">of ${inr(g)}</span></div>
        <div class="bar"><i style="width:${pct}%;background:${st.color}"></i></div>
        <div class="barTxt"><span>${pct}% funded</span>
          <span>${p.pledges.length} backer${p.pledges.length === 1 ? '' : 's'}</span></div>
        ${p.pledges.length ? `<div class="pledgers">${p.pledges.map(pl => {
          const usr = userOf(pl.userId);
          return `<span class="pledger">${usr.emoji || '👤'} ${esc(usr.name)} · ${inr(pl.amount)}</span>`;
        }).join('')}</div>` : ''}

        ${canPledge ? `
          <div class="pledgeRow">
            ${[25, 50, 100, 250].map(a => `<button type="button" data-amt="${a}">₹${a}</button>`).join('')}
          </div>
          <div class="customPledge">
            <input type="tel" id="customAmt" inputmode="numeric" placeholder="Custom ₹" maxlength="5" />
            <button class="btn ghost" id="customBtn" type="button">Pledge</button>
          </div>
          <div class="barTxt" style="margin-top:9px">
            <span>Wallet: ${inr(Wallet.balanceOf(u.id))}</span><span>🔒 PIN required</span></div>
          ${myPledge ? `<div class="barTxt"><span>You've pledged ${inr(myPledge.amount)}</span></div>` : ''}` : ''}
      </div>

      <div class="box">
        <div class="boxTitle">Repair & verification</div>
        <div class="verifList">
          <div class="verif"><span class="tick">✓</span> Reported by a resident</div>
          <div class="verif"><span class="tick ${p.status === 'reported' ? 'pending' : ''}">${p.status === 'reported' ? '○' : '✓'}</span> Bounty funded</div>
          <div class="verif"><span class="tick ${['reported', 'funded'].includes(p.status) ? 'pending' : ''}">${['reported', 'funded'].includes(p.status) ? '○' : '✓'}</span>
            ${fixer ? `Claimed by ${esc(fixer.name)}` : 'Claimed by a fixer'}</div>
          ${Array.from({ length: VERIFY_NEEDED }).map((_, i) => {
            const v = p.verifications[i];
            return `<div class="verif"><span class="tick ${v ? '' : 'pending'}">${v ? '✓' : '○'}</span>
              ${v ? `Verified by ${esc(userOf(v.userId).name)}` : `Awaiting verification ${i + 1}`}</div>`;
          }).join('')}
        </div>
        ${p.afterPhoto ? `<div style="margin-top:14px"><div class="boxTitle">Before / After</div>
          <div class="compare">
            <figure><img src="${p.photo}" alt="before"/><figcaption>Before</figcaption></figure>
            <figure><img src="${p.afterPhoto}" alt="after"/><figcaption>After</figcaption></figure>
          </div></div>` : ''}
      </div>

      ${isFixer && p.status === 'funded' ? `<button class="btn purple" id="aClaim" type="button">🔧 Claim this repair · ${inr(p.bounty)}</button>` : ''}
      ${mine && p.status === 'in_repair' && !p.afterPhoto ? `
        <input type="file" accept="image/*" id="aAfter" style="display:none" />
        <button class="btn purple" id="aUpload" type="button">📷 Upload after photo</button>
        <button class="btn ghost" id="aRelease" type="button">Release this claim</button>` : ''}
      ${isFixer && p.status === 'in_repair' && !mine ? `<div class="note">Another fixer has claimed this repair.</div>` : ''}
      ${isCitizen && p.status === 'in_repair' && !p.afterPhoto ? `<div class="note">⏳ Waiting for the fixer to upload proof of repair.</div>` : ''}
      ${canVerify ? `<button class="btn green" id="aVerify" type="button">✅ I confirm this is fixed</button>` : ''}
      ${isCitizen && p.status === 'in_repair' && p.afterPhoto && p.reporterId === u.id ? `<div class="note">You reported this — someone else must verify it.</div>` : ''}
      ${p.status === 'fixed' ? `<div class="note">This repair is closed. Thanks for keeping the street safe 🎉</div>` : ''}
    </div>`;

  $('dClose').addEventListener('click', closeDrawer);
  el.querySelectorAll('.pledgeRow button').forEach(b =>
    b.addEventListener('click', () => startPledge(p.id, Number(b.dataset.amt))));
  $('customAmt')?.addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, ''); });
  $('customBtn')?.addEventListener('click', () => startPledge(p.id, Number($('customAmt').value)));
  $('aClaim')?.addEventListener('click', () => claim(p.id));
  $('aRelease')?.addEventListener('click', () => releaseClaim(p.id));
  $('aUpload')?.addEventListener('click', () => $('aAfter').click());
  $('aAfter')?.addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    try { uploadAfter(p.id, await compressImage(f)); }
    catch (_) { toast('Could not read that image', 'warn'); }
  });
  $('aVerify')?.addEventListener('click', () => verify(p.id));
}

/** Validate, then ask for the PIN; money only moves inside onSuccess. */
function startPledge(id, amount) {
  const u = me(), p = byId(id);
  if (!u) return exitApp();
  if (!p) return;
  if (u.role !== 'citizen') return toast('Only citizens can pledge', 'warn');
  if (!Number.isInteger(amount) || amount < 1) return toast('Enter a whole amount of ₹1 or more', 'warn');
  const balance = Wallet.balanceOf(u.id);
  if (amount > balance) return toast(`Insufficient balance. You have ${inr(balance)}.`, 'err');
  promptPin({
    title: 'Confirm pledge',
    subtitle: `Pledge ${inr(amount)} to "${p.label}"`,
    amount,
    onSuccess: () => { applyPledge(p.id, amount); renderMe(); }
  });
}

function renderAll() {
  renderStats();
  renderList();
  renderMarkers();
  renderMe();
}
