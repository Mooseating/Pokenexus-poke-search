export const rarities = {
  c: 'Common', uc: 'Uncommon', r: 'Rare', vr: 'Very rare', er: 'Extremely rare',
};

function normalize(text) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9♀♂]+/g, ' ').trim();
}

export function buildEncounters(data) {
  const encounters = [];
  for (const [location, details] of Object.entries(data)) {
    const levels = details.Levels.join('–');
    for (const method of ['Grass', 'Surfing', 'Fishing']) {
      for (const [rarity, pokemon] of Object.entries(details[method])) {
        const solo = new Set(pokemon).size === 1;
        for (const name of pokemon) {
          const displayName = name.replace(/-?alola$/i, '-Alola')
            .replace(/^./, letter => letter.toUpperCase());
          encounters.push({ name, displayName, location, method, rarity, levels, solo,
            searchable: normalize(`${name} ${displayName} ${location}`) });
        }
      }
    }
  }
  return encounters;
}

export function search(encounters, query) {
  const words = normalize(query).split(' ').filter(Boolean);
  return encounters.filter(row => words.every(word => {
    if (word === 'solo') return row.solo;
    return Object.hasOwn(rarities, word) ? row.rarity === word : row.searchable.includes(word);
  }));
}
