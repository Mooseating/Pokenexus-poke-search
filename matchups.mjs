// Classification uses unrounded probabilities, never the displayed 0.0% / 100.0% values.
const epsilon = 1e-12;

export function matchupState(matchup) {
  const known = matchup.moves.filter(cell => !cell.error && Number.isFinite(cell.chance) &&
    Number.isFinite(cell.upper ?? cell.chance));
  const unknown = known.length !== matchup.moves.length || !known.length;
  const sampled = known.some(cell => cell.estimated);
  return {
    unknown, sampled,
    possible: known.some(cell => (cell.upper ?? cell.chance) > 0),
    guaranteed: known.some(cell => !cell.estimated && cell.chance >= 1 - epsilon),
    cannot: !unknown && !sampled && known.every(cell => (cell.upper ?? cell.chance) === 0),
    abilityDependent: known.some(cell => (cell.upper ?? cell.chance) - cell.chance > epsilon),
  };
}

export function filterMatchups(matchups, filter) {
  return matchups.filter(row => {
    if (filter === 'all') return true;
    if (filter.startsWith('move:')) {
      const cell = row.moves.find(m => m.move === filter.slice(5));
      return Boolean(cell && !cell.error && (cell.upper ?? cell.chance) > 0);
    }
    const state = matchupState(row);
    if (filter === 'guaranteed') return state.guaranteed;
    if (filter === 'never') return state.cannot;
    if (filter === 'not-guaranteed') return !state.guaranteed;
    if (filter === 'uncertain') return state.unknown || state.sampled;
    return false;
  });
}

function probability(value) {
  const p = Math.max(0, Math.min(1, value));
  if (p === 0) return '0%';
  if (p >= 1 - epsilon) return '100%';
  if (p < 0.001) return '<0.1%';
  if (p > 0.999) return '>99.9%';
  return `${(p * 100).toFixed(1)}%`;
}

export function chanceLabel(cell) {
  const upper = cell.upper ?? cell.chance;
  if (cell.error || !Number.isFinite(cell.chance) || !Number.isFinite(upper)) return 'Unknown';
  return (cell.estimated ? '≈ ' : '') + probability(cell.chance) +
    (upper - cell.chance > epsilon ? `–${probability(upper)} (ability-dependent)` : '');
}
