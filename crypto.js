/* CrowdPatch — password / PIN hashing (WebCrypto PBKDF2-SHA256) */
const Hasher = {
  _hex: buf => [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join(''),

  salt(len = 16) {
    return this._hex(crypto.getRandomValues(new Uint8Array(len)));
  },

  token(len = 32) {
    return this._hex(crypto.getRandomValues(new Uint8Array(len)));
  },

  async hash(secret, salt, iterations = PBKDF2_ITER) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: enc.encode(salt), iterations, hash: 'SHA-256' },
      key, 256);
    return this._hex(bits);
  },

  async verify(secret, salt, expected, iterations = PBKDF2_ITER) {
    const h = await this.hash(secret, salt, iterations);
    if (!expected || h.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < h.length; i++) diff |= h.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  },

  hashPin(pin, salt)            { return this.hash('PIN:' + pin, salt); },
  verifyPin(pin, salt, expected){ return this.verify('PIN:' + pin, salt, expected); }
};
