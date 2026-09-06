/* Diagnosis is computed here from the axis scores — never by the model.
   That guarantees one account always yields one diagnosis. */

export const DIAGNOSES = {
  'dead-air': {
    name: 'Dead Air',
    signature: 'cadence ↓ · clarity ↓',
    read: 'Barely posting, and when you do there is no through-line. The account cannot build on itself because there is nothing to build on.',
    fix: 'Pick one sentence about who you help. Post three times against it this week. Nothing else.',
  },
  'test-pattern': {
    name: 'Test Pattern',
    signature: 'cadence ↑ · clarity ↓',
    read: 'Shipping constantly and unrecognisable for it. The work rate is real — it is pointed at nothing in particular, so nothing accumulates.',
    fix: 'Write your three pillars down. Bin any planned post that does not sit inside one of them.',
  },
  'wrong-lens': {
    name: 'Wrong Lens',
    signature: 'clarity ↑ · format fit ↓',
    read: 'You know exactly what you are about, and you are making it in the format your account rewards least. Good work, wrong container.',
    fix: 'Rank your last twenty by views. Make five more of whatever the top three share — length, format, hook — before you try anything new.',
  },
  'off-mic': {
    name: 'Off Mic',
    signature: 'clarity ↑ · path ↓',
    read: 'People arrive, understand you, and hit a wall. No link worth tapping, no offer, nowhere for interest to land. Attention with no exit.',
    fix: 'Put one destination in the bio and name it out loud in three captions. One destination, not a link tree of nine.',
  },
  'locked-off': {
    name: 'Locked Off',
    signature: 'all four mid · none moving',
    read: 'Everything is fine and nothing compounds. Steady posting, steady numbers, steady for months. The account is running; the frame never moves.',
    fix: 'Take your best performer and make three variants of it. Fine is the thing to break, not the thing to protect.',
  },
  'rolling': {
    name: 'Rolling',
    signature: 'all four green',
    read: 'Clear, consistent, in the right format, with somewhere to send people. What is missing is volume and a plan — which is the point where paying someone starts returning more than it costs.',
    fix: 'Nothing is broken. This is the one where more hands is the honest recommendation, not a fix.',
  },
};

const WEIGHTS = { clarity: 0.30, cadence: 0.25, format_fit: 0.25, path: 0.20 };

export function scoreOf(axes) {
  const total = Object.entries(WEIGHTS)
    .reduce((sum, [k, w]) => sum + (axes[k] ?? 0) * w, 0);
  return Math.round(total);
}

export function diagnose(axes) {
  const { clarity = 0, cadence = 0, format_fit = 0, path = 0 } = axes;
  const low = v => v < 45;
  const high = v => v >= 60;

  if (clarity >= 60 && cadence >= 60 && format_fit >= 55 && path >= 55) return 'rolling';
  if (low(cadence) && low(clarity)) return 'dead-air';
  if (high(cadence) && low(clarity)) return 'test-pattern';
  if (high(clarity) && low(format_fit)) return 'wrong-lens';
  if (clarity >= 55 && low(path)) return 'off-mic';

  // Nothing matched a named pattern: the weakest axis decides, unless
  // nothing is actually weak — in which case it is fine-but-flat.
  const map = { clarity: 'test-pattern', cadence: 'dead-air', format_fit: 'wrong-lens', path: 'off-mic' };
  let weakestKey = 'clarity';
  for (const k of Object.keys(map)) {
    if ((axes[k] ?? 0) < (axes[weakestKey] ?? 0)) weakestKey = k;
  }
  if ((axes[weakestKey] ?? 0) >= 50) return 'locked-off';
  return map[weakestKey];
}

export function buildReport(extraction, answers) {
  const axes = extraction.axes;
  const key = diagnose(axes);
  const dx = DIAGNOSES[key];

  // Metrics with a real value only. A missing number drops its tile rather
  // than printing an em dash into a document someone sends to a brand.
  const labels = {
    total_followers: 'followers',
    accounts_reached: 'accounts reached · 30d',
    views: 'views · 30d',
    profile_visits: 'profile visits · 30d',
    new_follows: 'new follows · 30d',
    interactions: 'interactions · 30d',
  };
  const tiles = Object.entries(labels)
    .filter(([k]) => typeof extraction.metrics?.[k] === 'number')
    .map(([k, label]) => ({ key: k, label, value: extraction.metrics[k] }));

  const missing = Object.keys(labels).filter(k => typeof extraction.metrics?.[k] !== 'number');

  return {
    diagnosis: { key, ...dx },
    score: scoreOf(axes),
    axes,
    axis_notes: extraction.axis_notes ?? {},
    read: extraction.read || dx.read,
    fix: extraction.fix_this_week || dx.fix,
    // Pillars come from the posts. The diagnosis name can never reach this field.
    pillars: (extraction.pillars ?? []).filter(Boolean).slice(0, 3),
    tiles,
    missing,
    profile: extraction.profile ?? {},
    answers,
  };
}
