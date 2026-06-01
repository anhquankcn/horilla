let audioCtx: AudioContext | null = null
let warmedUp = false

function ensureContext(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext()
  return audioCtx
}

export function warmUpAudio() {
  if (warmedUp) return
  warmedUp = true
  const ctx = ensureContext()
  if (ctx.state === 'suspended') ctx.resume()
  // Play a silent buffer to fully unlock audio on iOS/Android
  const buf = ctx.createBuffer(1, 1, ctx.sampleRate)
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.connect(ctx.destination)
  src.start()
}

export function playNotificationSound() {
  try {
    const ctx = ensureContext()
    if (ctx.state === 'suspended') ctx.resume()

    const now = ctx.currentTime
    const vol = 0.35

    // Three-tone chime: G5 → B5 → D6 (bright major chord arpeggio)
    const notes = [
      { freq: 784, start: 0, dur: 0.15 },
      { freq: 988, start: 0.12, dur: 0.15 },
      { freq: 1175, start: 0.24, dur: 0.25 },
    ]

    for (const n of notes) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = n.freq
      gain.gain.setValueAtTime(vol, now + n.start)
      gain.gain.exponentialRampToValueAtTime(0.001, now + n.start + n.dur)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + n.start)
      osc.stop(now + n.start + n.dur + 0.05)
    }
  } catch {
    // Audio not supported or blocked
  }
}
