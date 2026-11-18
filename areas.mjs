const noBoost = { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 };
const moonModifiers = { player: noBoost, wild: { hp: 1.5, atk: 1.5, def: 1.5, spa: 1.5, spd: 1.5, spe: 1 } };
const dungeonModifiers = { player: noBoost, wild: { hp: 1.65, atk: 1.65, def: 1.65, spa: 1.65, spd: 1.65, spe: 1 } };

export const areas = [
  { name: "Mewtwo's Lair", map: "Mewtwo's Lair", methods: ['Grass'] },
  { name: 'Whirl Islands B3', map: 'Whirl Islands B3', methods: ['Grass', 'Surfing', 'Fishing'] },
  { name: 'Tin Tower Roof', map: 'Tin Tower Roof', methods: ['Grass'] },
  { name: 'Cave of Origin — Land', map: 'Cave of Origin', methods: ['Grass'] },
  { name: 'Cave of Origin — Water', map: 'Cave of Origin', methods: ['Surfing', 'Fishing'] },
  { name: 'Sky Pillar 1F', map: 'Sky Pillar 1F', methods: ['Grass'] },
  ...['Time', 'Space', 'Distortion World', 'Purified World'].map(world => ({
    name: `Spear Pillar (${world})`, map: `Spear Pillar (${world})`, methods: ['Grass'],
  })),
  { name: 'Dragonspiral Tower 1F', map: 'Dragonspiral Tower 1F', methods: ['Grass', 'Surfing', 'Fishing'] },
  { name: 'Dragonspiral Tower 2F', map: 'Dragonspiral Tower 2F', methods: ['Grass'] },
  { name: 'Ancient Dungeon — Land', map: 'Ancient Dungeon', methods: ['Grass'], modifiers: dungeonModifiers },
  { name: 'New Moon Island', map: 'Deep New Moon Island', methods: ['Grass'], modifiers: moonModifiers },
  { name: 'Full Moon Island', map: 'Deep Full Moon Island', methods: ['Grass'], modifiers: moonModifiers },
  { name: 'Stark Mountain E', map: 'Stark Mountain Entrance', methods: ['Grass'], modifiers: moonModifiers },
  { name: 'Stark Mountain V', map: 'Stark Mountain Volcano', methods: ['Grass'], modifiers: moonModifiers },
  { name: 'Stark Mountain C', map: 'Stark Mountain Chamber', methods: ['Grass'], modifiers: moonModifiers },
];

export function calculatorAreas(data) {
  const customMaps = new Set(areas.map(area => area.map));
  const regular = [];
  for (const [map, details] of Object.entries(data)) {
    if (customMaps.has(map)) continue;
    const levels = details.Levels;
    if (!Array.isArray(levels) || levels.length !== 2 ||
        !levels.every(level => Number.isInteger(level) && level >= 1 && level <= 100) || levels[0] > levels[1]) continue;
    const methods = ['Grass', 'Surfing', 'Fishing'].filter(method =>
      Object.values(details[method] || {}).some(names => Array.isArray(names) && names.length > 0));
    if (methods.length) regular.push({ name: map, map, methods, level: Math.max(...levels),
      modifiers: { player: noBoost, wild: noBoost } });
  }
  return [...areas, ...regular.sort((a, b) => a.name.localeCompare(b.name))];
}

export function areaSpawns(data, areaName, method) {
  const area = calculatorAreas(data).find(a => a.name === areaName);
  if (!area || !area.methods.includes(method)) throw new Error('Choose a listed area and encounter method.');
  const details = data[area.map];
  if (!details) throw new Error(`Missing spawn data for ${area.map}.`);
  const bySpecies = new Map();
  for (const [rarity, names] of Object.entries(details[method] || {})) {
    for (const name of names) {
      if (!bySpecies.has(name)) bySpecies.set(name, { name, rarities: [], level: area.level ?? 100 });
      if (!bySpecies.get(name).rarities.includes(rarity)) bySpecies.get(name).rarities.push(rarity);
    }
  }
  if (!bySpecies.size) throw new Error('No encounters found for this method.');
  return [...bySpecies.values()];
}
