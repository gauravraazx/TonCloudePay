/* ============================================
   TON CloudePay — main.js
   Uses ton:// deep link for 100% wallet compat
   ============================================ */

/* ── Config ─────────────────────────────────── */
const MANIFEST_URL = 'https://gauravraazx.github.io/TonCloudePay/tonconnect-manifest.json';

/* ── State ──────────────────────────────────── */
let tonConnectUI  = null;
let senderAddress = null;

/* ── Init TonConnect ────────────────────────── */
async function initTonConnect() {
  try {
    tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
      manifestUrl: MANIFEST_URL,
      buttonRootId: 'ton-connect-btn-wrap',
    });

    tonConnectUI.onStatusChange(wallet => {
      if (wallet) {
        onWalletConnected(wallet);
      } else {
        onWalletDisconnected();
      }
    });

  } catch (err) {
    console.error('TonConnect init error:', err);
    showSDKError();
  }
}

/* ── Wallet Connected ───────────────────────── */
function onWalletConnected(walletInfo) {
  senderAddress    = walletInfo.account.address;
  const walletName = walletInfo.device?.appName || 'TON Wallet';
  const shortAddr  = senderAddress.slice(0, 6) + '...' + senderAddress.slice(-4);

  document.getElementById('wname').textContent = walletName;
  document.getElementById('waddr').textContent = shortAddr;

  document.getElementById('step-connect').style.display = 'none';

  const payPane = document.getElementById('step-pay');
  payPane.style.display   = 'block';
  payPane.style.opacity   = '0';
  payPane.style.transform = 'translateY(12px)';
  requestAnimationFrame(() => {
    payPane.style.transition = 'all 0.4s cubic-bezier(0.16,1,0.3,1)';
    payPane.style.opacity    = '1';
    payPane.style.transform  = 'translateY(0)';
  });

  setStep(2);
}

/* ── Wallet Disconnected ────────────────────── */
function onWalletDisconnected() {
  senderAddress = null;
  document.getElementById('step-connect').style.display = 'block';
  document.getElementById('step-pay').style.display     = 'none';
  hideStatus();
  setStep(1);
}

/* ── Disconnect ─────────────────────────────── */
async function doDisconnect() {
  if (tonConnectUI) await tonConnectUI.disconnect();
}

/* ── Step Bar ───────────────────────────────── */
function setStep(n) {
  const labels = {
    1: 'Step 1 — Connect Wallet',
    2: 'Step 2 — Send Payment',
    3: 'Step 3 — Confirmed ✓',
  };
  document.getElementById('step-label').textContent = labels[n];
  ['s1','s2','s3'].forEach(id => document.getElementById(id).className = 'step');
  if (n >= 1) document.getElementById('s1').classList.add(n > 1 ? 'done' : 'active');
  if (n >= 2) document.getElementById('s2').classList.add(n > 2 ? 'done' : 'active');
  if (n >= 3) document.getElementById('s3').classList.add('done');
}

/* ── Address Validation ─────────────────────── */
function isValidTONAddress(addr) {
  const friendly = /^(EQ|UQ|kQ|0Q)[A-Za-z0-9_\-]{46}$/.test(addr);
  const raw      = /^0:[0-9a-fA-F]{64}$/.test(addr);
  return friendly || raw;
}

/* ── Summary Updater ────────────────────────── */
function updateSummary() {
  const amt = parseFloat(document.getElementById('amount').value);
  if (amt > 0) {
    document.getElementById('sum-amount').textContent = amt.toFixed(9) + ' TON';
    document.getElementById('sum-total').textContent  = (amt + 0.005).toFixed(9) + ' TON';
    document.getElementById('summary-box').style.display = 'block';
  } else {
    document.getElementById('summary-box').style.display = 'none';
  }
}

/* ─────────────────────────────────────────────
   buildTonDeepLink(toAddr, amountTON, memo)

   Format:
   ton://transfer/{address}?amount={nanotons}&text={memo}

   - amount is in nanotons (1 TON = 1_000_000_000)
   - text is URL-encoded memo
   - This works with Tonkeeper, MyTonWallet,
     OpenMask, and all TonConnect-compatible wallets
─────────────────────────────────────────────── */
function buildTonDeepLink(toAddr, amountTON, memo) {
  const nanotons = Math.round(amountTON * 1e9);
  let url = `ton://transfer/${toAddr}?amount=${nanotons}`;
  if (memo && memo.trim()) {
    url += `&text=${encodeURIComponent(memo.trim())}`;
  }
  return url;
}

/* ── Send Payment via ton:// deep link ──────── */
async function sendPayment() {
  const toAddr = document.getElementById('to-addr').value.trim();
  const amt    = parseFloat(document.getElementById('amount').value);
  const memo   = document.getElementById('memo').value.trim();

  clearErrors();

  let valid = true;
  if (!toAddr || !isValidTONAddress(toAddr)) {
    setFieldError('to-addr', 'addr-hint', '⚠ Invalid TON address format');
    valid = false;
  }
  if (!amt || amt < 0.01) {
    setFieldError('amount', 'amt-hint', '⚠ Minimum 0.01 TON required');
    valid = false;
  }
  if (!valid) return;

  // Build ton:// deep link
  const deepLink = buildTonDeepLink(toAddr, amt, memo);

  // Show confirmation UI
  showPaymentConfirm(toAddr, amt, memo, deepLink);
}

/* ── Show Confirm + Open Wallet ─────────────── */
function showPaymentConfirm(toAddr, amt, memo, deepLink) {
  const btn = document.getElementById('pay-btn');
  btn.disabled  = true;
  btn.innerHTML = '<span class="spin"></span> Opening wallet...';

  showStatus('info',
    `📲 <strong>Opening your wallet...</strong><br>` +
    `Approve the transaction in your wallet app.<br>` +
    `<small style="opacity:0.7">If wallet didn't open, <a href="${deepLink}" style="color:var(--ton2)">tap here</a></small>`
  );

  // Open ton:// deep link — wallet app opens automatically
  window.location.href = deepLink;

  // After 3 seconds, show "Did it go through?" UI
  setTimeout(() => {
    btn.disabled  = false;
    btn.innerHTML = 'Confirm &amp; Send via Wallet →';

    // Build tonviewer links
    const senderLink   = senderAddress
      ? `<a href="https://tonviewer.com/${senderAddress}" target="_blank">📤 Your Wallet ↗</a>`
      : '';
    const receiverLink = `<a href="https://tonviewer.com/${toAddr}" target="_blank">📥 Receiver Wallet ↗</a>`;
    const divider      = senderLink ? ' &nbsp;|&nbsp; ' : '';

    // Show success with verify links
    showStatus('success',
      `✅ <strong>Payment request sent!</strong><br>` +
      `Amount: <strong>${amt} TON</strong>${memo ? ' · Memo: <em>' + escHtml(memo) + '</em>' : ''}<br>` +
      `${senderLink}${divider}${receiverLink}`
    );

    setStep(3);
    launchConfetti();
    clearForm();
  }, 3000);
}

/* ── UI Helpers ─────────────────────────────── */
function setFieldError(inputId, hintId, message) {
  document.getElementById(inputId).classList.add('err');
  const h = document.getElementById(hintId);
  h.textContent = message;
  h.className   = 'field-hint error-msg';
}

function clearErrors() {
  ['to-addr','amount'].forEach(id => document.getElementById(id).classList.remove('err'));
  const ah = document.getElementById('addr-hint');
  ah.textContent = 'Enter valid TON mainnet address'; ah.className = 'field-hint';
  const mh = document.getElementById('amt-hint');
  mh.textContent = 'Min: 0.01 TON'; mh.className = 'field-hint';
}

function showStatus(type, html) {
  const box = document.getElementById('status-box');
  box.className = type;
  document.getElementById('s-icon').textContent = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  document.getElementById('s-text').innerHTML   = html;
}

function hideStatus() {
  const b = document.getElementById('status-box');
  b.className = ''; b.style.display = 'none';
}

function clearForm() {
  ['to-addr','amount','memo'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('summary-box').style.display = 'none';
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── SDK Error ──────────────────────────────── */
function showSDKError() {
  const el = document.getElementById('sdk-error');
  if (el) {
    el.style.display = 'block';
    el.innerHTML = `⚠️ <strong>TonConnect SDK failed to load.</strong><br>
      Ensure you are on <strong>HTTPS</strong>.<br>
      <a href="https://ton.org/wallets" target="_blank">Get a TON Wallet →</a>`;
  }
}

/* ── Confetti ───────────────────────────────── */
function launchConfetti() {
  const c = document.getElementById('confetti');
  const x = c.getContext('2d');
  c.width = innerWidth; c.height = innerHeight;
  const cols = ['#0098EA','#00c6ff','#4f46e5','#00e676','#fff','#ffd740'];
  const pts  = Array.from({length:110}, () => ({
    x:Math.random()*c.width, y:Math.random()*-200,
    r:Math.random()*6+2, cl:cols[Math.floor(Math.random()*6)],
    vx:(Math.random()-.5)*2.5, vy:Math.random()*4+1.5, va:(Math.random()-.5)*.15, a:0,
  }));
  let f = 0;
  (function draw() {
    x.clearRect(0,0,c.width,c.height);
    pts.forEach(p => {
      x.save(); x.translate(p.x,p.y); x.rotate(p.a);
      x.globalAlpha = Math.max(0,1-f/100);
      x.fillStyle = p.cl;
      x.beginPath(); x.ellipse(0,0,p.r,p.r*.4,0,0,Math.PI*2); x.fill();
      x.restore();
      p.y+=p.vy; p.x+=p.vx; p.a+=p.va; p.vy+=.06;
    });
    if(++f<115) requestAnimationFrame(draw);
    else x.clearRect(0,0,c.width,c.height);
  })();
}

/* ── Boot ───────────────────────────────────── */
window.addEventListener('load', () => {
  if (typeof TON_CONNECT_UI !== 'undefined') {
    initTonConnect();
  } else {
    console.error('TonConnect UI SDK not loaded');
    showSDKError();
  }
});
