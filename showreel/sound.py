# RUANGKOTAK showreel soundtrack: 120 bpm bed + SFX synced to showreel.js, synthesized with numpy only.
# Instruments are shared with reel/sound.py. python3 sound.py  ->  out/showreel-audio.wav (48 kHz, 16-bit stereo, 15.0 s)
import numpy as np, wave

SR = 48000
DUR = 15.0
N = int(SR * DUR)
BEAT = 60 / 120
G0 = 0.0                     # cuts land on the grid: 1.5, 4.5, 10, 11, 13
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

def pluck(f, dur=.22, v=1.0):
    y = saw_additive(f, dur, lambda t: 500 + 6000 * np.exp(-t / .035), detune=(-.004, .004), harmonics=30)
    return v * y * expdec(len(y), .09) * np.minimum(1, tt(len(y)) / .002)

def bell(f, dur=.7, v=1.0):
    n = int(dur * SR); t = tt(n)
    y = sum(a * np.sin(2 * np.pi * f * r * t) * expdec(n, dur / (2 + 3 * k)) for k, (r, a) in enumerate([(1, 1), (2.01, .5), (3.99, .25), (5.4, .12)]))
    return v * y * np.minimum(1, t / .002)

def buzz(dur=.06, v=1.0):
    n = int(dur * SR); t = tt(n)
    y = np.sign(np.sin(2 * np.pi * 120 * t)) * .5 + fft_filter(noise(n), 1500, 6000) * .5
    return v * y * np.minimum(1, t / .003) * np.clip((dur - t) / .01, 0, 1)

# =====================================================================
# MUSIC BED  (120 bpm, 2 s bars). A minor tension -> burnout silence -> lift into C major at the logo.
# =====================================================================
AM, F, C, G = [45, 48, 52, 55], [41, 45, 48, 52], [48, 52, 55, 59], [43, 47, 50, 53]
BAR_CHORD = {0: AM, 1: F, 2: C, 3: G, 4: AM, 5: F, 6: G}   # bar k = 2k .. 2k+2 s
def section(t):
    if t < 1.5: return 'intro'
    if t < 4.5: return 'ideas'
    if t < 7.45: return 'strategy'
    if t < 10.0: return 'execution'
    if t < 11.0: return 'burnout'
    if t < 13.0: return 'diagnosis'
    return 'end'

for st in range(int(13.0 / S16)):
    t = st * S16; sec = section(t); step = st % 16
    if sec in ('intro', 'burnout', 'end'): continue
    if sec == 'ideas':
        if step in (0, 8): place(music, t, kick(), 0, .9); sidechain(t, .45, .1)
        if step in (4, 12): place(music, t, snare(.8), 0, .65)
        if step % 2 == 0: place(music, t, hat(v=.45 if step % 4 else .25), .25)
    elif sec == 'strategy':
        if step in (0, 3, 8, 10): place(music, t, kick(), 0, .95); sidechain(t, .5, .1)
        if step in (4, 12): place(music, t, snare(), 0, .8)
        if step in (7, 15): place(music, t, snare(.25), .1, .6)
        place(music, t, hat(v=.5 if step % 2 == 0 else .25), .25 if step % 2 else -.2)
    elif sec == 'execution':
        if step % 4 == 0 or step == 14: place(music, t, kick(), 0, 1.0); sidechain(t, .55, .09)
        if step in (4, 12) and t < 9.0: place(music, t, snare(), 0, .85)
        place(music, t, hat(v=.55 if step % 2 == 0 else .3), .25 if step % 2 else -.25)
        if t > 8.5: place(music, t + S16 / 2, hat(v=.25), .4)
        if step % 4 == 2: place(music, t, hat(True, .3), .3)
    elif sec == 'diagnosis':
        if t < 11.0 + 1e-6: continue
        if step in (0, 8): place(music, t, kick(), 0, .95); sidechain(t, .5, .12)
        if step in (4, 12): place(music, t, snare(.9), 0, .7)
        if step % 4 == 2: place(music, t, hat(True, .4), .3)
        elif step % 2 == 0: place(music, t, hat(v=.35), -.25)

# snare roll 9.0 -> 10.0, accelerating, into the crash
t = 9.0; k = 0
while t < 9.995:
    place(music, t, snare(.3 + .6 * (t - 9.0)), (k % 2 - .5) * .3, .7)
    t += S16 if t < 9.5 else S16 / 2 if t < 9.8 else S16 / 4; k += 1

# reese bass + sub per bar, muted in the intro, the burnout and after the logo
def bass_span(t0, t1, chord, bright):
    dur = t1 - t0; root = chord[0]
    reese = np.tanh(2.2 * saw_additive(hz(root - 12), dur, bright, detune=(-.012, 0, .011), harmonics=50))
    tl = tt(len(reese)); sub = np.sin(2 * np.pi * hz(root - 24) * tl)
    env = np.minimum(1, tl / .01) * np.clip((dur - tl) / .02, 0, 1)
    place(music, t0, (reese * .6 + sub * .8) * env, 0, .5)
for bar in range(5):
    t0, t1 = max(1.5, bar * 2.0), min(10.0, bar * 2.0 + 2.0)
    if t1 <= t0: continue
    b0 = bar
    bass_span(t0, t1, BAR_CHORD[bar], lambda t, b0=b0: 300 + 350 * b0 + 600 * np.sin(np.pi * t / BEAT) ** 2)
bass_span(11.0, 12.0, F, lambda t: 1400 + 800 * np.sin(np.pi * t / BEAT) ** 2)
bass_span(12.0, 13.0, G, lambda t: 1600 + 900 * np.sin(np.pi * t / BEAT) ** 2)
# intro drone (A), swells into the first downbeat
n = int(1.5 * SR); ti = tt(n)
place(music, 0.0, np.sin(2 * np.pi * hz(33) * ti) * (ti / 1.5) ** 1.5 * .5, 0, .8)

# ideas: sparkling 16th-note arpeggio once the bulb is on
for st in range(int(2.25 / S16), int(4.5 / S16)):
    t = st * S16; ch = BAR_CHORD[int(t // 2)]
    m = ch[[0, 1, 2, 3, 2, 1][st % 6]] + 24
    place(music, t, pluck(hz(m), .2), .45 * np.sin(st * .9), .32)
# strategy + execution: offbeat chord stabs (every 8th in execution)
for st in range(int(4.5 / S16), int(10.0 / S16)):
    t = st * S16; ch = [hz(m + 12) for m in BAR_CHORD[int(t // 2)]]
    if section(t) == 'strategy' and st % 4 == 2: place(music, t, stab(ch, .18), .2 * (1 if st % 8 < 4 else -1), .24)
    if section(t) == 'execution' and st % 2 == 1: place(music, t, stab(ch, .12, bright=5200), .3 * (-1) ** st, .2)
# diagnosis: bright house stabs on the offbeat
for st in range(int(11.0 / S16), int(13.0 / S16)):
    t = st * S16
    if st % 4 == 2: place(music, t, stab([hz(m + 12) for m in BAR_CHORD[int(t // 2)]], .22, bright=6500), .25 * (-1) ** (st // 4), .3)
# final C major 9 at the logo landing, long tail
LOGO = 13.36
fin = sum(saw_additive(hz(m), 1.7, lambda t: 500 + 3500 * np.exp(-t / .3), detune=(-.008, 0, .008), harmonics=40) for m in (60, 64, 67, 71, 74))
fin *= expdec(len(fin), .8) * np.minimum(1, tt(len(fin)) / .005) / 5
place(music, LOGO, fin, 0, .85)
place(music, LOGO, np.sin(2 * np.pi * hz(24) * tt(int(1.7 * SR))) * expdec(int(1.7 * SR), .7), 0, .55)

# =====================================================================
# SFX  (times match showreel.js)
# =====================================================================
# 0 – 0.32 square falls, lands
place(sfx, 0.0, blip(2600, 420, .32, .3, tau=10))
place(sfx, .32, kick(True), 0, .8); place(sfx, .32, boom(.9, 130, 38), 0, .6); sidechain(.32, .9, .25)
# 0.62 splits into three tiles, labels pop
for i, p in enumerate((-.6, 0, .6)): place(sfx, .6 + i * .03, whoosh(.3, 700, 3200, v=.35), p)
for i, p in enumerate((-.6, 0, .6)): place(sfx, .85 + i * .06, blip(hz(76 + 3 * i), None, .06, .4, .025), p)
# 1.28 – 1.72 zoom into the Ideas tile
place(sfx, 1.25, whoosh(.5, 300, 4000, v=.55)); place(sfx, 1.5, crash(1.4), 0, .35)
# 1.6 – 2.05 bulb drawn in pencil
sc = tv_band(noise(int(.45 * SR)), lambda s: 2500 + 1500 * np.sin(s * 60), 1.0)
place(sfx, 1.6, sc / np.max(np.abs(sc)) * np.sin(np.linspace(0, np.pi, len(sc))), .1, .22)
# flicker, then on
place(sfx, 2.05, buzz(.06, .35)); place(sfx, 2.16, buzz(.12, .35))
place(sfx, 2.35, bell(hz(88), .9, .45), 0); place(sfx, 2.35, bell(hz(95), .7, .2), .2)
# 14 notes pop out of the bulb
PENTA = [0, 3, 5, 7, 10]
for i in range(14):
    m = 72 + PENTA[i % 5] + 12 * (i // 5)
    place(sfx, 2.12 + i * .085 + .03, blip(hz(m), hz(m) * 1.06, .07, .4, .025), np.sin(i * 2.4) * .8)
place(sfx, 3.95, whoosh(.45, 3000, 400, v=.3)); place(sfx, 4.3, blip(900, 300, .12, .25, .05))
# 4.35 calendar lines draw, 4.5+ notes snap into cells
for k in range(10): place(sfx, 4.35 + k * .045, tick(.22, 2500 + k * 200), -.8 + k * .18)
for i in range(14):
    t = 4.5 + i * .045 + .14
    place(sfx, t, thump(.35, 90 + 4 * i), np.sin(i * 1.7) * .6); place(sfx, t, tick(.3, 3500), np.sin(i * 1.7) * .6)
# 5.55 – 6.95 red strings tangle, pins pop
zip_ = tv_band(noise(int(1.4 * SR)), lambda s: 900 * 3 ** (s / 1.4) * (1 + .3 * np.sin(s * 40)), .8)
place(sfx, 5.55, zip_ / np.max(np.abs(zip_)) * np.minimum(1, tt(len(zip_)) / .05), -.2, .22)
for k in range(13):
    v = k / 12; t = 5.55 + 1.4 * (np.arccos(1 - 2 * v) / np.pi)
    place(sfx, t, blip(hz(64 + k % 4), None, .05, .3, .015), np.sin(k * 2.1) * .7)
place(sfx, 6.1, riser(1.2, 300, 9000, .55))
# 7.28 – 7.62 whip pan
place(sfx, 7.24, whoosh(.42, 250, 7000, curve=1.2, v=.9)); place(sfx, 7.5, thump(.8, 55)); place(sfx, 7.5, crash(1.2), 0, .35); sidechain(7.5, .7, .2)
# REC beeps
place(sfx, 7.68, blip(1000, None, .06, .3, .04), .1); place(sfx, 7.78, blip(1000, None, .06, .3, .04), .1)
# notifications, faster and faster
PINGS = [7.95, 8.3, 8.6, 8.85, 9.08, 9.28, 9.46]
for i, t in enumerate(PINGS):
    p = -.5 if i % 2 == 0 else .5
    place(sfx, t, blip(hz(84), None, .07, .45, .04), p); place(sfx, t + .07, blip(hz(91), None, .12, .4, .06), p)
    place(sfx, t - .04, whoosh(.16, 1500, 5000, v=.18), p)
# rumble + riser into the crash
rm = fft_filter(noise(int(1.6 * SR)), 30, 160, slope=2)
place(sfx, 8.4, rm / np.max(np.abs(rm)) * (tt(len(rm)) / 1.6) ** 2, 0, .5)
place(sfx, 8.9, riser(1.1, 400, 12000, .7))
# 10.0 BURNOUT: hard stop, impact, everything falls
place(sfx, 10.0, kick(True), 0, 1.0); place(sfx, 10.0, boom(.9, 160, 28), 0, 1.0); place(sfx, 10.0, crash(.8), 0, .45)
dist = np.tanh(6 * fft_filter(noise(int(.35 * SR)), 80, 3000)) * expdec(int(.35 * SR), .08)
place(sfx, 10.0, dist, 0, .35)
for k in range(5): place(sfx, 10.04 + k * .05, whoosh(.45, 2500 - k * 300, 150, v=.3), (k - 2) / 2.5)
place(sfx, 10.12, thump(.8, 48))
# crack
snap = fft_filter(noise(int(.09 * SR)), 2500, 16000, slope=2) * expdec(int(.09 * SR), .012)
place(sfx, 10.42, snap, 0, .8)
for k in range(9): place(sfx, 10.43 + k * .013, tick(.35, 6000 + 700 * k), np.sin(k * 3) * .7)
# tinnitus + heartbeat in the silence, reverse swell into the reveal
nt = int(.95 * SR); ttn = tt(nt)
place(sfx, 10.05, np.sin(2 * np.pi * 3800 * ttn) * np.minimum(1, ttn / .2) * np.clip((.95 - ttn) / .3, 0, 1), 0, .05)
for t, v in ((10.58, 1.0), (10.74, .8)): place(sfx, t, thump(v, 52))
place(sfx, 10.6, riser(.42, 200, 9000, .6))
# 11.0 reveal: the circle opens
place(sfx, 11.0, whoosh(.5, 5000, 500, v=.6)); place(sfx, 11.0, kick(True), 0, .7); place(sfx, 11.0, crash(1.6), 0, .4)
place(sfx, 11.0, stab([hz(m) for m in (65, 69, 72, 76, 79)], .9, .55, 7000), 0, .5)
for i in range(3): place(sfx, 11.3 + i * .12, whoosh(.25, 700, 3000, v=.3), (i - 1) * .5)
# checks: C E G
for i, m in enumerate((84, 88, 91)): place(sfx, 11.86 + i * .18, bell(hz(m), .6, .4), (i - 1) * .4)
# battery recharges
ch = int(1.25 * SR); tc = tt(ch)
place(sfx, 11.35, np.sin(2 * np.pi * np.cumsum(300 * 4 ** (tc / 1.25)) / SR) * (tc / 1.25) * .5, 0, .18)
place(sfx, 12.6, bell(hz(96), .5, .3), .5)
# 12.95 cards get sucked away, square drops, LOGO
place(sfx, 12.95, whoosh(.35, 600, 4000, v=.4))
place(sfx, 13.08, blip(2600, 500, .28, .3, tau=10))
place(sfx, LOGO, kick(True), 0, .95); place(sfx, LOGO, boom(2.0, 120, 30), 0, .95); place(sfx, LOGO, crash(2.4), 0, .55)
place(sfx, 13.4, thump(.5, 70))
place(sfx, 13.48, whoosh(.55, 600, 2600, v=.4), .3)
place(sfx, 13.95, tick(.3, 3200))
mk = tv_band(noise(int(.3 * SR)), lambda s: 2000 + 4000 * s, 1.0)
place(sfx, 14.15, mk / np.max(np.abs(mk)) * np.sin(np.linspace(0, np.pi, len(mk))), .2, .3)   # highlighter swipe
place(sfx, 14.2, blip(700, 1600, .14, .5, .06), .1)                                              # url pop

# =====================================================================
# MIX
# =====================================================================
music *= duck
music = reverb(music, 1.1, .12)
sfx = reverb(sfx, 1.5, .2)
# burnout: let the room go quiet after the impact (tinnitus and heartbeat stay audible)
g = np.ones(N); i0, i1 = int(10.25 * SR), int(10.98 * SR)
g[i0:i1] = np.interp(np.arange(i0, i1), [i0, i0 + int(.2 * SR), i1 - int(.05 * SR), i1], [1, .35, .35, 1])
sfx *= g
mix = .7 * music + .95 * sfx
mix = np.tanh(mix * 1.05) / np.tanh(1.05)          # gentle glue; loudness is set at mux time (-14 LUFS)
fade = int(.3 * SR); mix[:, -fade:] *= np.linspace(1, 0, fade) ** 2
mix *= .89 / np.max(np.abs(mix))
import os
os.makedirs(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out'), exist_ok=True)
path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', 'showreel-audio.wav')
out = (np.clip(mix.T, -1, 1) * 32767).astype('<i2')
with wave.open(path, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(out.tobytes())
print('wrote', path, mix.shape, 'peak', round(float(np.max(np.abs(mix))), 3))
