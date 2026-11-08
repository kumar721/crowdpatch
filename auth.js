/* CrowdPatch — registration, login, lockout, sessions, PIN */
const Auth = {
  _store() {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      return raw ? JSON.parse(raw) : { users: [] };
    } catch (_) { return { users: [] }; }
  },
  _save(db) { localStorage.setItem(AUTH_KEY, JSON.stringify(db)); },

  findUser(username) {
    const q = String(username || '').toLowerCase();
    return this._store().users.find(u => u.username.toLowerCase() === q);
  },
  findById(id) { return this._store().users.find(u => u.id === id); },

  async register({ username, password, name, role, pin }) {
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(username || ''))
      throw new Error('Username: 3–24 letters, numbers or _');
    if (typeof password !== 'string' || password.length < MIN_PW_LEN)
      throw new Error(`Password must be at least ${MIN_PW_LEN} characters`);
    if (!/[A-Z]/.test(password) || !/[0-9]/.test(password))
      throw new Error('Password needs an uppercase letter and a number');
    if (!name || name.length > 60) throw new Error('Name required (max 60 chars)');
    if (!['citizen', 'fixer'].includes(role)) throw new Error('Invalid role');
    if (!/^\d{4}$/.test(pin || '')) throw new Error('PIN must be 4 digits');
    if (/^(\d)\1{3}$/.test(pin) || pin === '1234' || pin === '4321')
      throw new Error('Choose a less guessable PIN');

    const db = this._store();
    if (db.users.some(u => u.username.toLowerCase() === username.toLowerCase()))
      throw new Error('Username taken');

    const pwSalt  = Hasher.salt();
    const pinSalt = Hasher.salt();
    const user = {
      id: 'u_' + uid(), username, name, role,
      emoji: role === 'fixer' ? '👷' : '🧑',
      pwSalt,  pwHash:  await Hasher.hash(password, pwSalt),
      pinSalt, pinHash: await Hasher.hashPin(pin, pinSalt),
      failedLogins: 0, lockedUntil: null,
      pinFailed: 0,    pinLockedUntil: null,
      wallet: role === 'citizen' ? STARTING_BALANCE : 0,
      createdAt: nowISO()
    };
    db.users.push(user);
    this._save(db);
    this.log(user.id, 'register', { role });
    return this.startSession(user);
  },

  async login({ username, password, role }) {
    const db = this._store();
    const user = db.users.find(
      u => u.username.toLowerCase() === String(username || '').toLowerCase());

    if (!user) {
      await Hasher.hash(password || 'x', 'dummy-salt');   // keep timing similar
      this.log(null, 'login_fail', { username, reason: 'no_user' });
      throw new Error('Invalid username or password');
    }

    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      const mins = Math.ceil((new Date(user.lockedUntil) - Date.now()) / 60000);
      throw new Error(`Account locked. Try again in ${mins} minute(s).`);
    }

    const ok = await Hasher.verify(password, user.pwSalt, user.pwHash);
    if (!ok) {
      user.failedLogins = (user.failedLogins || 0) + 1;
      if (user.failedLogins >= MAX_FAILED) {
        user.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60000).toISOString();
        user.failedLogins = 0;
        this._save(db);
        this.log(user.id, 'locked', {});
        throw new Error(`Too many attempts. Locked for ${LOCKOUT_MINUTES} minutes.`);
      }
      this._save(db);
      this.log(user.id, 'login_fail', { fails: user.failedLogins });
      const left = MAX_FAILED - user.failedLogins;
      throw new Error(`Invalid password. ${left} attempt${left === 1 ? '' : 's'} left.`);
    }

    // Role check happens only AFTER the password is proven, so it never
    // reveals which role a username belongs to.
    if (role && user.role !== role) {
      throw new Error(user.role === 'fixer'
        ? 'This is a fixer account — switch to the Fixer tab'
        : 'This is a citizen account — switch to the Citizen tab');
    }

    user.failedLogins = 0;
    user.lockedUntil  = null;
    this._save(db);
    this.log(user.id, 'login', { role: user.role });
    return this.startSession(user);
  },

  startSession(user) {
    const session = {
      token: Hasher.token(), userId: user.id, role: user.role,
      createdAt: nowISO(),
      expiresAt: new Date(Date.now() + SESSION_HOURS * 3600000).toISOString()
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return { user, session };
  },

  current() {
    try {
      const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      if (!s) return null;
      if (new Date(s.expiresAt) < new Date()) { this.logout(); return null; }
      const u = this.findById(s.userId);
      if (!u) { this.logout(); return null; }
      return { user: u, session: s };
    } catch (_) { return null; }
  },

  logout() {
    try {
      const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      if (s) this.log(s.userId, 'logout', {});
    } catch (_) {}
    sessionStorage.removeItem(SESSION_KEY);
  },

  log(userId, action, meta) {
    try {
      const log = JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]');
      log.push({ at: nowISO(), userId, action, meta });
      if (log.length > 500) log.splice(0, log.length - 500);
      localStorage.setItem(AUDIT_KEY, JSON.stringify(log));
    } catch (_) {}
  },

  async changePin(userId, oldPin, newPin) {
    const db = this._store();
    const user = db.users.find(u => u.id === userId);
    if (!user) throw new Error('User not found');
    if (!(await Hasher.verifyPin(oldPin, user.pinSalt, user.pinHash)))
      throw new Error('Current PIN is wrong');
    if (!/^\d{4}$/.test(newPin || '')) throw new Error('New PIN must be 4 digits');
    user.pinSalt = Hasher.salt();
    user.pinHash = await Hasher.hashPin(newPin, user.pinSalt);
    user.pinFailed = 0;
    user.pinLockedUntil = null;
    this._save(db);
    this.log(userId, 'pin_changed', {});
  },

  async verifyPin(userId, pin) {
    const db = this._store();
    const user = db.users.find(u => u.id === userId);
    if (!user) throw new Error('User not found');

    if (user.pinLockedUntil && new Date(user.pinLockedUntil) > new Date()) {
      const mins = Math.ceil((new Date(user.pinLockedUntil) - Date.now()) / 60000);
      throw new Error(`PIN locked. Try again in ${mins} minute(s).`);
    }

    if (!(await Hasher.verifyPin(pin, user.pinSalt, user.pinHash))) {
      user.pinFailed = (user.pinFailed || 0) + 1;
      if (user.pinFailed >= MAX_PIN_TRIES) {
        user.pinLockedUntil = new Date(Date.now() + PIN_LOCK_MINUTES * 60000).toISOString();
        user.pinFailed = 0;
        this._save(db);
        throw new Error(`Too many wrong PINs. Locked for ${PIN_LOCK_MINUTES} minutes.`);
      }
      this._save(db);
      this.log(userId, 'pin_fail', { fails: user.pinFailed });
      const left = MAX_PIN_TRIES - user.pinFailed;
      throw new Error(`Wrong PIN. ${left} attempt${left === 1 ? '' : 's'} left.`);
    }

    user.pinFailed = 0;
    user.pinLockedUntil = null;
    this._save(db);
    return true;
  }
};

const me = () => Auth.current()?.user || null;
