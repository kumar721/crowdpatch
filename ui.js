/* CrowdPatch — modal + PIN pad */
function openModal(html) {
  const root = $('modalRoot');
  root.innerHTML = `<div class="backdrop"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
  root.classList.add('open');
  root.querySelector('.backdrop').addEventListener('click', e => {
    if (e.target.classList.contains('backdrop')) closeModal();
  });
}
function closeModal() {
  $('modalRoot').classList.remove('open');
  $('modalRoot').innerHTML = '';
}
window.closeModal = closeModal;

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeDrawer(); }
});

function promptPin({ title, subtitle, amount, onSuccess }) {
  let pin = '', busy = false;
  const dotsHtml = () => [0, 1, 2, 3].map(i => `<span class="${i < pin.length ? 'on' : ''}"></span>`).join('');
  const padHtml  = () =>
    [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button type="button" data-n="${n}">${n}</button>`).join('') +
    `<button type="button" data-act="clear" aria-label="Backspace">⌫</button>` +
    `<button type="button" data-n="0">0</button><button type="button" data-act="ok" aria-label="Confirm">✓</button>`;

  openModal(`
    <h3>🔒 ${esc(title || 'Confirm payment')}</h3>
    <p class="sub">${esc(subtitle || 'Enter your 4-digit PIN to authorise')}</p>
    ${amount != null ? `<div class="paySummary"><div class="row total"><span>Amount</span><span>${inr(amount)}</span></div></div>` : ''}
    <div class="pinDots" id="pinDots">${dotsHtml()}</div>
    <div class="pinPad" id="pinPad">${padHtml()}</div>
    <div class="authErr" id="pinErr"></div>
    <button class="btn ghost" id="pinCancel" type="button">Cancel</button>
  `);

  const dots = $('pinDots'), err = $('pinErr');
  const redraw = () => { dots.innerHTML = dotsHtml(); };

  async function submit() {
    if (busy) return;
    busy = true;
    err.textContent = '';
    try {
      await Auth.verifyPin(me().id, pin);
      closeModal();
      onSuccess();
    } catch (ex) {
      err.textContent = ex.message;
      pin = '';
      redraw();
    } finally { busy = false; }
  }

  function press(key) {
    if (key === 'Backspace') { pin = pin.slice(0, -1); return redraw(); }
    if (key === 'Enter')     { if (pin.length === 4) submit(); else err.textContent = 'Enter 4 digits'; return; }
    if (/^\d$/.test(key) && pin.length < 4) {
      pin += key; redraw();
      if (pin.length === 4) setTimeout(submit, 120);
    }
  }

  $('pinPad').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.act === 'clear') return press('Backspace');
    if (b.dataset.act === 'ok')    return press('Enter');
    press(b.dataset.n);
  });

  // Physical keyboard support (removed when the modal closes)
  const onKey = e => {
    if (!$('pinPad')) return document.removeEventListener('keydown', onKey);
    if (e.key === 'Backspace' || e.key === 'Enter' || /^\d$/.test(e.key)) press(e.key);
  };
  document.addEventListener('keydown', onKey);

  $('pinCancel').addEventListener('click', closeModal);
}
