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
  { name: 'Ancient Dungeon — Land', map: 'Ancient Dungeon', methods: ['Grass'] },
];

export function areaSpawns(data, areaName, method) {
  const area = areas.find(a => a.name === areaName);
  if (!area || !area.methods.includes(method)) throw new Error('Choose a listed area and encounter method.');
  const details = data[area.map];
  if (!details || !Array.isArray(details.Levels)) throw new Error(`Missing spawn data for ${area.map}.`);
  const [low, high] = details.Levels;
  if (!Number.isInteger(low) || low < 1 || low > 100 || low !== high) {
    throw new Error('This calculator requires a fixed wild level; a level range needs its own probability distribution.');
  }
  const bySpecies = new Map();
  for (const [rarity, names] of Object.entries(details[method] || {})) {
    for (const name of names) {
      if (!bySpecies.has(name)) bySpecies.set(name, { name, rarities: [], level: low });
      if (!bySpecies.get(name).rarities.includes(rarity)) bySpecies.get(name).rarities.push(rarity);
    }
  }
  if (!bySpecies.size) throw new Error('No encounters found for this method.');
  return [...bySpecies.values()];
}
