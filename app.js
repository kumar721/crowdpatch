/* CrowdPatch — auth UI, app shell, boot */
let activeRole = 'citizen';
let authMode   = 'login';

const authScreen = $('authScreen');
const app        = $('app');
const authForm   = $('authForm');
const authErr    = $('authErr');
const authSubmit = $('authSubmit');

function submitLabel() {
  const r = activeRole === 'fixer' ? 'Fixer' : 'Citizen';
  return authMode === 'register' ? `Create ${r} account` : `Log in as ${r}`;
}

document.querySelectorAll('.roleCard').forEach(card => {
  card.addEventListener('click', () => {
    activeRole = card.dataset.role;
    document.querySelectorAll('.roleCard').forEach(c => c.classList.toggle('on', c === card));
    authSubmit.textContent = submitLabel();
  });
});

document.querySelectorAll('.authTab').forEach(t => {
  t.addEventListener('click', () => {
    authMode = t.dataset.tab;
    document.querySelectorAll('.authTab').forEach(x => x.classList.toggle('active', x === t));
    $('rowName').style.display = authMode === 'register' ? 'block' : 'none';
    $('rowPin').style.display  = authMode === 'register' ? 'block' : 'none';
    $('pwInput').autocomplete = authMode === 'register' ? 'new-password' : 'current-password';
    authSubmit.textContent = submitLabel();
    authErr.textContent = '';
  });
});

$('pwInput').addEventListener('input', e => {
  const v = e.target.value;
  let s = 0;
  if (v.length >= 8) s++;
  if (/[A-Z]/.test(v)) s++;
  if (/[a-z]/.test(v)) s++;
  if (/\d/.test(v)) s++;
  if (/[^A-Za-z0-9]/.test(v)) s++;
  const bar = $('pwStrength').firstElementChild;
  bar.style.width = (s * 20) + '%';
  bar.style.background = ['#ef4444', '#f59e0b', '#f59e0b', '#10b981', '#10b981'][Math.max(0, s - 1)];
});

authForm.addEventListener('submit', async e => {
  e.preventDefault();
  authErr.textContent = '';
  authSubmit.disabled = true;
  authSubmit.textContent = 'Please wait…';
  const form = new FormData(e.target);
  const username = (form.get('username') || '').trim();
  const password = form.get('password');
  try {
    const session = authMode === 'register'
      ? await Auth.register({ username, password, name: (form.get('name') || '').trim(),
                              role: activeRole, pin: form.get('pin') })
      : await Auth.login({ username, password, role: activeRole });
    authForm.reset();
    state = loadState();
    toast(`Welcome, ${session.user.name}!`, 'ok');
    enterApp();
  } catch (err) {
    authErr.textContent = err.message;
  } finally {
    authSubmit.disabled = false;
    authSubmit.textContent = submitLabel();
  }
});

$('logoutBtn').addEventListener('click', () => {
  Auth.logout();
  exitApp();
  toast('Logged out');
});

$('resetDemoBtn').addEventListener('click', () => {
  if (confirm('Reset ALL demo data (accounts, potholes, wallets) in this browser?')) resetDemo();
});

function enterApp() {
  authScreen.classList.add('hide');
  app.style.display = 'flex';
  renderAll();
  [0, 100, 300, 700].forEach(ms => setTimeout(refreshMap, ms));
}

function exitApp() {
  setReportMode(false);
  app.style.display = 'none';
  authScreen.classList.remove('hide');
  closeDrawer();
  closeModal();
  state = loadState();
}

['filter', 'sort'].forEach(id => $(id).addEventListener('change', renderList));
$('listSearch').addEventListener('input', renderList);

// Keep tabs in sync: another tab changed potholes / wallets
window.addEventListener('storage', e => {
  if (![KEY, AUTH_KEY, LEDGER_KEY].includes(e.key) || !me()) return;
  state = loadState();
  renderAll();
  if (currentId) renderDrawer();
});

// Auto-logout when the session expires
setInterval(() => {
  if (app.style.display !== 'none' && !Auth.current()) {
    exitApp();
    toast('Session expired — please log in again', 'warn');
  }
}, 30000);

(async function boot() {
  if (!window.crypto || !crypto.subtle) {
    authErr.textContent = 'This app needs a secure context (https:// or localhost).';
    authSubmit.disabled = true;
    return;
  }
  await ensureSeedAccounts();
  renderLegend();
  if (Auth.current()) enterApp();
  window.addEventListener('load', refreshMap);
})();
