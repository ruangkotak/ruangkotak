/* Demo extraction so the flow is fully operable with no API key.
   Clearly flagged in the UI — never presented as a real reading. */
export function demoExtraction(answers) {
  return {
    looks_like_instagram: true,
    metrics: {
      views: 941, accounts_reached: 386, profile_visits: 65,
      new_follows: null, total_followers: 2783, interactions: null,
    },
    profile: {
      handle: null,
      bio_text: 'Tech reviews · KL',
      has_link: true,
      highlight_count: 4,
      grid_format_mix: 'mostly reels, a few carousels',
    },
    axes: { clarity: 38, cadence: 61, format_fit: 34, path: 72 },
    axis_notes: {
      clarity: 'The bio names a category but not a person it is for.',
      cadence: 'Posting is regular, roughly every other day across the visible grid.',
      format_fit: 'Reels dominate the grid while reach per post stays flat, so length is likely working against them.',
      path: 'A link and four highlights are present, but nothing names an offer.',
    },
    pillars: ['tech reviews', 'gear comparisons', 'day-in-KL shooting'],
    read: 'You are shipping on a real beat, which puts you ahead of most. What is missing is a reason for a stranger to stay — the grid reads as a category, not as a person with a point of view.',
    fix_this_week: 'Rewrite the bio to name who it is for, then post three reels under 45 seconds that each answer one question that audience actually asks.',
    _demo: true,
  };
}
