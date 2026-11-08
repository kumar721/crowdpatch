/* CrowdPatch — configuration & constants */
const KEY              = 'crowdpatch.v3';
const AUTH_KEY         = 'crowdpatch.auth.v3';
const SESSION_KEY      = 'crowdpatch.session.v3';
const LEDGER_KEY       = 'crowdpatch.ledger.v3';
const AUDIT_KEY        = 'crowdpatch.audit.v3';

const SESSION_HOURS    = 2;
const MAX_FAILED       = 5;
const LOCKOUT_MINUTES  = 15;
const MAX_PIN_TRIES    = 3;
const PIN_LOCK_MINUTES = 5;
const STARTING_BALANCE = 500;
const MIN_PW_LEN       = 8;
const PBKDF2_ITER      = 120000;
const VERIFY_NEEDED    = 2;
const DUPLICATE_RADIUS = 30;         // metres: warn if a report is this close to an open one
const MIN_TOPUP        = 10;
const MAX_TOPUP        = 50000;
const GOAL             = { 1: 100, 2: 200, 3: 350 };
const SEVERITY_LABEL   = ['', 'Minor', 'Moderate', 'Dangerous'];

const STATUS = {
  reported : { label: 'Reported',  color: '#f59e0b' },
  funded   : { label: 'Funded',    color: '#3b82f6' },
  in_repair: { label: 'In repair', color: '#a855f7' },
  fixed    : { label: 'Fixed',     color: '#10b981' }
};

const CENTER = [12.9650, 77.6100];   // Bengaluru

const UPI_APPS = [
  { id: 'gpay',    name: 'GPay',    icon: '🟢', vpa: '@okaxis' },
  { id: 'phonepe', name: 'PhonePe', icon: '🟣', vpa: '@ybl'    },
  { id: 'paytm',   name: 'Paytm',   icon: '🔵', vpa: '@paytm'  },
  { id: 'bhim',    name: 'BHIM',    icon: '🟠', vpa: '@upi'    }
];

const BANKS = [
  { id: 'hdfc',  name: 'HDFC Bank'  },
  { id: 'icici', name: 'ICICI Bank' },
  { id: 'sbi',   name: 'State Bank' },
  { id: 'axis',  name: 'Axis Bank'  },
  { id: 'kotak', name: 'Kotak Bank' },
  { id: 'yes',   name: 'Yes Bank'   }
];
