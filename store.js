/* CrowdPatch — pothole dataset + business actions */
let state = loadState();
let currentId = null;

const byId   = id => state.potholes.find(p => p.id === id);
const userOf = id => Auth.findById(id) || { name: 'Someone', emoji: '👤', role: 'citizen' };

function seedData() {
  const now = Date.now(), H = 3600 * 1000;
  return {
    potholes: [
      { id: uid(), lat: 12.9757, lng: 77.6068, label: 'MG Road, near Trinity Circle',
        note: 'Deep crater right at the signal. Two-wheelers swerve into traffic.',
        severity: 3, status: 'reported', reporterId: 'u_aarav',
        createdAt: new Date(now - 5 * H).toISOString(), photo: roadPhoto('MG Road · reported'),
        pledges: [
          { userId: 'u_meera', amount: 70, at: new Date(now - 4 * H).toISOString() },
          { userId: 'u_neha',  amount: 50, at: new Date(now - 2 * H).toISOString() }],
        bounty: 120, fixerId: null, afterPhoto: null, verifications: [], fixedAt: null },

      { id: uid(), lat: 12.9719, lng: 77.6412, label: '100 Feet Road, Indiranagar',
        note: 'Wide but shallow. Water pools here after rain.',
        severity: 2, status: 'funded', reporterId: 'u_neha',
        createdAt: new Date(now - 26 * H).toISOString(), photo: roadPhoto('Indiranagar · funded'),
        pledges: [
          { userId: 'u_aarav', amount: 80, at: new Date(now - 20 * H).toISOString() },
          { userId: 'u_meera', amount: 60, at: new Date(now - 12 * H).toISOString() },
          { userId: 'u_neha',  amount: 60, at: new Date(now - 6 * H).toISOString() }],
        bounty: 200, fixerId: null, afterPhoto: null, verifications: [], fixedAt: null },

      { id: uid(), lat: 12.9352, lng: 77.6245, label: '5th Block, Koramangala',
        note: 'Patched this morning. Awaiting community verification.',
        severity: 2, status: 'in_repair', reporterId: 'u_aarav',
        createdAt: new Date(now - 50 * H).toISOString(), photo: roadPhoto('Koramangala · in repair'),
        pledges: [
          { userId: 'u_aarav', amount: 100, at: new Date(now - 45 * H).toISOString() },
          { userId: 'u_meera', amount: 100, at: new Date(now - 40 * H).toISOString() }],
        bounty: 200, fixerId: 'u_ravi', afterPhoto: roadPhoto('After patch · by Ravi'),
        verifications: [], fixedAt: null },

      { id: uid(), lat: 12.9308, lng: 77.5838, label: '4th Block, Jayanagar',
        note: 'Repaired and verified by two residents. Payout released.',
        severity: 1, status: 'fixed', reporterId: 'u_meera',
        createdAt: new Date(now - 96 * H).toISOString(), photo: roadPhoto('Jayanagar · before'),
        pledges: [
          { userId: 'u_meera', amount: 60, at: new Date(now - 90 * H).toISOString() },
          { userId: 'u_neha',  amount: 40, at: new Date(now - 88 * H).toISOString() }],
        bounty: 100, fixerId: 'u_ravi', afterPhoto: roadPhoto('After patch · by Ravi'),
        verifications: [
          { userId: 'u_aarav', at: new Date(now - 70 * H).toISOString() },
          { userId: 'u_neha',  at: new Date(now - 68 * H).toISOString() }],
        fixedAt: new Date(now - 68 * H).toISOString() }
    ]
  };
}

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (parsed && Array.isArray(parsed.potholes)) return parsed;
  } catch (_) {}
  return seedData();
}

function saveState() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (_) { toast('Storage full — try smaller photos', 'warn'); }
}

function commit() {
  saveState();
  renderAll();
  if (currentId) renderDrawer();
}

async function ensureSeedAccounts() {
  const db = Auth._store();
  if (db.users.length > 0) return;
  const demo = [
    { id: 'u_aarav', username: 'aarav', name: 'Aarav', role: 'citizen', emoji: '🧑‍💻' },
    { id: 'u_meera', username: 'meera', name: 'Meera', role: 'citizen', emoji: '👩‍🎓' },
    { id: 'u_neha',  username: 'neha',  name: 'Neha',  role: 'citizen', emoji: '👩‍🔬' },
    { id: 'u_ravi',  username: 'ravi',  name: 'Ravi',  role: 'fixer',   emoji: '👷'   }
  ];
  for (const d of demo) {
    const pwSalt = Hasher.salt(), pinSalt = Hasher.salt();
    db.users.push({
      ...d,
      pwSalt,  pwHash:  await Hasher.hash('Demo@1234', pwSalt),
      pinSalt, pinHash: await Hasher.hashPin('1234', pinSalt),
      failedLogins: 0, lockedUntil: null, pinFailed: 0, pinLockedUntil: null,
      wallet: d.role === 'citizen' ? STARTING_BALANCE : 0,
      createdAt: nowISO()
    });
  }
  Auth._save(db);
}

function resetDemo() {
  [KEY, AUTH_KEY, LEDGER_KEY, AUDIT_KEY].forEach(k => localStorage.removeItem(k));
  sessionStorage.removeItem(SESSION_KEY);
  location.reload();
}

/* ------------------------- ACTIONS ------------------------- */

function nearbyOpenPothole(lat, lng) {
  return state.potholes.find(p =>
    p.status !== 'fixed' && distanceM(lat, lng, p.lat, p.lng) <= DUPLICATE_RADIUS);
}

function createPothole({ lat, lng, label, note, severity, photo }) {
  const u = me();
  if (!u || u.role !== 'citizen') throw new Error('Only citizens can report potholes');
  const p = {
    id: uid(), lat, lng,
    label: (label || '').slice(0, 80) || 'Unnamed stretch of road',
    note: (note || '').slice(0, 280),
    severity, status: 'reported', reporterId: u.id, createdAt: nowISO(),
    photo: photo || roadPhoto('Reported · no photo'),
    pledges: [], bounty: 0, fixerId: null, afterPhoto: null,
    verifications: [], fixedAt: null
  };
  state.potholes.unshift(p);
  Auth.log(u.id, 'report_pothole', { id: p.id });
  commit();
  return p;
}

/** Called after the PIN has been verified. */
function applyPledge(id, amount) {
  const u = me(), p = byId(id);
  if (!u || !p) return;
  if (!Number.isInteger(amount) || amount < 1) return toast('Enter a whole amount of ₹1 or more', 'warn');
  if (p.status === 'fixed' || p.status === 'in_repair') return toast('This pothole no longer accepts pledges', 'warn');

  try {
    Wallet.move({
      userId: u.id, potholeId: p.id, kind: 'pledge', amount: -amount,
      note: `Pledge to ${p.label}`,
      idempotencyKey: 'pk_' + uid() + '_' + Date.now()
    });
  } catch (ex) { return toast(ex.message, 'err'); }

  const existing = p.pledges.find(x => x.userId === u.id);
  if (existing) existing.amount += amount;
  else p.pledges.push({ userId: u.id, amount, at: nowISO() });
  p.bounty = p.pledges.reduce((a, b) => a + b.amount, 0);

  if (p.status === 'reported' && p.bounty >= goalOf(p)) {
    p.status = 'funded';
    toast('🎉 Goal reached — this pothole is now funded!', 'ok');
  } else {
    toast(`Pledged ${inr(amount)}. Balance: ${inr(Wallet.balanceOf(u.id))}`, 'ok');
  }
  Auth.log(u.id, 'pledge', { potholeId: p.id, amount });
  commit();
}

function claim(id) {
  const u = me(), p = byId(id);
  if (!u || !p) return;
  if (u.role !== 'fixer') return toast('Only fixers can claim repairs', 'warn');
  if (p.status !== 'funded') return toast('This pothole is not funded yet', 'warn');
  p.status = 'in_repair';
  p.fixerId = u.id;
  p.afterPhoto = null;
  p.verifications = [];
  Auth.log(u.id, 'claim', { potholeId: p.id });
  commit();
  toast('🔧 Claimed! Upload the after photo when done.', 'ok');
}

function uploadAfter(id, dataUrl) {
  const u = me(), p = byId(id);
  if (!u || !p) return;
  if (p.fixerId !== u.id || p.status !== 'in_repair') return toast('Not your repair', 'warn');
  p.afterPhoto = dataUrl;
  p.verifications = [];
  Auth.log(u.id, 'upload_after', { potholeId: p.id });
  commit();
  toast('Proof uploaded — neighbours can now verify ✅', 'ok');
}

function verify(id) {
  const u = me(), p = byId(id);
  if (!u || !p) return;
  if (u.role !== 'citizen')   return toast('Only citizens can verify', 'warn');
  if (p.status !== 'in_repair') return toast('Repair is not in progress', 'warn');
  if (!p.afterPhoto)          return toast('Fixer has not uploaded proof yet', 'warn');
  if (p.reporterId === u.id)  return toast('You cannot verify your own report', 'warn');
  if (p.verifications.some(v => v.userId === u.id)) return toast('You already verified this', 'warn');

  p.verifications.push({ userId: u.id, at: nowISO() });

  if (p.verifications.length >= VERIFY_NEEDED) {
    p.status = 'fixed';
    p.fixedAt = nowISO();
    if (p.fixerId && p.bounty > 0) {
      try {
        Wallet.move({
          userId: p.fixerId, potholeId: p.id, kind: 'payout', amount: p.bounty,
          note: `Payout for ${p.label}`, idempotencyKey: 'payout_' + p.id
        });
      } catch (_) {}
    }
    toast(`✅ Verified & closed. ${inr(p.bounty)} released to ${userOf(p.fixerId).name}.`, 'ok');
    Auth.log(u.id, 'verify_close', { potholeId: p.id });
  } else {
    toast(`Verified. ${VERIFY_NEEDED - p.verifications.length} more needed.`);
    Auth.log(u.id, 'verify', { potholeId: p.id });
  }
  commit();
}

/** Fixer rejects the job before doing the work: back to funded, others can claim. */
function releaseClaim(id) {
  const u = me(), p = byId(id);
  if (!u || !p || p.fixerId !== u.id || p.status !== 'in_repair') return;
  if (p.afterPhoto) return toast('Proof already uploaded — cannot release', 'warn');
  p.status = 'funded';
  p.fixerId = null;
  Auth.log(u.id, 'release_claim', { potholeId: p.id });
  commit();
  toast('Claim released — other fixers can pick it up', 'ok');
}
