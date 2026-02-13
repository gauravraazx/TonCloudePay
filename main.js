/* ============================================
   TON CloudePay — main.js
   ============================================ */

/* ── Config ─────────────────────────────────── */
const MANIFEST_URL   = 'https://gauravraazx.github.io/TonCloudePay/tonconnect-manifest.json';
const TONCENTER_API  = 'https://toncenter.com/api/v2';

/* ── State ──────────────────────────────────── */
let tonConnectUI = null;

/* ── Init TonConnect ────────────────────────── */
async function initTonConnect() {
  try {
    tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
      manifestUrl: MANIFEST_URL,
      buttonRootId: 'ton-connect-btn-wrap',
    });

    // Listen for wallet connection / disconnection
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
  const rawAddr    = walletInfo.account.address;
  const walletName = walletInfo.device?.appName || 'TON Wallet';
  const shortAddr  = rawAddr.slice(0, 6) + '...' + rawAddr.slice(-4);

  document.getElementById('wname').textContent = walletName;
  document.getElementById('waddr').textContent = shortAddr;

  // Hide step 1, show step 2
  document.getElementById('step-connect').style.display = 'none';

  const payPane = document.getElementById('step-pay');
  payPane.style.display   = 'block';
  payPane.style.opacity   = '0';
  payPane.style.transform = 'translateY(12px)';

  requestAnimationFrame(() => {
    payPane.style.transition = 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
    payPane.style.opacity    = '1';
    payPane.style.transform  = 'translateY(0)';
  });

  // Update step bar
  setStep(2);
}

/* ── Wallet Disconnected ────────────────────── */
function onWalletDisconnected() {
  document.getElementById('step-connect').style.display = 'block';
  document.getElementById('step-pay').style.display     = 'none';
  hideStatus();
  setStep(1);
}

/* ── Disconnect ─────────────────────────────── */
async function doDisconnect() {
  if (tonConnectUI) {
    await tonConnectUI.disconnect();
  }
}

/* ── Step Bar Helper ────────────────────────── */
function setStep(n) {
  const labels = {
    1: 'Step 1 — Connect Wallet',
    2: 'Step 2 — Send Payment',
    3: 'Step 3 — Confirmed ✓',
  };
  document.getElementById('step-label').textContent = labels[n];

  const s1 = document.getElementById('s1');
  const s2 = document.getElementById('s2');
  const s3 = document.getElementById('s3');

  s1.className = 'step';
  s2.className = 'step';
  s3.className = 'step';

  if (n === 1) { s1.classList.add('active'); }
  if (n === 2) { s1.classList.add('done'); s2.classList.add('active'); }
  if (n === 3) { s1.classList.add('done'); s2.classList.add('done'); s3.classList.add('done'); }
}

/* ── Address Validation ─────────────────────── */
function isValidTONAddress(addr) {
  // Friendly format: EQ / UQ / kQ / 0Q + 46 base64url chars
  const friendly = /^(EQ|UQ|kQ|0Q)[A-Za-z0-9_\-]{46}$/.test(addr);
  // Raw format: 0: + 64 hex chars
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

/* ── Send Real Payment ──────────────────────── */
async function sendPayment() {
  const toAddr = document.getElementById('to-addr').value.trim();
  const amt    = parseFloat(document.getElementById('amount').value);
  const memo   = document.getElementById('memo').value.trim();

  // Clear previous errors
  clearErrors();

  // Validate
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

  if (!tonConnectUI?.connected) {
    showStatus('error', '❌ Wallet not connected. Please reconnect.');
    return;
  }

  // Show loading state
  const btn = document.getElementById('pay-btn');
  btn.disabled   = true;
  btn.innerHTML  = '<span class="spin"></span> Waiting for wallet approval...';
  showStatus('info', '📲 Open your wallet app and approve the transaction.');

  try {
    // Convert TON → nanotons (1 TON = 1,000,000,000 nanotons)
    const nanotons = BigInt(Math.round(amt * 1e9)).toString();

    const transaction = {
      validUntil: Math.floor(Date.now() / 1000) + 600, // 10 min window
      messages: [
        {
          address: toAddr,
          amount:  nanotons,
          // Encode memo as TON text comment cell (opcode 0x00000000)
          payload: memo ? encodeTextComment(memo) : undefined,
        }
      ]
    };

    // This opens Tonkeeper / MyTonWallet for user approval
    const result = await tonConnectUI.sendTransaction(transaction);

    // Transaction approved by user
    btn.disabled  = false;
    btn.innerHTML = 'Confirm &amp; Send via Wallet →';

    setStep(3);

    // Try to get on-chain TX hash via TonCenter
    const txHash = await getTxHash(result.boc);

    showStatus('success',
      `✅ <strong>Transaction sent!</strong><br>` +
      `Amount: <strong>${amt} TON</strong>${memo ? ' · Memo: ' + escHtml(memo) : ''}<br>` +
      (txHash
        ? `🔗 <a href="https://tonscan.org/tx/${txHash}" target="_blank">View on Tonscan ↗</a>`
        : `🔗 <a href="https://tonscan.org" target="_blank">Check Tonscan ↗</a>`)
    );

    launchConfetti();
    clearForm();

  } catch (err) {
    btn.disabled  = false;
    btn.innerHTML = 'Confirm &amp; Send via Wallet →';

    console.error('Transaction error:', err);

    const msg = err?.message || '';
    const cancelled =
      err?.code === 300 ||
      msg.toLowerCase().includes('cancel') ||
      msg.toLowerCase().includes('reject') ||
      msg.toLowerCase().includes('user rejects');

    if (cancelled) {
      showStatus('error', '🚫 Transaction cancelled by user.');
    } else {
      showStatus('error', '❌ Error: ' + (msg || 'Unknown error. Check console.'));
    }
  }
}

/* ── Text Comment Encoder ───────────────────── */
// TON text comment cell format: 4-byte opcode (0x00000000) + UTF-8 text bytes
function encodeTextComment(text) {
  const textBytes = new TextEncoder().encode(text);
  const buffer    = new Uint8Array(4 + textBytes.length);
  // First 4 bytes are 0x00000000 (simple text comment opcode) — already zeroed
  buffer.set(textBytes, 4);
  return uint8ArrayToBase64(buffer);
}

function uint8ArrayToBase64(bytes) {
  let binary = '';
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

/* ── Get TX Hash from TonCenter ─────────────── */
async function getTxHash(boc) {
  try {
    const res = await fetch(`${TONCENTER_API}/sendBocReturnHash`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ boc }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.result?.hash || null;
    }
  } catch (_) {
    // Silently fail — hash is optional
  }
  return null;
}

/* ── UI Helpers ─────────────────────────────── */

function setFieldError(inputId, hintId, message) {
  document.getElementById(inputId).classList.add('err');
  const hint       = document.getElementById(hintId);
  hint.textContent = message;
  hint.className   = 'field-hint error-msg';
}

function clearErrors() {
  document.getElementById('to-addr').classList.remove('err');
  document.getElementById('amount').classList.remove('err');

  const addrHint       = document.getElementById('addr-hint');
  addrHint.textContent = 'Enter valid TON mainnet address';
  addrHint.className   = 'field-hint';

  const amtHint       = document.getElementById('amt-hint');
  amtHint.textContent = 'Min: 0.01 TON';
  amtHint.className   = 'field-hint';
}

function showStatus(type, html) {
  const box  = document.getElementById('status-box');
  const icon = document.getElementById('s-icon');
  const text = document.getElementById('s-text');

  box.className = type; // triggers CSS display:flex via .info / .success / .error
  icon.textContent = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  text.innerHTML   = html;
}

function hideStatus() {
  const box   = document.getElementById('status-box');
  box.className    = '';
  box.style.display = 'none';
}

function clearForm() {
  document.getElementById('to-addr').value = '';
  document.getElementById('amount').value  = '';
  document.getElementById('memo').value    = '';
  document.getElementById('summary-box').style.display = 'none';
}

function escHtml(str) {
  return str
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;');
}

/* ── SDK Load Error ─────────────────────────── */
function showSDKError() {
  const errEl = document.getElementById('sdk-error');
  if (errEl) {
    errEl.style.display = 'block';
    errEl.innerHTML = `
      ⚠️ <strong>TonConnect SDK failed to load.</strong><br>
      Make sure you are on <strong>HTTPS</strong> and connected to the internet.<br><br>
      <a href="https://ton.org/wallets" target="_blank">Get a TON Wallet →</a>
    `;
  }
}

/* ── Confetti ───────────────────────────────── */
function launchConfetti() {
  const canvas = document.getElementById('confetti');
  const ctx    = canvas.getContext('2d');

  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = ['#0098EA', '#00c6ff', '#4f46e5', '#00e676', '#ffffff', '#ffd740'];

  const particles = Array.from({ length: 110 }, () => ({
    x:  Math.random() * canvas.width,
    y:  Math.random() * -200,
    r:  Math.random() * 6 + 2,
    cl: colors[Math.floor(Math.random() * colors.length)],
    vx: (Math.random() - 0.5) * 2.5,
    vy: Math.random() * 4 + 1.5,
    va: (Math.random() - 0.5) * 0.15,
    a:  0,
  }));

  let frame = 0;

  (function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particles.forEach(p => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      ctx.globalAlpha = Math.max(0, 1 - frame / 100);
      ctx.fillStyle   = p.cl;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.r, p.r * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      p.y  += p.vy;
      p.x  += p.vx;
      p.a  += p.va;
      p.vy += 0.06;
    });

    if (++frame < 115) {
      requestAnimationFrame(draw);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
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
