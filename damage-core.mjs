import calc from '@smogon/calc';
import { Teams } from '@pkmn/sets';
import mechanics from '@smogon/calc/dist/mechanics/util.js';
import data from './gen7-data.mjs';

export const gen = calc.Generations.get(7);
export const stats = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
export const playerMultipliers = { hp: 1, atk: 2.5, def: 2, spa: 2.5, spd: 2, spe: 2 };
export const wildMultipliers = { hp: 2, atk: 1, def: 2, spa: 1, spd: 2, spe: 1 };
export const disabledAbilities = new Set(['Intimidate', 'Innards Out', 'Sturdy', 'Cursed Body', 'Aftermath', 'Rough Skin', 'Iron Barbs']);
const abilityLabel = ability => disabledAbilities.has(ability) ? `${ability} (disabled)` : ability;
export const oneHpMoves = new Set(['Flail', 'Reversal']);
const samples = 512;
const unsupported = new Set(['Counter', 'Mirror Coat', 'Metal Burst', 'Bide', 'Beat Up', 'Present', 'Magnitude',
  'Sucker Punch', 'Focus Punch', 'Shell Trap', 'Beak Blast', 'Last Resort', 'Revenge', 'Avalanche',
  'Assurance', 'Future Sight', 'Doom Desire', 'Spit Up', 'Natural Gift', 'Psywave', 'Struggle', 'Snore', 'Belch', 'Fling']);
const hpDependent = new Set(['Crush Grip', 'Wring Out', 'Endeavor', "Nature's Madness", 'Super Fang']);
const speedDependent = new Set(['Electro Ball', 'Gyro Ball', 'Payback']);
const weather = { Drought: 'Sun', Drizzle: 'Rain', 'Sand Stream': 'Sand', 'Snow Warning': 'Hail',
  'Desolate Land': 'Harsh Sunshine', 'Primordial Sea': 'Heavy Rain', 'Delta Stream': 'Strong Winds' };
const terrain = { 'Electric Surge': 'Electric', 'Grassy Surge': 'Grassy', 'Misty Surge': 'Misty', 'Psychic Surge': 'Psychic' };

export function boostedPokemon(name, options, multipliers, round = Math.floor) {
  function apply(pokemon, currentHP) {
    for (const stat of stats) {
      pokemon.rawStats[stat] = Math.max(1, round(pokemon.rawStats[stat] * multipliers[stat]));
      pokemon.stats[stat] = pokemon.rawStats[stat];
    }
    pokemon.originalCurHP = currentHP === undefined ? pokemon.rawStats.hp : Math.max(1, Math.min(currentHP, pokemon.rawStats.hp));
    // The calculator rebuilds stats on clone; preserve both area calibration and the current HP assumption.
    pokemon.clone = () => apply(calc.Pokemon.prototype.clone.call(pokemon), pokemon.originalCurHP);
    return pokemon;
  }
  const pokemon = new calc.Pokemon(gen, name, options);
  if (disabledAbilities.has(pokemon.ability)) pokemon.ability = '(No Ability)';
  if (pokemon.ability === 'Slow Start') pokemon.abilityOn = true;
  return apply(pokemon, options?.curHP ?? options?.originalCurHP);
}

export function preparePlayer(paste, multipliers = playerMultipliers) {
  if (typeof paste !== 'string' || paste.length > 10000) throw new Error('Paste one Showdown set (under 10,000 characters).');
  const team = Teams.importTeam(paste)?.team;
  if (team?.length !== 1) throw new Error('Paste exactly one Pokémon set.');
  const set = team[0];
  let species = data.species[calc.toID(set.species)];
  if (!species) throw new Error(`Unknown Gen 7 Pokémon: ${set.species || '(missing)'}`);
  const item = set.item ? data.items[calc.toID(set.item)] : null;
  if (set.item && !item) throw new Error(`Unknown Gen 7 item: ${set.item}`);
  const primal = item?.name === 'Red Orb' && species.name === 'Groudon' ? 'Groudon-Primal'
    : item?.name === 'Blue Orb' && species.name === 'Kyogre' ? 'Kyogre-Primal' : null;
  const forme = item?.megaStone?.[species.name] || primal;
  if (forme) species = data.species[calc.toID(forme)];
  const ability = forme ? species.abilities[0] : set.ability || species.abilities[0];
  if (!species.abilities.includes(ability)) throw new Error(`${ability} is not a supported ability for ${species.name}.`);
  if (ability === 'Rivalry') throw new Error('Rivalry needs wild gender probabilities, which are not modeled yet.');
  if (ability === 'Stance Change' && !species.name.includes('Blade')) {
    throw new Error('For Stance Change, paste Aegislash-Blade as the attacking form.');
  }
  const level = 100;
  const nature = set.nature || 'Serious';
  if (!data.natures.includes(nature)) throw new Error(`Unknown nature: ${nature}`);
  const ivs = {}, evs = {};
  for (const stat of stats) {
    ivs[stat] = set.ivs?.[stat] ?? 31;
    evs[stat] = set.evs?.[stat] ?? 0;
    if (!Number.isInteger(ivs[stat]) || ivs[stat] < 0 || ivs[stat] > 31 ||
        !Number.isInteger(evs[stat]) || evs[stat] < 0 || evs[stat] > 252) throw new Error('IVs must be 0–31 and EVs 0–252 per stat.');
  }
  if (Object.values(evs).reduce((a, b) => a + b, 0) > 510) throw new Error('Player EV total cannot exceed 510.');
  if (!set.moves?.length || set.moves.length > 4) throw new Error('Provide 1–4 moves.');
  const moves = [], warnings = [];
  if (disabledAbilities.has(ability)) warnings.push(`${ability} is disabled in PokeNexus; its effects are not applied.`);
  for (const name of set.moves) {
    const move = gen.moves.get(calc.toID(name));
    if (!move) throw new Error(`Unknown Gen 7 move: ${name}`);
    const meta = data.moves[calc.toID(move.name)];
    if (move.category === 'Status' || meta?.isZ || meta?.ohko || meta?.multiaccuracy || unsupported.has(move.name)) {
      warnings.push(`${move.name}: not modeled (status/setup, Z/OHKO move, or an unsupported battle prerequisite/random effect).`);
    } else moves.push(move.name);
  }
  if (!moves.length) throw new Error('No supported damaging moves in that set.');
  const happiness = set.happiness ?? (moves.includes('Frustration') && !moves.includes('Return') ? 0 : 255);
  if (!Number.isInteger(happiness) || happiness < 0 || happiness > 255) throw new Error('Happiness must be 0–255.');
  const moveOverrides = {
    Return: { basePower: Math.max(1, Math.floor(happiness / 2.5)) },
    Frustration: { basePower: Math.max(1, Math.floor((255 - happiness) / 2.5)) },
  };
  if (moves.includes('Foul Play') && multipliers === playerMultipliers) warnings.push('Foul Play uses wild Attack; its ×1.33 area modifier is intentionally ignored as requested.');
  const pokemon = boostedPokemon(species.name, { level, item: item?.name, ability, nature, ivs, evs,
    gender: set.gender, moves }, multipliers);
  return { pokemon, moves: [...new Set(moves)], moveOverrides, warnings, abilityLabel: abilityLabel(ability) };
}

function entryField(attacker, defender, tie = 0) {
  const field = new calc.Field();
  const speed = p => mechanics.getFinalSpeed(gen, p, field, field.attackerSide);
  const slower = speed(attacker) < speed(defender) || (speed(attacker) === speed(defender) && tie === 0)
    ? [defender, attacker] : [attacker, defender];
  const strong = slower.filter(p => ['Desolate Land', 'Primordial Sea', 'Delta Stream'].includes(p.ability));
  for (const p of strong.length ? strong : slower) if (weather[p.ability]) field.weather = weather[p.ability];
  for (const p of slower) if (terrain[p.ability]) field.terrain = terrain[p.ability];
  if ([attacker.ability, defender.ability].some(a => ['Air Lock', 'Cloud Nine'].includes(a))) field.weather = undefined;
  return field;
}

function accuracy(move, attacker, defender, field) {
  const meta = data.moves[calc.toID(move.name)];
  if (attacker.hasAbility('No Guard') || defender.hasAbility('No Guard') || meta.accuracy === true) return 1;
  if (['Thunder', 'Hurricane'].includes(move.name) && ['Rain', 'Heavy Rain'].includes(field.weather)) return 1;
  if (move.name === 'Blizzard' && field.weather === 'Hail') return 1;
  let value = meta.accuracy;
  if (['Thunder', 'Hurricane'].includes(move.name) && ['Sun', 'Harsh Sunshine'].includes(field.weather)) value = 50;
  if (attacker.hasAbility('Compound Eyes')) value *= 1.3;
  if (attacker.hasAbility('Hustle') && move.category === 'Physical') value *= 0.8;
  if (attacker.hasAbility('Victory Star')) value *= 1.1;
  if (attacker.hasItem('Wide Lens')) value *= 1.1;
  if (attacker.hasItem('Zoom Lens') && mechanics.getFinalSpeed(gen, attacker, field, field.attackerSide) <
      mechanics.getFinalSpeed(gen, defender, field, field.defenderSide)) value *= 1.2;
  if (defender.hasAbility('Sand Veil') && field.weather === 'Sand') value *= 0.8;
  if (defender.hasAbility('Snow Cloak') && field.weather === 'Hail') value *= 0.8;
  return Math.min(1, value / 100);
}

function hitCounts(name, attacker) {
  const meta = data.moves[calc.toID(name)];
  if (!meta.multihit) return [[1, 1]];
  if (typeof meta.multihit === 'number') return [[meta.multihit, 1]];
  if (attacker.hasAbility('Skill Link')) return [[meta.multihit[1], 1]];
  if (name === 'Water Shuriken' && attacker.name === 'Greninja-Ash') return [[3, 1]];
  return [[2, 0.35], [3, 0.35], [4, 0.15], [5, 0.15]];
}

function matrix(damage) {
  if (typeof damage === 'number') return [[damage]];
  return Array.isArray(damage[0]) ? damage : [damage];
}

export function damageDistribution(hits) {
  let distribution = new Map([[0, 1]]);
  for (const rolls of hits) {
    const next = new Map();
    for (const [total, probability] of distribution) for (const damage of rolls) {
      next.set(total + damage, (next.get(total + damage) || 0) + probability / rolls.length);
    }
    distribution = next;
  }
  return distribution;
}

function koProbability(hits, hp, ability, move, distribution) {
  if (['False Swipe', 'Hold Back'].includes(move)) return 0;
  if (ability === 'Disguise') hits = [[0], ...hits.slice(1)]; // Gen 7 Disguise has no HP cost.
  let chance = 0;
  for (const [damage, p] of distribution || damageDistribution(hits)) if (damage >= hp) chance += p;
  return chance;
}

function fullIVSamples() {
  let seed = 0x504f4b45;
  return Array.from({ length: samples }, () => Object.fromEntries(stats.map(stat => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return [stat, seed >>> 27];
  })));
}
// shortcut: sample extra IV dimensions; enumerate them when tighter precision is needed for stat-dependent moves.
const sampledIVs = fullIVSamples();

function needsSampling(name, attacker, ability) {
  return ['Foul Play', 'Photon Geyser'].includes(name) || speedDependent.has(name) ||
    ['Download', 'Analytic'].includes(attacker.ability) || attacker.item === 'Zoom Lens' ||
    (weather[attacker.ability] && weather[ability] && weather[attacker.ability] !== weather[ability]) ||
    (terrain[attacker.ability] && terrain[ability] && terrain[attacker.ability] !== terrain[ability]);
}

function moveAgainst(attacker, species, level, nature, ability, name, overrides, multipliers) {
  const move = new calc.Move(gen, name, { item: attacker.item, ability: attacker.ability, overrides });
  const defense = move.overrideDefensiveStat || (move.category === 'Physical' ? 'def' : 'spd');
  const sampled = needsSampling(name, attacker, ability);
  const dependentHP = hpDependent.has(name);
  const configs = sampled ? sampledIVs : Array.from({ length: 32 }, (_, iv) => ({ ...Object.fromEntries(stats.map(s => [s, 0])), hp: 31, [defense]: iv }));
  let rollChance = 0, useChance = 0, low = Infinity, high = 0, count = 0;
  for (const [index, ivs] of configs.entries()) {
    const hpIVs = sampled ? [ivs.hp] : Array.from({ length: 32 }, (_, i) => i);
    let cached;
    for (const hpIV of hpIVs) {
      const defender = boostedPokemon(species.name, { level, ability, nature, ivs: { ...ivs, hp: hpIV } }, multipliers, Math.ceil);
      const hp = defender.maxHP();
      if (!cached || dependentHP || sampled) {
        const field = entryField(attacker, defender, index % 2);
        cached = hitCounts(name, attacker).map(([hits, weight]) => {
          const result = calc.calculate(gen, attacker, defender,
            new calc.Move(gen, name, { item: attacker.item, ability: attacker.ability, hits, overrides }), field);
          const hitsMatrix = matrix(result.damage);
          if (!hitsMatrix.length || hitsMatrix.some(rolls => !rolls.length || rolls.some(d => !Number.isFinite(d) || d < 0))) {
            throw new Error(`Unsupported damage distribution for ${name}.`);
          }
          const ability = result.defender.ability;
          const distribution = damageDistribution(ability === 'Disguise' ? [[0], ...hitsMatrix.slice(1)] : hitsMatrix);
          return { hits: hitsMatrix, ability, distribution, weight,
            accuracy: accuracy(result.move, result.attacker, result.defender, field), range: result.range() };
        });
      }
      for (const result of cached) {
        const chance = koProbability(result.hits, hp, result.ability, name, result.distribution);
        rollChance += chance * result.weight;
        useChance += chance * result.weight * result.accuracy;
        const cap = ['False Swipe', 'Hold Back'].includes(name) ? hp - 1 : Infinity;
        const range = result.ability === 'Disguise' ? [...result.distribution.keys()] : result.range;
        low = Math.min(low, Math.min(...range, cap) / hp * 100);
        high = Math.max(high, Math.min(Math.max(...range), cap) / hp * 100);
      }
      count++;
    }
  }
  return { move: name, playerHP: attacker.curHP(), ability: abilityLabel(ability), rollChance: rollChance / count, useChance: useChance / count,
    low, high, mode: sampled ? `${samples} full-IV samples (estimate)` : 'Exact: 1,024 HP/defence IV pairs' };
}

function playerHP(player, move, currentHP) {
  if (currentHP === undefined) return oneHpMoves.has(move) ? 1 : player.pokemon.maxHP();
  if (!Number.isInteger(currentHP) || currentHP < 1 || currentHP > player.pokemon.maxHP()) {
    throw new Error(`Player HP must be a whole number from 1 to ${player.pokemon.maxHP()}.`);
  }
  return currentHP;
}

export function calculateSpawn(player, row, { nature = 'Serious', abilities = 'default', move = player.moves[0], multipliers = wildMultipliers, currentHP } = {}) {
  if (!data.natures.includes(nature) || !['default', 'worst'].includes(abilities)) throw new Error('Choose a valid wild nature and ability assumption.');
  if (!Number.isInteger(row.level) || row.level < 1 || row.level > 100) throw new Error('Wild level must be 1–100.');
  const hp = playerHP(player, move, currentHP);
  const species = data.species[calc.toID(row.name)];
  if (!species) return { ...row, error: `No Gen 7 data for ${row.name}.` };
  const candidates = abilities === 'worst' ? species.abilities : species.abilities.slice(0, 1);
  if (candidates.includes('Imposter')) return { ...row, name: species.name, error: 'Imposter transformation is not modeled; choose the default-ability assumption to calculate Limber Ditto.' };
  if (!player.moves.includes(move)) throw new Error('Choose a supported move from the pasted set.');
  const attacker = player.pokemon.clone();
  attacker.originalCurHP = hp;
  const cases = candidates.map(ability => moveAgainst(attacker, species, row.level, nature, ability, move, player.moveOverrides[move], multipliers));
  const result = cases.reduce((a, b) => a.useChance <= b.useChance ? a : b);
  return { ...row, name: species.name, ...result,
    maxUseChance: Math.max(...cases.map(c => c.useChance)), estimated: cases.some(c => c.mode.includes('estimate')) };
}

export function summarize(rows) {
  const known = rows.filter(row => !row.error);
  const sum = known.reduce((total, row) => total + row.useChance, 0);
  return { total: rows.length, modeled: known.length,
    mean: known.length ? sum / known.length : null,
    lower: rows.length ? sum / rows.length : null,
    upper: rows.length ? (sum + rows.length - known.length) / rows.length : null };
}

export function compareMoves(player, encounters, options = {}, onProgress = () => {}) {
  if (!encounters.length) throw new Error('No encounters to compare.');
  const nature = options.nature ?? 'Serious';
  const abilities = options.abilities ?? 'default';
  if (!data.natures.includes(nature) || !['default', 'worst'].includes(abilities)) throw new Error('Invalid wild assumptions.');
  playerHP(player, player.moves[0], options.currentHP);
  const rankings = [];
  const matchups = encounters.map(row => ({ name: row.name, level: row.level, rarities: row.rarities, moves: [] }));
  let done = 0;
  const total = encounters.length * player.moves.length;
  for (const move of player.moves) {
    const rows = [];
    for (const [index, encounter] of encounters.entries()) {
      let row;
      try { row = { ...calculateSpawn(player, encounter, { nature, abilities, move, multipliers: options.multipliers, currentHP: options.currentHP }), move }; }
      catch (error) { row = { ...encounter, move, error: error.message }; }
      rows.push(row);
      matchups[index].name = row.name;
      matchups[index].moves.push({ move, chance: row.error ? null : row.useChance,
        upper: row.error ? null : row.maxUseChance, ability: row.ability,
        estimated: Boolean(row.estimated), error: row.error });
      onProgress({ row, move, done: ++done, total });
    }
    const hpAssumption = options.currentHP === undefined ? (oneHpMoves.has(move) ? '1 HP' : 'full HP')
      : `${options.currentHP}/${player.pokemon.maxHP()} HP`;
    rankings.push({ move, summary: summarize(rows), hpAssumption,
      estimated: rows.some(row => row.estimated) });
  }
  rankings.sort((a, b) => b.summary.lower - a.summary.lower || a.move.localeCompare(b.move));
  const complete = rankings.every(r => r.summary.modeled === r.summary.total);
  const bestMoves = complete ? rankings.filter(r => Math.abs(r.summary.mean - rankings[0].summary.mean) < 1e-10).map(r => r.move) : [];
  return { rankings, bestMoves, complete, matchups };
}

export const natures = data.natures;
