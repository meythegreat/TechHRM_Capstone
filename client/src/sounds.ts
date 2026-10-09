const SAMPLE_RATE = 22050;

let audioContext: AudioContext | null = null;
let armed = false;
let phase: 'idle' | 'priming' | 'ready' = 'idle';

type Clip = HTMLAudioElement;

interface Tone {
  frequency: number;
  start: number;
  duration: number;
}

const noticeTones: Tone[] = [
  { frequency: 880, start: 0, duration: 0.11 },
  { frequency: 1320, start: 0.13, duration: 0.18 },
];
const acceptedTones: Tone[] = [
  { frequency: 660, start: 0, duration: 0.1 },
  { frequency: 880, start: 0.1, duration: 0.1 },
  { frequency: 1175, start: 0.2, duration: 0.22 },
];
const rejectedTones: Tone[] = [
  { frequency: 494, start: 0, duration: 0.12 },
  { frequency: 370, start: 0.13, duration: 0.18 },
];

const noticeClip = makeClip(noticeTones);
const acceptedClip = makeClip(acceptedTones);
const rejectedClip = makeClip(rejectedTones);
const clips = [noticeClip, acceptedClip, rejectedClip];

function audioContextClass() {
  return window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

function context(): AudioContext | null {
  const AudioCtx = audioContextClass();
  if (!AudioCtx) return null;
  if (!audioContext) audioContext = new AudioCtx();
  return audioContext;
}

function unlockWebAudio() {
  const audio = context();
  if (!audio) return;
  if (audio.state === 'suspended') void audio.resume();
  try {
    const buffer = audio.createBuffer(1, 1, SAMPLE_RATE);
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.connect(audio.destination);
    source.start(0);
  } catch {
    /* a locked context throws until the next tap */
  }
}

function isPhone() {
  return window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(max-width: 768px)').matches;
}

/** Phone speakers need a stronger clip. Desktop speakers play the same file much louder. */
function playbackVolume() {
  return isPhone() ? 1 : 0.16;
}

function primeClip(el: Clip) {
  el.dataset.mode = 'prime';
  el.volume = 0.001;
  const task = el.play();
  const settle = (ok: boolean) => {
    if (el.dataset.mode === 'play') {
      el.volume = playbackVolume();
      return ok;
    }
    try {
      el.pause();
      el.currentTime = 0;
    } catch {
      /* not loaded yet */
    }
    el.volume = playbackVolume();
    return ok;
  };
  if (!task) return Promise.resolve(settle(true));
  return task.then(() => settle(true)).catch(() => settle(false));
}

function onGesture() {
  unlockWebAudio();
  if (phase !== 'idle') return;
  phase = 'priming';
  void Promise.all(clips.map(primeClip)).then((results) => {
    if (results.some((ok) => !ok)) {
      phase = 'idle';
      return;
    }
    phase = 'ready';
    window.removeEventListener('pointerdown', onGesture, true);
    window.removeEventListener('pointerup', onGesture, true);
    window.removeEventListener('touchstart', onGesture, true);
    window.removeEventListener('touchend', onGesture, true);
    window.removeEventListener('click', onGesture, true);
  });
}

/** Phones only allow sound after a tap. The first tap starts playback so later chimes are allowed. */
export function armSounds() {
  if (armed || typeof window === 'undefined') return;
  armed = true;
  for (const el of clips) {
    el.setAttribute('aria-hidden', 'true');
    el.style.display = 'none';
    document.documentElement.appendChild(el);
  }
  window.addEventListener('pointerdown', onGesture, true);
  window.addEventListener('pointerup', onGesture, true);
  window.addEventListener('touchstart', onGesture, true);
  window.addEventListener('touchend', onGesture, true);
  window.addEventListener('click', onGesture, true);
}

function playClip(el: Clip): Promise<boolean> {
  try {
    el.dataset.mode = 'play';
    el.volume = playbackVolume();
    el.muted = false;
    if (el.readyState > 0) el.currentTime = 0;
    const task = el.play();
    if (!task) return Promise.resolve(!el.paused);
    return task.then(() => true).catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}

function playTones(tones: Tone[]) {
  const audio = audioContext;
  if (!audio || audio.state !== 'running') return false;
  try {
    for (const tone of tones) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      const at = audio.currentTime + tone.start;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(tone.frequency, at);
      gain.gain.value = 0.001;
      gain.gain.setValueAtTime(0.001, at);
      gain.gain.linearRampToValueAtTime(isPhone() ? 0.45 : 0.1, at + 0.015);
      gain.gain.linearRampToValueAtTime(0.001, at + tone.duration);
      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start(at);
      osc.stop(at + tone.duration + 0.02);
    }
    return true;
  } catch {
    return false;
  }
}

function playSound(clip: Clip, tones: Tone[]) {
  return playClip(clip).then((ok) => ok || playTones(tones));
}

export function playNotificationSound() {
  return playSound(noticeClip, noticeTones);
}

export function playAccessAcceptedSound() {
  return playSound(acceptedClip, acceptedTones);
}

export function playAccessRejectedSound() {
  return playSound(rejectedClip, rejectedTones);
}

function makeClip(tones: Tone[]) {
  const el = new Audio(wavUrl(renderTones(tones)));
  el.preload = 'auto';
  el.setAttribute('playsinline', 'true');
  return el;
}

function renderTones(tones: Tone[]) {
  const length = Math.ceil(SAMPLE_RATE * (Math.max(...tones.map((tone) => tone.start + tone.duration)) + 0.02));
  const samples = new Float32Array(length);
  for (const tone of tones) {
    const start = Math.floor(tone.start * SAMPLE_RATE);
    const count = Math.floor(tone.duration * SAMPLE_RATE);
    for (let i = 0; i < count; i += 1) {
      const position = i / count;
      const envelope = Math.sin(Math.PI * position) ** 0.6;
      const wave = Math.sin((2 * Math.PI * tone.frequency * i) / SAMPLE_RATE);
      samples[start + i] += wave * envelope * 0.9;
    }
  }
  return samples;
}

function wavUrl(samples: Float32Array) {
  const bytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + bytes);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + bytes, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, bytes, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}
