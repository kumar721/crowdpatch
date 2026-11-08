/* CrowdPatch — balance + append-only ledger (demo money, stored locally) */
const Wallet = {
  ledger() {
    try { return JSON.parse(localStorage.getItem(LEDGER_KEY) || '[]'); }
    catch (_) { return []; }
  },

  balanceOf(userId) {
    const u = Auth.findById(userId);
    return u ? (u.wallet || 0) : 0;
  },

  /** Move money. idempotencyKey stops double-clicks from double-charging. */
  move({ userId, potholeId, kind, amount, note, idempotencyKey }) {
    const db = Auth._store();
    const user = db.users.find(u => u.id === userId);
    if (!user) throw new Error('Wallet not found');
    if (!Number.isFinite(amount) || amount === 0) throw new Error('Invalid amount');

    const ledger = this.ledger();
    if (idempotencyKey && ledger.some(e => e.idempotencyKey === idempotencyKey))
      return { duplicate: true, balance: user.wallet };

    const next = +(user.wallet + amount).toFixed(2);
    if (next < 0) throw new Error('Insufficient balance');

    user.wallet = next;
    Auth._save(db);

    const entry = {
      id: uid(), userId, potholeId: potholeId || null,
      kind, amount, balanceAfter: next,
      note: note || '', idempotencyKey: idempotencyKey || null, at: nowISO()
    };
    ledger.push(entry);
    if (ledger.length > 1000) ledger.splice(0, ledger.length - 1000);
    localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
    return { duplicate: false, balance: next, entry };
  },

  /** Rows for CSV export */
  csvFor(userId) {
    const rows = this.ledger().filter(e => e.userId === userId);
    const head = 'date,type,amount,balance_after,note';
    const q = s => '"' + String(s).replace(/"/g, '""') + '"';
    return [head, ...rows.map(e =>
      [e.at, e.kind, e.amount, e.balanceAfter, q(e.note)].join(','))].join('\n');
  }
};
