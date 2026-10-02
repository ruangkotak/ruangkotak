# RUANGKOTAK reel soundtrack: 190 bpm drum & bass bed + frame-synced SFX, synthesized with numpy only.
# python3 sound.py  ->  reel-audio.wav (48 kHz, 16-bit stereo, 15.0 s)
import numpy as np, wave

SR = 48000
DUR = 15.0
N = int(SR * DUR)
BEAT = 60 / 190
G0 = 0.5                     # beat 0 = the square landing
S16 = BEAT / 4
rng = np.random.default_rng(7)

music = np.zeros((2, N))
sfx = np.zeros((2, N))
duck = np.ones(N)            # sidechain gain applied to music

def beat(n): return G0 + n * BEAT
def tt(n): return np.arange(n) / SR

def place(buf, t0, sig, pan=0.0, gain=1.0):
    """Mix mono or stereo sig into buf at t0 seconds. pan -1..1, equal power."""
    i0 = int(round(t0 * SR))
    if sig.ndim == 1:
        a = (pan + 1) * np.pi / 4
        sig = np.vstack([sig * np.cos(a), sig * np.sin(a)]) * np.sqrt(2)
    s0 = max(0, -i0); i0 = max(0, i0)
    n = min(sig.shape[1] - s0, N - i0)
    if n > 0: buf[:, i0:i0 + n] += gain * sig[:, s0:s0 + n]

def sidechain(t0, depth=.6, rel=.18):
    i0 = int(t0 * SR); n = int(rel * 4 * SR)
    if i0 >= N: return
    g = 1 - depth * np.exp(-tt(n) / rel)
    n = min(n, N - i0); duck[i0:i0 + n] = np.minimum(duck[i0:i0 + n], g[:n])

def expdec(n, tau): return np.exp(-tt(n) / tau)
def noise(n): return rng.standard_normal(n)

# ---------- spectral helpers ----------
def fft_filter(x, lo=1, hi=SR / 2, slope=None):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    if slope:  # soft edges
        m = 1 / (1 + (lo / np.maximum(f, 1)) ** slope) / (1 + (f / hi) ** slope)
    else:
        m = ((f >= lo) & (f <= hi)).astype(float)
    return np.fft.irfft(X * m, len(x))

def tv_band(x, center, width_oct=1.0, win=1024):
    """Time-varying band-pass: center(seconds)->Hz. STFT overlap-add."""
    hop = win // 4; w = np.hanning(win)
    pad = np.concatenate([np.zeros(win), x, np.zeros(win)])
    frames = (len(pad) - win) // hop
    out = np.zeros(len(pad)); f = np.fft.rfftfreq(win, 1 / SR)
    lf = np.log2(np.maximum(f, 1))
    for i in range(frames):
        s = i * hop
        c = max(20.0, center(max(0, s - win / 2) / SR))
        g = np.exp(-0.5 * ((lf - np.log2(c)) / (width_oct / 2)) ** 2)
        out[s:s + win] += np.fft.irfft(np.fft.rfft(pad[s:s + win] * w) * g, win) * w
    return out[win:win + len(x)] / 1.5

def reverb(stereo, decay=1.4, wet=.25, pre=.012):
    n = int(decay * 1.6 * SR)
    out = np.zeros_like(stereo)
    for ch in range(2):
        ir = noise(n) * np.exp(-tt(n) * 6.9 / decay)
        ir = fft_filter(ir, 200, 9000, slope=2)
        ir = np.concatenate([np.zeros(int(pre * SR)), ir]); ir /= np.sqrt(np.sum(ir ** 2))
        L = stereo.shape[1] + len(ir)
        out[ch] = np.fft.irfft(np.fft.rfft(stereo[ch], L) * np.fft.rfft(ir, L), L)[:stereo.shape[1]]
    return stereo + wet * out

def saw_additive(freq, dur, cutoff, detune=(0,), harmonics=60):
    """Band-limited saw; cutoff may be a function of t (Hz) for filter sweeps."""
    n = int(dur * SR); t = tt(n)
    cut = cutoff(t) if callable(cutoff) else np.full(n, float(cutoff))
    y = np.zeros(n)
    for d in detune:
        f0 = freq * (1 + d); ph = rng.uniform(0, 2 * np.pi)
        for k in range(1, harmonics + 1):
            fk = f0 * k
            if fk > SR / 2.2: break
            y += (1 / k) / (1 + (fk / cut) ** 4) * np.sin(2 * np.pi * fk * t + ph * k)
    return y / len(detune)

# ---------- instruments ----------
def kick(big=False):
    n = int((.9 if big else .32) * SR); t = tt(n)
    f = 44 + (190 if big else 140) * np.exp(-t / (.05 if big else .03))
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * expdec(n, .45 if big else .13)
    y = np.tanh(y * (3 if big else 2.2))
    click = fft_filter(noise(n), 1500, 9000) * expdec(n, .004)
    return y + .35 * click

def snare(v=1.0):
    n = int(.26 * SR); t = tt(n)
    body = np.sin(2 * np.pi * np.cumsum(185 + 60 * np.exp(-t / .02)) / SR) * expdec(n, .06)
    nz = fft_filter(noise(n), 900, 11000, slope=2) * expdec(n, .09)
    return v * np.tanh(1.6 * (.55 * body + .9 * nz))

def hat(open_=False, v=1.0):
    n = int((.22 if open_ else .05) * SR)
    return v * fft_filter(noise(n), 7000, 16000, slope=3) * expdec(n, .07 if open_ else .012)

def crash(dur=1.8):
    n = int(dur * SR); t = tt(n)
    metal = sum(np.sin(2 * np.pi * f * t + rng.uniform(0, 6)) for f in (3120, 4180, 5310, 6870, 8120))
    return (fft_filter(noise(n), 4000, 16000, slope=2) + .08 * metal) * expdec(n, dur / 4.5) * .7

def boom(dur=1.6, f_hi=110, f_lo=34):
    n = int(dur * SR); t = tt(n)
    f = f_lo + (f_hi - f_lo) * np.exp(-t / .12)
    return np.tanh(2.5 * np.sin(2 * np.pi * np.cumsum(f) / SR) * expdec(n, dur / 3.2))

def whoosh(dur, f0, f1, curve=2.0, v=1.0, width=1.1):
    n = int(dur * SR)
    up = f1 > f0
    y = tv_band(noise(n), lambda s: f0 * (f1 / f0) ** (min(1, s / dur) ** (1 / curve if up else curve)), width)
    envl = np.sin(np.pi * np.clip(tt(n) / dur, 0, 1)) ** 1.5
    return v * y * envl / (np.max(np.abs(y)) + 1e-9)

def riser(dur, f0=300, f1=6000, v=1.0):
    n = int(dur * SR); t = tt(n)
    nz = tv_band(noise(n), lambda s: f0 * (f1 / f0) ** min(1, s / dur), 1.4)
    nz /= np.max(np.abs(nz)) + 1e-9
    tone = np.sin(2 * np.pi * np.cumsum(110 * (8 ** (t / dur))) / SR) * .25
    return v * (nz + tone) * (t / dur) ** 2.2

def blip(f0, f1=None, dur=.08, v=1.0, tau=.03):
    n = int(dur * SR); t = tt(n); f1 = f1 or f0
    f = f0 * (f1 / f0) ** (t / dur)
    return v * np.sin(2 * np.pi * np.cumsum(f) / SR) * expdec(n, tau) * np.minimum(1, t / .002)

def tick(v=1.0, f=5200):
    n = int(.012 * SR)
    return v * (np.sin(2 * np.pi * f * tt(n)) * expdec(n, .002) + .4 * fft_filter(noise(n), 3000, 14000) * expdec(n, .0015))

def thump(v=1.0, f=70):
    n = int(.25 * SR); t = tt(n)
    return v * np.tanh(2 * np.sin(2 * np.pi * np.cumsum(f + 90 * np.exp(-t / .015)) / SR) * expdec(n, .07))

def stab(freqs, dur=.28, v=1.0, bright=4200):
    y = sum(saw_additive(f, dur, lambda t: 300 + bright * np.exp(-t / .06), detune=(-.006, 0, .006), harmonics=40) for f in freqs)
    n = len(y)
    return v * y * expdec(n, dur / 2.5) * np.minimum(1, tt(n) / .003) / len(freqs)

def hz(midi): return 440 * 2 ** ((midi - 69) / 12)

# =====================================================================
# MUSIC BED  (F minor, 190 bpm; one chord per bar)
# =====================================================================
PROG = [[41, 44, 48, 51], [41, 44, 48, 51], [37, 41, 44, 48], [39, 43, 46, 50]]   # Fm7 Fm7 Db Eb
def section(n):
    if n < 10: return 'intro'
    if n < 22: return 'groove'
    if n < 27: return 'break'
    if n < 32: return 'groove'
    if n < 36: return 'drop'
    return 'fill'

# drums: two-step on a 16-step bar
K_STEPS, S_STEPS, GHOST = {0, 10}, {4, 12}, {7, 15}
for st in range(0, 36 * 4):
    n = st / 4; t = beat(n); sec = section(int(n)); step = st % 16
    if sec in ('break', 'fill'): continue
    if step in K_STEPS: place(music, t, kick(), 0, .95); sidechain(t, .45, .09)
    if sec != 'intro' and step in S_STEPS: place(music, t, snare(), 0, .8)
    if sec != 'intro' and step in GHOST: place(music, t, snare(.28), .1, .6)
    if step % 2 == 0: place(music, t, hat(v=.55 if step % 4 else .35), .25)
    elif sec in ('drop', 'groove'): place(music, t, hat(v=.22), -.25)
    if sec == 'drop' and step % 4 == 2: place(music, t, hat(True, .3), .3)
# fill: beat 36 -> 12.45, 16ths then 32nds, rising into the redaction
t = beat(36.0); k = 0
while t < 12.43:
    v = .35 + .6 * (t - beat(36)) / (12.45 - beat(36))
    place(music, t, snare(v), (k % 2 - .5) * .3, .75)
    t += S16 if t < beat(37) else S16 / 2; k += 1

# reese bass + sub
for bar in range(10):
    t0 = beat(bar * 4); t1 = min(beat(bar * 4 + 4), 12.45)
    if t0 >= 12.45: break
    dur = t1 - t0; nb = bar * 4
    root = PROG[bar % 4][0]
    if nb < 10: bright = lambda t, b0=nb: 180 + 1100 * np.minimum(1, (b0 + t / BEAT) / 10)
    else: bright = lambda t: 900 + 700 * np.sin(2 * np.pi * t / (BEAT * 2)) ** 2
    reese = np.tanh(2.2 * saw_additive(hz(root - 12), dur, bright, detune=(-.012, 0, .011), harmonics=50))
    ln = len(reese); tl = tt(ln)
    sub = np.sin(2 * np.pi * hz(root - 24) * tl)
    env = np.minimum(1, tl / .01) * np.clip((dur - tl) / .02, 0, 1)
    # mute through the break (beats 22-27), leaving the drone
    gate = np.ones(ln)
    tabs = t0 + tl
    gate[(tabs >= beat(22) - .05) & (tabs < beat(27))] = 0
    gate = np.convolve(gate, np.ones(480) / 480, 'same')
    place(music, t0, (reese * .6 + sub * .8) * env * gate, 0, .55)

# break drone (7.5 -> 9.0): low sub + tension pulse on 8ths
n = int(1.5 * SR); tb = tt(n)
drone = np.sin(2 * np.pi * hz(29) * tb) * np.minimum(1, tb / .3) * .6
drone += .15 * np.sin(2 * np.pi * hz(53) * tb) * (np.sin(2 * np.pi * tb / (BEAT / 2)) > 0)
place(music, 7.52, drone * np.clip((1.5 - tb) / .05, 0, 1), 0, .7)

# chord stabs: offbeats in the grooves, every beat in the drop (= each tab cut)
for nb in range(10, 36):
    sec = section(nb)
    if sec == 'break': continue
    chord = [hz(m + 12) for m in PROG[(nb // 4) % 4]]
    if sec == 'drop': place(music, beat(nb), stab(chord, .26, bright=5200), (nb % 2 - .5) * .5, .42)
    elif nb % 4 in (1, 3): place(music, beat(nb) + S16 * 2, stab(chord, .18), .2 * (1 if nb % 8 < 4 else -1), .26)

# final chord at the logo pop (12.95): Fm(add9), long tail
fin = sum(saw_additive(hz(m), 2.0, lambda t: 400 + 3000 * np.exp(-t / .25), detune=(-.008, 0, .008), harmonics=40) for m in (53, 56, 60, 63, 67))
fin *= expdec(len(fin), .9) * np.minimum(1, tt(len(fin)) / .005) / 5
place(music, 12.95, fin, 0, .8)
place(music, 12.95, np.sin(2 * np.pi * hz(29) * tt(int(2 * SR))) * expdec(int(2 * SR), .8), 0, .5)

# =====================================================================
# SFX  (times match reel.js)
# =====================================================================
# 0 – 0.5: falling whistle + swell into the landing
place(sfx, 0.0, blip(2400, 380, .5, .3, tau=10), 0)
place(sfx, 0.02, riser(.48, 800, 9000, .5))
# 0.5 landing
place(sfx, .5, boom(1.8, 130, 32), 0, 1.0); place(sfx, .5, kick(True), 0, .8); place(sfx, .5, crash(2.2), 0, .55); sidechain(.5, .9, .3)
# 0.7 – 1.25: grid cells pop in from the centre
for k in range(34):
    t = .7 + k / 33 * .55 + rng.uniform(0, .03)
    place(sfx, t, blip(rng.uniform(1400, 3200), None, .03, .25, tau=.008), rng.uniform(-.9, .9))
# 1.4 – 2.55: the scan sweeps left -> right (pan follows it)
sw = whoosh(1.2, 500, 4000, 1.0, .5, 1.4)
a = (np.linspace(-.9, .9, len(sw)) + 1) * np.pi / 4
place(sfx, 1.38, np.vstack([sw * np.cos(a), sw * np.sin(a)]) * 1.4)
for k in range(18): place(sfx, 1.45 + k * .062, tick(.35, 3000 + 150 * k), -.9 + k * .1)
# headline card
place(sfx, 1.6, whoosh(.35, 3000, 600, v=.45))
place(sfx, 1.8, thump(.45)); place(sfx, 1.92, thump(.4, 60))
for k in range(8): place(sfx, 2.35 + k * .05, tick(.3, 4000 + k * 300), .3)
place(sfx, 2.7, blip(900, 1800, .09, .45, .04), .5)
# 2.95 – 3.45 zoom: riser into the wipe impact
place(sfx, 2.9, riser(.55, 400, 12000, .7)); place(sfx, 3.45, boom(.9, 150, 45), 0, .7)
place(sfx, 3.45, whoosh(.5, 5000, 300, v=.55)); place(sfx, 3.45, crash(1.2), 0, .35); sidechain(3.45, .8, .25)
# 3.8: nine cards fly in
for i in range(9): place(sfx, 3.8 + i * .05, whoosh(.28, 900, 3500, v=.28), (i - 4) / 5)
# 4.85: cards morph into bars
place(sfx, 4.85, whoosh(.8, 300, 2000, v=.3))
for i in range(9): place(sfx, 5.2 + i * .035, tick(.4, 2200 + i * 120), (i - 4) / 5)
# 5.35 – 6.1 counters
for k in range(22): place(sfx, 5.35 + .75 * (1 - (1 - k / 22) ** 2), tick(.22, 5200), rng.uniform(-.5, .5))
place(sfx, 5.9, whoosh(.45, 1500, 5000, v=.25))          # "your usual" line zips across
place(sfx, 6.15, blip(1300, 1300, .06, .35, .02), .1)
# 6.45: 3.7x hit
place(sfx, 6.45, boom(.8, 160, 50), 0, .55); place(sfx, 6.45, stab([hz(72), hz(76), hz(79)], .5, .5, 7000), 0, .6); sidechain(6.45, .6, .2)
# 6.75 – 7.15 typing the creator's caption
for k in range(26): place(sfx, 6.75 + k * .0154 + rng.uniform(0, .006), tick(.28, rng.uniform(2500, 4000)), -.2)
place(sfx, 7.1, blip(220, 140, .22, .45, .1))             # "No episode 2."
# 7.5 wipe
place(sfx, 7.5, whoosh(.45, 200, 3000, v=.7)); place(sfx, 7.86, thump(.7, 50))
# break text
place(sfx, 7.9, thump(.5)); place(sfx, 8.0, thump(.45, 62))
strike = fft_filter(noise(int(.2 * SR)), 1500, 8000) * expdec(int(.2 * SR), .06)
place(sfx, 8.4, strike * np.sin(np.linspace(0, 40, len(strike))) ** 2, .2, .7)   # marker scratch
place(sfx, 8.66, whoosh(.5, 3000, 150, v=.5), .3)                                   # "measure." falls
for k in range(12): place(sfx, 8.68 + k * .018, whoosh(.12, 2500, 6000, v=.12), .8 - k * .07)
place(sfx, 8.0, riser(1.0, 300, 7000, .45))
# 9.0 stamp — drums return on beat 27
place(sfx, 9.0, kick(True), 0, .8); place(sfx, 9.0, crash(1.4), 0, .45); place(sfx, 9.0, snare(1.0), 0, .6); sidechain(9.0, .8, .22)
place(sfx, 9.15, whoosh(.45, 2000, 500, v=.3))
for k, t in enumerate((9.66, 9.76, 9.86, 9.96)): place(sfx, t, thump(.6, 55 + 6 * k), (k - 1.5) / 2)
for k in range(14): place(sfx, 10.0 + .45 * (1 - (1 - k / 14) ** 2), tick(.2, 4500), .2)
place(sfx, 10.0, blip(400, 1200, .45, .2, .3))
# tabs: every cut on the beat
T5 = beat(32)
for k in range(5):
    t = T5 + k * BEAT
    place(sfx, t - .12, whoosh(.2, 800, 6000, v=.35), (-1) ** k * .6)
    place(sfx, t, thump(.6, 60 + 8 * k)); sidechain(t, .35, .08)
place(sfx, T5, crash(1.6), 0, .5)
# 12.45 redaction tape, 12.62 morph, 12.95 logo pop
tape = tv_band(noise(int(.18 * SR)), lambda s: 1500 + 20000 * s, 1.2)
place(sfx, 12.45, tape / np.max(np.abs(tape)) * np.minimum(1, tt(len(tape)) / .01), -.3, .6)
place(sfx, 12.62, whoosh(.32, 600, 2400, v=.45))
place(sfx, 12.95, boom(2.0, 120, 30), 0, 1.0); place(sfx, 12.95, kick(True), 0, .9); place(sfx, 12.95, crash(2.4), 0, .6)
place(sfx, 12.95, blip(1600, 3200, .12, .5, .05), .6)
# lockup + wordmark + tagline
place(sfx, 13.2, whoosh(.55, 400, 1600, v=.35))
place(sfx, 13.5, whoosh(.6, 5000, 900, v=.35), .4)
place(sfx, 14.35, tick(.35, 3000))
place(sfx, 14.45, blip(700, 1600, .14, .5, .06), .15)       # pop
place(sfx, 14.55, blip(420, 150, .4, .45, .2), -.15)        # sink

# =====================================================================
# MIX
# =====================================================================
music *= duck
music = reverb(music, 1.1, .12)
sfx = reverb(sfx, 1.6, .22)
mix = .72 * music + .95 * sfx
mix = np.tanh(mix * 1.25) / np.tanh(1.25)            # glue / soft limit
fade = int(.25 * SR); mix[:, -fade:] *= np.linspace(1, 0, fade) ** 2
mix *= .93 / np.max(np.abs(mix))
out = (np.clip(mix.T, -1, 1) * 32767).astype('<i2')
with wave.open('reel-audio.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(out.tobytes())
print('wrote reel-audio.wav', mix.shape, 'peak', round(float(np.max(np.abs(mix))), 3))
