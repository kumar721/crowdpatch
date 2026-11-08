# 🕳️ CrowdPatch

**Report · Fund · Fix · Verify** — a crowdfunded pothole-repair platform prototype.

Citizens report potholes on a map and pledge money into a bounty. Fixers claim funded potholes, upload an "after" photo, and get paid once neighbours verify the repair.

> ⚠️ **This is a front-end demo.** All data (accounts, wallets, potholes) lives in the browser's `localStorage`, and the payment gateway is simulated — no real money moves and no real card data is collected. Do not use it as-is for real payments; see [Going to production](#going-to-production).

## Run it

No build step. Open `index.html` directly, or serve the folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

WebCrypto needs a secure context, so use `localhost` or `https://` (opening the file directly also works in most browsers).

### Demo accounts

| Role    | Usernames                 | Password    | PIN    |
|---------|---------------------------|-------------|--------|
| Citizen | `aarav`, `meera`, `neha`  | `Demo@1234` | `1234` |
| Fixer   | `ravi`                    | `Demo@1234` | `1234` |

Use **Reset demo data** on the login screen to start fresh.

## How it works

1. **Report** — a citizen drops a pin (or taps *Report here*), adds a photo and severity.
2. **Fund** — citizens pledge from their wallet (PIN-authorised). When pledges reach the severity goal (₹100 / ₹200 / ₹350) the pothole becomes *Funded*.
3. **Fix** — a fixer claims it, repairs it, uploads an after photo.
4. **Verify** — two *other* citizens confirm the fix; the bounty is released to the fixer.

## Structure

```
index.html          page shell
css/styles.css      all styling
js/config.js        constants & settings
js/utils.js         helpers (escape, formatting, images, distance)
js/crypto.js        PBKDF2 password/PIN hashing
js/auth.js          register / login / lockout / sessions / PIN
js/wallet.js        balances + append-only ledger
js/store.js         pothole data + actions (report, pledge, claim, verify)
js/ui.js            modal + PIN pad
js/map.js           Leaflet map, report flow, place search, geolocation
js/views.js         list, stats, drawer rendering
js/payments.js      ledger modal, change PIN, simulated top-up
js/app.js           auth UI, app shell, boot
```

Scripts are plain (non-module) files loaded in order from `index.html`, so the app also works from `file://`.

## What's improved vs. v1

- **Security**: PBKDF2-SHA-256 (120k iterations) instead of a single SHA-256; role mismatch is only revealed after a correct password; weak PINs rejected; PIN/lockout counters reset after a lock.
- **No card data**: the card tab no longer collects card numbers/CVV (it was also reading the number from a removed DOM node).
- **Bug fixes**: invalid nested `<button>`s in the header; ledger `.amt` CSS clash; fixer can't upload proof on someone else's claim; actions re-validate role/state in the store, not just the UI.
- **Features**: custom pledge amounts, duplicate-report warning (within 30 m), *Report here* via GPS, fixer *Release claim*, list search + sort, details field, open-in-maps link, ledger CSV export, change PIN, multi-tab sync, session-expiry auto-logout, keyboard PIN entry, accessibility labels, reduced-motion support.

## Going to production

To make this real you'd need a backend: server-side auth (sessions/JWT), a database, real escrow via a payment provider (e.g. Razorpay/Stripe Connect), server-validated photo uploads with EXIF/GPS checks, rate limiting, and a way to stop fake accounts from verifying their own repairs.

## License

MIT
