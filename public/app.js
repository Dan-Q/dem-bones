import { createPuppet } from './skeleton.js';

const params = new URLSearchParams(location.search);
const key = params.get('key');

// WebSocket that joins a room on (re)connect and retries if the connection drops.
function connect(role, roomKey, onMessage, onState) {
  let ws;
  let retryDelay = 500;

  function open() {
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${scheme}://${location.host}/ws`);
    ws.addEventListener('open', () => {
      retryDelay = 500;
      ws.send(JSON.stringify({ type: 'join', role, key: roomKey }));
      onState(true);
    });
    ws.addEventListener('message', (e) => onMessage(JSON.parse(e.data)));
    ws.addEventListener('close', () => {
      onState(false);
      setTimeout(open, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 5000);
    });
  }
  open();

  return {
    send(msg) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    },
  };
}

// Wraps an angle difference into -180 ... 180
function wrap(deg) {
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

function generateKey() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

// Candidate background colours:
const BG_COLORS = ['#8f5100', '#4b1d6b', '#1f3b4d', '#6b1d1d', '#2f4f2f', '#c05a00', '#2a2a2a'];

function setBackground(color) {
  if (BG_COLORS.includes(color)) document.body.style.setProperty('--bg', color);
}

const MUSIC_VOLUME = 0.5;
const MUSIC_FADE_IN_SECS = 0.25;
const MUSIC_FADE_OUT_SECS = 1;

async function startDesktop() {
  document.getElementById('desktop').hidden = false;

  // Web Audio loops a decoded buffer seamlessly, unlike an <audio> element.
  const audio = new AudioContext();
  const musicGain = audio.createGain();
  musicGain.gain.value = 0;
  musicGain.connect(audio.destination);
  fetch('dem-bones.mp3')
    .then((res) => res.arrayBuffer())
    .then((data) => audio.decodeAudioData(data))
    .then((buffer) => {
      const source = audio.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(musicGain);
      source.start();
    })
    .catch((err) => console.warn("Couldn't load the music:", err));
  // Browsers keep audio suspended until the user interacts with the page.
  addEventListener('pointerdown', () => audio.resume(), { once: true });

  const qr = document.getElementById('qr');
  const roomKey = generateKey();
  const phoneUrl = `${location.origin}/?key=${roomKey}`;
  const url = phoneUrl;
  qr.src = `/qr?text=${encodeURIComponent(url)}`;
  qr.alt = qr.title = url;

  // Clicking the QR code copies its link, and briefly says so over the top of it.
  const copied = document.createElement('div');
  copied.id = 'qr-copied';
  copied.textContent = 'URL copied to clipboard';
  copied.hidden = true;
  qr.after(copied);
  let hideCopied;
  qr.addEventListener('click', async () => {
    if (!qr.title || !qr.classList.contains('visible')) return;
    try {
      await navigator.clipboard.writeText(qr.title);
    } catch {
      return;
    }
    const { top, left, width, height } = qr.getBoundingClientRect();
    Object.assign(copied.style, { top: `${top}px`, left: `${left}px`, width: `${width}px`, height: `${height}px` });
    copied.hidden = false;
    clearTimeout(hideCopied);
    hideCopied = setTimeout(() => { copied.hidden = true; }, 1500);
  });

  // Fullscreen toggle, hidden where the browser doesn't allow it (e.g. iPhone).
  const fullscreenButton = document.getElementById('fullscreen-button');
  fullscreenButton.hidden = !document.fullscreenEnabled;
  fullscreenButton.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  });
  document.addEventListener('fullscreenchange', () => {
    fullscreenButton.setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen');
  });

  const status = document.getElementById('desktop-status');
  const puppet = createPuppet(document.getElementById('dem-theatres'));

  // Fade the music in quickly while the skeleton moves and out slowly once it stops.
  // A reversal ramps from wherever the volume has got to, taking the matching share of the fade time.
  let musicMoving = false;
  function fadeMusic() {
    const moving = puppet.isMoving();
    if (moving !== musicMoving) {
      musicMoving = moving;
      const from = musicGain.gain.value;
      const to = moving ? MUSIC_VOLUME : 0;
      const secs = (Math.abs(to - from) / MUSIC_VOLUME) * (moving ? MUSIC_FADE_IN_SECS : MUSIC_FADE_OUT_SECS);
      const now = audio.currentTime;
      musicGain.gain.cancelScheduledValues(now);
      musicGain.gain.setValueAtTime(from, now);
      musicGain.gain.linearRampToValueAtTime(to, now + secs);
    }
    requestAnimationFrame(fadeMusic);
  }
  requestAnimationFrame(fadeMusic);

  /**
   * Status line, desktop version.
   */
  function setStatus(text, dataStatus = '') {
    status.textContent = text;
    status.dataset.status = dataStatus;
  }

  connect('desktop', roomKey, (msg) => {
    qr.classList.toggle('visible', msg.type === 'status');
    if (msg.type === 'status') {
      setStatus(msg.mobiles > 0 ? 'Hit "Recalibrate" on your phone.' : 'Scan the QR code.', 'attention');
    } else if (msg.type === 'calibrated') {
      setStatus("Tilt your phone to shake 'dem bones!", 'ok');
      puppet.setTilt({ alpha: 0, beta: 0, gamma: 0 });
    } else if (msg.type === 'tilt') {
      puppet.setTilt(msg);
    } else if (msg.type === 'strings') {
      document.body.classList.toggle('hide-strings');
    } else if (msg.type === 'bgcolor') {
      setBackground(msg.color);
    }
  }, (connected) => {
    if (!connected) setStatus('Connection to server lost — reconnecting...', 'attention');
  });
}

function startMobile() {
  const mobile = document.getElementById('mobile');
  mobile.hidden = false;

  const status = document.getElementById('mobile-status');
  const instructions = document.getElementById('mobile-instructions');
  const startButton = document.getElementById('start');
  const stringsButton = document.getElementById('strings');
  const bgButton = document.getElementById('bgcolor');

  const socket = connect('mobile', key, () => {}, (connected) => {
    if (!connected) status.textContent = 'Connection lost - reconnecting...';
  });

  let baseline = null;
  let calibrating = false;
  let pending = null;

  /**
   * Status line, mobile version.
   */
  function setStatus(text, dataStatus = '') {
    status.textContent = text;
    status.dataset.status = dataStatus;
  }

  /**
   * Tilt event handler.
   */
  function onOrientation(e) {
    if (e.beta === null) return;
    const reading = { alpha: e.alpha ?? 0, beta: e.beta, gamma: e.gamma };
    if (calibrating) {
      baseline = reading;
      calibrating = false;
      socket.send({ type: 'calibrated' });
      setStatus('Calibrated. Tilt your phone!');
      startButton.textContent = 'Recalibrate';
      mobile.dataset.started = '';
    }
    if (!baseline) return;
    pending = {
      type: 'tilt',
      alpha: wrap(reading.alpha - baseline.alpha),
      beta: wrap(reading.beta - baseline.beta),
      gamma: wrap(reading.gamma - baseline.gamma),
    };
  }

  // Send at most ~30 upd/sec rather than on every sensor event!
  setInterval(() => {
    if (!pending) return;
    socket.send(pending);
    pending = null;
  }, 33);

  stringsButton.addEventListener('click', () => socket.send({ type: 'strings' }));

  // Pick a random colour other than the current one and use it:
  let bgColor = BG_COLORS[0];
  bgButton.addEventListener('click', () => {
    const others = BG_COLORS.filter((c) => c !== bgColor);
    bgColor = others[Math.floor(Math.random() * others.length)];
    setBackground(bgColor);
    socket.send({ type: 'bgcolor', color: bgColor });
  });

  let listening = false;
  startButton.addEventListener('click', async () => {
    instructions.hidden = true;
    // iOS requires an explicit permission prompt triggered by a user gesture.
    if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
      try {
        if (await DeviceOrientationEvent.requestPermission() !== 'granted') {
          setStatus('Motion access was denied. Allow it in your browser settings and try again.');
          return;
        }
      } catch (err) {
        setStatus(`Couldn't request motion access: ${err.message}`);
        return;
      }
    }
    if (!listening) {
      window.addEventListener('deviceorientation', onOrientation);
      listening = true;
    }
    calibrating = true;
    setStatus('Calibrating... keep the phone flat.');
    // If no sensor events ever arrive, say so rather than waiting silently.
    setTimeout(() => {
      if (calibrating) setStatus('No orientation data received. This device or browser may not support motion sensors.');
    }, 2000);
  });
}

if (key) startMobile();
else startDesktop();
