let audioCtx: AudioContext | null = null

function getContext(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext()
  return audioCtx
}

export function playNotificationSound() {
  try {
    const ctx = getContext()
    if (ctx.state === 'suspended') ctx.resume()

    const now = ctx.currentTime

    // Two-tone chime: C6 → E6
    const notes = [
      { freq: 1047, start: 0, dur: 0.12 },
      { freq: 1319, start: 0.13, dur: 0.18 },
    ]

    for (const n of notes) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = n.freq
      gain.gain.setValueAtTime(0.25, now + n.start)
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
