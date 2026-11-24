// QR check-in helpers and Concert Passport sticker logic.

// Ticket codes look like 10C9-AB12-XYZ. A QR may contain the bare code or a
// link such as https://<site>/?ticket=10C9-AB12-XYZ — both are accepted.
const CODE_RE = /10C9-[A-Z0-9]{4}-[A-Z0-9]{3}/i;
export const findCode = text => (String(text || '').match(CODE_RE)?.[0] || '').toUpperCase();

/* ---------- Concert Passport: 6 required stickers (from the paper passport) ---------- */
// rows: the user's saved passport parts { part, score, total }
export function stickersFor(tickets, rows) {
  const sc = part => rows.find(r => r.part === part)?.score ?? -1;
  const list = [
    { n: 1, label: 'Check-in', how: 'Show your QR and hand in your notebook(s)', got: tickets.some(t => t.status === 'checked') },
    { n: 2, label: 'Sing & Fill', how: 'Part 2 · 4/6 or more', got: sc('p2') >= 4 },
    { n: 3, label: 'Museum', how: 'Part 3 · 2/3 or more', got: sc('p3') >= 2 },
    { n: 4, label: 'Station A', how: 'Part 4 · both answers correct', got: sc('p4a') >= 2 },
    { n: 5, label: 'Station B', how: 'Part 4 · both answers correct', got: sc('p4b') >= 2 },
    { n: 6, label: 'Station C', how: 'Part 4 · both answers correct', got: sc('p4c') >= 2 },
  ];
  const count = list.filter(s => s.got).length;
  return { list, count, completed: count === 6 };
}

/* ---------- Camera scanner (jsQR, loaded only when needed) ---------- */
let stream = null, timer = null, video = null;

export async function startScanner(box, onCode) {
  stopScanner();
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot open the camera. Type the ticket code instead.');
  const { default: jsQR } = await import('jsqr');
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
  } catch (e) {
    throw new Error(e.name === 'NotAllowedError' ? 'Camera permission was blocked. Allow the camera for this site, or type the ticket code.' : 'Could not open the camera: ' + e.message);
  }
  box.innerHTML = '<video playsinline muted></video><div class="frame"></div>';
  video = box.querySelector('video');
  video.srcObject = stream;
  await video.play().catch(() => {});
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let last = '', lastAt = 0;
  timer = setInterval(() => {
    if (!video || video.readyState < 2) return;
    const w = video.videoWidth, h = video.videoHeight;
    if (!w || !h) return;
    const scale = Math.min(1, 640 / w);
    canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const hit = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
    if (hit?.data) {
      const now = Date.now();
      if (hit.data === last && now - lastAt < 3000) return; // ignore the same code held in front of the camera
      last = hit.data; lastAt = now;
      onCode(hit.data);
    }
  }, 200);
}

export function stopScanner() {
  clearInterval(timer); timer = null;
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null;
  if (video) { video.srcObject = null; video = null; }
}
