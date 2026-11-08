/* CrowdPatch — wallet ledger view, change PIN, simulated top-up gateway.
   This is a DEMO gateway: no real money moves and no real card data is collected. */

/* ------------------------- LEDGER MODAL ------------------------- */
$('walletBtn').addEventListener('click', () => {
  const u = me();
  if (!u) return;
  const entries = Wallet.ledger().filter(e => e.userId === u.id).slice().reverse();
  const labels = { topup: '💰 Wallet top-up', pledge: '🎯 Pledge', payout: '🏆 Payout received', refund: '↩ Refund' };

  const rows = entries.length ? entries.map(e => `
    <div class="ledgerRow">
      <div><div class="kind">${labels[e.kind] || esc(e.kind)}</div>
        <div class="meta">${ago(e.at)} · ${esc(e.note || '')}</div></div>
      <div class="lamt ${e.amount >= 0 ? 'pos' : 'neg'}">${e.amount >= 0 ? '+' : '−'}${inr(Math.abs(e.amount))}</div>
    </div>`).join('') : `<div class="note">No transactions yet.</div>`;

  openModal(`
    <h3>Wallet & ledger</h3>
    <p class="sub">Available balance: <b style="color:#5eead4">${inr(Wallet.balanceOf(u.id))}</b></p>
    ${u.role === 'citizen' ? `<button class="btn blue" id="topUpFromLedger" type="button">＋ Add money to wallet</button>` : ''}
    <div class="box" style="margin-top:10px;max-height:300px;overflow-y:auto">${rows}</div>
    <button class="btn ghost" id="exportCsv" type="button">⬇ Export CSV</button>
    <button class="btn ghost" id="changePin" type="button">🔑 Change PIN</button>
    <button class="btn ghost" onclick="closeModal()" type="button">Close</button>
  `);

  $('topUpFromLedger')?.addEventListener('click', () => { closeModal(); openAddMoneyStep1(); });
  $('exportCsv').addEventListener('click', () =>
    downloadFile(`crowdpatch-ledger-${u.username}.csv`, Wallet.csvFor(u.id), 'text/csv'));
  $('changePin').addEventListener('click', openChangePin);
});

function openChangePin() {
  openModal(`
    <h3>🔑 Change PIN</h3>
    <p class="sub">Your PIN authorises every pledge and top-up.</p>
    <div class="field"><label for="oldPin">Current PIN</label>
      <input type="password" id="oldPin" inputmode="numeric" maxlength="4" autocomplete="off" /></div>
    <div class="field"><label for="newPin">New PIN</label>
      <input type="password" id="newPin" inputmode="numeric" maxlength="4" autocomplete="off" /></div>
    <div class="authErr" id="pinChgErr"></div>
    <button class="btn primary" id="pinChgGo" type="button">Update PIN</button>
    <button class="btn ghost" onclick="closeModal()" type="button">Cancel</button>
  `);
  $('pinChgGo').addEventListener('click', async () => {
    try {
      await Auth.changePin(me().id, $('oldPin').value, $('newPin').value);
      closeModal();
      toast('PIN updated', 'ok');
    } catch (ex) { $('pinChgErr').textContent = ex.message; }
  });
}

/* ------------------------- TOP-UP FLOW ------------------------- */
$('addMoneyBtn').addEventListener('click', () => {
  const u = me();
  if (!u) return exitApp();
  if (u.role !== 'citizen') return toast('Only citizens can add money to a wallet', 'warn');
  openAddMoneyStep1();
});

function openAddMoneyStep1() {
  let amount = 500;
  openModal(`
    <h3>💰 Add money to wallet</h3>
    <p class="sub">Top up your CrowdPatch balance to fund pothole repairs.</p>
    <div class="note">Demo mode — no real payment is made.</div>
    <div class="field"><label>Quick amounts</label>
      <div class="pmtAmounts" id="amtGrid">
        ${[100, 500, 1000, 2000].map(a => `<button type="button" data-a="${a}" class="${a === 500 ? 'on' : ''}">${inr(a)}</button>`).join('')}
      </div></div>
    <div class="field"><label for="amtInput">Or enter amount</label>
      <div class="pmtCustom"><input type="tel" id="amtInput" inputmode="numeric" value="500" /></div>
      <div class="hintTxt">Min ${inr(MIN_TOPUP)} · Max ${inr(MAX_TOPUP)} per transaction</div></div>
    <button class="btn primary" id="pmtContinue" type="button">Continue to pay ${inr(500)}</button>
    <button class="btn ghost" onclick="closeModal()" type="button">Cancel</button>
  `);

  const input = $('amtInput'), go = $('pmtContinue'), grid = $('amtGrid');
  const sync = () => {
    go.textContent = `Continue to pay ${inr(amount)}`;
    input.value = amount || '';
    [...grid.children].forEach(b => b.classList.toggle('on', Number(b.dataset.a) === amount));
  };
  grid.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) { amount = Number(b.dataset.a); sync(); }
  });
  input.addEventListener('input', e => { amount = Number(e.target.value.replace(/\D/g, '')) || 0; sync(); });
  go.addEventListener('click', () => {
    if (amount < MIN_TOPUP) return toast(`Minimum is ${inr(MIN_TOPUP)}`, 'warn');
    if (amount > MAX_TOPUP) return toast(`Maximum is ${inr(MAX_TOPUP)}`, 'warn');
    openAddMoneyStep2(amount);
  });
}

function openAddMoneyStep2(amount) {
  let method = 'upi', upiApp = 'gpay', bank = '';

  function renderBody() {
    const body = $('pmtBody');
    if (method === 'upi') {
      body.innerHTML = `<div class="pmtBody">
        <label class="miniLbl">Choose a UPI app</label>
        <div class="upiApps">${UPI_APPS.map(a => `
          <div class="upiApp ${a.id === upiApp ? 'on' : ''}" data-app="${a.id}">
            <span class="ic">${a.icon}</span><span class="nm">${a.name}</span></div>`).join('')}</div>
        <div class="divider">or</div>
        <div class="field"><label for="upiIdInput">Enter UPI ID</label>
          <input type="text" id="upiIdInput" placeholder="yourname@bank" autocomplete="off" /></div>
        <div class="secureNote">🧪 Simulated gateway · nothing is charged</div></div>`;
      body.querySelectorAll('.upiApp').forEach(el => el.addEventListener('click', () => {
        upiApp = el.dataset.app;
        $('upiIdInput').value = '';
        body.querySelectorAll('.upiApp').forEach(x => x.classList.toggle('on', x === el));
      }));
      $('upiIdInput').addEventListener('input', e => {
        if (e.target.value.trim()) { upiApp = ''; body.querySelectorAll('.upiApp').forEach(x => x.classList.remove('on')); }
      });
    } else if (method === 'card') {
      body.innerHTML = `<div class="pmtBody">
        <div class="note">This demo never asks for real card details.<br/>
          A test card <b>•••• 4242</b> will be used.</div>
        <div class="secureNote">🧪 Simulated gateway · nothing is charged</div></div>`;
    } else {
      body.innerHTML = `<div class="pmtBody">
        <label class="miniLbl">Choose your bank</label>
        <div class="bankGrid">${BANKS.map(b => `
          <button class="bankTile ${b.id === bank ? 'on' : ''}" type="button" data-bank="${b.id}">🏛️ ${b.name}</button>`).join('')}</div>
        <div class="secureNote">🧪 Simulated gateway · no redirect happens</div></div>`;
      body.querySelectorAll('.bankTile').forEach(el => el.addEventListener('click', () => {
        bank = el.dataset.bank;
        body.querySelectorAll('.bankTile').forEach(x => x.classList.toggle('on', x === el));
      }));
    }
  }

  openModal(`
    <h3>Pay ${inr(amount)}</h3>
    <p class="sub">Choose how you'd like to pay.</p>
    <div class="pmtTabs" id="pmtTabs">
      <div class="pmtTab active" data-m="upi"><span class="ic">📱</span>UPI</div>
      <div class="pmtTab" data-m="card"><span class="ic">💳</span>Card</div>
      <div class="pmtTab" data-m="netbank"><span class="ic">🏦</span>Net Banking</div>
    </div>
    <div id="pmtBody"></div>
    <button class="btn primary" id="payNow" type="button">Pay ${inr(amount)}</button>
    <button class="btn ghost" id="backBtn" type="button">← Back</button>
  `);

  $('pmtTabs').addEventListener('click', e => {
    const t = e.target.closest('.pmtTab');
    if (!t) return;
    method = t.dataset.m;
    document.querySelectorAll('#pmtTabs .pmtTab').forEach(x => x.classList.toggle('active', x === t));
    renderBody();
  });
  $('backBtn').addEventListener('click', openAddMoneyStep1);
  renderBody();

  $('payNow').addEventListener('click', () => {
    let label;
    if (method === 'upi') {
      const typed = ($('upiIdInput').value || '').trim();
      if (typed) {
        if (!/^[\w.\-]{3,}@[a-z]{3,}$/i.test(typed)) return toast('Invalid UPI ID format (example@bank)', 'warn');
        label = `UPI · ${typed}`;
      } else if (upiApp) {
        label = `UPI · ${UPI_APPS.find(a => a.id === upiApp).name}`;
      } else return toast('Choose a UPI app or enter your UPI ID', 'warn');
    } else if (method === 'card') {
      label = 'Demo card ending 4242';
    } else {
      if (!bank) return toast('Choose your bank', 'warn');
      label = 'Net Banking · ' + BANKS.find(b => b.id === bank).name;
    }
    promptPin({
      title: 'Authorise top-up',
      subtitle: `Enter your CrowdPatch PIN to confirm ${inr(amount)}`,
      amount,
      onSuccess: () => processPayment({ amount, method, label })
    });
  });
}

function processPayment({ amount, method, label }) {
  openModal(`<div class="processing"><div class="spinner"></div>
    <h3>Processing payment…</h3>
    <p>Contacting ${method === 'upi' ? 'your UPI app' : method === 'card' ? 'your card issuer' : 'your bank'} (simulated).</p></div>`);

  setTimeout(() => {
    if (Math.random() < 0.10) return paymentFailed('Payment declined by the demo gateway. Try another method.');
    const ref = 'CP' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
    try {
      Wallet.move({ userId: me().id, kind: 'topup', amount, note: label, idempotencyKey: 'topup_' + ref });
      Auth.log(me().id, 'wallet_topup', { amount, method, ref });
    } catch (ex) { return paymentFailed(ex.message); }
    renderMe();
    paymentSuccess(amount, ref, label);
  }, 1500);
}

function paymentSuccess(amount, ref, label) {
  openModal(`<div class="paySuccess"><div class="tick">✓</div>
    <h3>Payment successful</h3><p>Your wallet has been topped up.</p>
    <div class="receipt">
      <div class="row"><span>Amount</span><b>${inr(amount)}</b></div>
      <div class="row"><span>Method</span><b>${esc(label)}</b></div>
      <div class="row"><span>New balance</span><b>${inr(Wallet.balanceOf(me().id))}</b></div>
      <div class="row"><span>Status</span><b style="color:#10b981">SUCCESS</b></div>
      <div class="row ref"><span>Ref</span><b>${esc(ref)}</b></div></div>
    <button class="btn primary" onclick="closeModal()" type="button">Done</button></div>`);
  toast(`Added ${inr(amount)} to wallet`, 'ok');
}

function paymentFailed(reason) {
  openModal(`<div class="paySuccess">
    <div class="tick" style="background:linear-gradient(135deg,#ef4444,#b91c1c);box-shadow:0 12px 34px rgba(239,68,68,.45)">✕</div>
    <h3>Payment failed</h3><p>${esc(reason)}</p>
    <button class="btn primary" onclick="closeModal()" type="button">Close</button></div>`);
  toast('Payment failed — try another method', 'err');
}
