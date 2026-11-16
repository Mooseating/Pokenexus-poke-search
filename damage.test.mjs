import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import calc from '@smogon/calc';
import { areas, areaSpawns } from './areas.mjs';
import { matchupState, filterMatchups } from './matchups.mjs';
import metadata from './gen7-data.mjs';
import { gen, preparePlayer, boostedPokemon, playerMultipliers, wildMultipliers,
  calculateSpawn, summarize, compareMoves, damageDistribution, disabledAbilities } from './damage-core.mjs';

const spawns = JSON.parse(readFileSync(new URL('./spawns.json', import.meta.url), 'utf8'));
const gyarados = 'Gyarados\nAbility: Intimidate\nEVs: 252 Atk / 4 SpD / 252 Spe\nAdamant Nature\n- Waterfall\n- Tackle';
const row = (name, level = 100) => ({ name, level, rarities: ['c'] });

function player(species, ability, move, item = '') {
  return preparePlayer(`${species}${item ? ' @ ' + item : ''}\nAbility: ${ability}\nEVs: 252 Atk / 4 SpD / 252 Spe\nAdamant Nature\n- ${move}`);
}

test('all requested maps and methods have fixed levels and known Gen 7 species', () => {
  assert.equal(areas.length, 13);
  for (const area of areas) for (const method of area.methods) {
    const encounters = areaSpawns(spawns, area.name, method);
    assert.ok(encounters.length > 0);
    for (const mon of encounters) assert.ok(metadata.species[calc.toID(mon.name)], mon.name);
  }
  assert.equal(areaSpawns(spawns, 'Ancient Dungeon — Land', 'Grass')[0].level, 90);
  assert.equal(areaSpawns(spawns, "Mewtwo's Lair", 'Grass')[0].level, 100);
  assert.throws(() => areaSpawns(spawns, 'Ancient Dungeon — Land', 'Surfing'));
  assert.throws(() => areaSpawns({ ...spawns, 'Sky Pillar 1F': { Levels: [99, 100] } }, 'Sky Pillar 1F', 'Grass'));
});

test('stat calibration survives calculator clones and is not treated as stat stages', () => {
  const mine = boostedPokemon('Mew', {}, playerMultipliers);
  const wild = boostedPokemon('Mew', {}, wildMultipliers);
  assert.deepEqual(mine.rawStats, { hp: 341, atk: 590, def: 472, spa: 590, spd: 472, spe: 472 });
  assert.deepEqual(wild.rawStats, { hp: 682, atk: 236, def: 472, spa: 236, spd: 472, spe: 236 });
  assert.deepEqual(mine.clone().clone().rawStats, mine.rawStats);
  assert.equal(wild.clone().curHP(), 682);
  const result = calc.calculate(gen, mine, wild, new calc.Move(gen, 'Tackle'));
  assert.deepEqual(result.range(), [37, 44]); // floor(floor(42 * 40 * 590 / 472) / 50) + 2 = 44 before rolls.
  assert.equal(preparePlayer(gyarados).pokemon.rawStats.atk, 957); // floor(383 * 2.5), not round().
});

test('current HP survives every clone, including doubled wild HP calibration', () => {
  const low = boostedPokemon('Mew', { curHP: 1 }, playerMultipliers);
  assert.equal(low.curHP(), 1);
  assert.equal(low.clone().clone().curHP(), 1);
  assert.equal(low.maxHP(), 341);
  const wild = boostedPokemon('Mew', { curHP: 1 }, wildMultipliers);
  assert.equal(wild.clone().curHP(), 1);
  assert.equal(wild.clone().maxHP(), 682);
});

test('Flail and Reversal assume 1 HP without lowering HP for other selected moves', () => {
  const p = preparePlayer(gyarados.replace('- Waterfall\n- Tackle', '- Flail\n- Reversal\n- Waterfall'));
  const target = row('chansey');
  const ordinaryBefore = calculateSpawn(p, target, { move: 'Waterfall' });
  const defender = boostedPokemon('Chansey', { ability: 'Natural Cure' }, wildMultipliers);
  for (const move of ['Flail', 'Reversal']) {
    const r = calculateSpawn(p, target, { move });
    assert.equal(r.playerHP, 1);
    const low = p.pokemon.clone();
    low.originalCurHP = 1;
    const a = calc.calculate(gen, low, defender, new calc.Move(gen, move));
    const b = calc.calculate(gen, p.pokemon, defender, new calc.Move(gen, move));
    assert.ok(a.range()[0] > b.range()[1]);
    assert.ok(r.useChance > 0.99);
    assert.equal(p.pokemon.curHP(), p.pokemon.maxHP());
  }
  assert.deepEqual(calculateSpawn(p, target, { move: 'Waterfall' }), ordinaryBefore);
  assert.equal(ordinaryBefore.playerHP, p.pokemon.maxHP());
});

test('PokeNexus disables all seven abilities for either side, including through clones', () => {
  const species = { Intimidate: 'Gyarados', 'Innards Out': 'Pyukumuku', Sturdy: 'Nosepass',
    'Cursed Body': 'Gengar', Aftermath: 'Drifblim', 'Rough Skin': 'Garchomp', 'Iron Barbs': 'Ferrothorn' };
  assert.deepEqual([...disabledAbilities].sort(), Object.keys(species).sort());
  for (const [ability, name] of Object.entries(species)) {
    for (const multipliers of [playerMultipliers, wildMultipliers]) {
      const p = boostedPokemon(name, { ability }, multipliers);
      assert.equal(p.ability, '(No Ability)');
      assert.equal(p.clone().clone().hasAbility(ability), false);
    }
    const parsed = player(name, ability, 'Tackle');
    assert.match(parsed.abilityLabel, /disabled/);
    assert.ok(parsed.warnings.some(w => w.includes(ability) && w.includes('disabled')));
  }
  const mine = boostedPokemon('Mew', { ability: 'Synchronize' }, playerMultipliers);
  const wild = boostedPokemon('Gyarados', { ability: 'Intimidate' }, wildMultipliers);
  const r = calc.calculate(gen, mine, wild, new calc.Move(gen, 'Tackle'));
  assert.equal(r.attacker.boosts.atk, 0);
  const slow = boostedPokemon('Regigigas', { ability: 'Slow Start' }, playerMultipliers);
  assert.equal(slow.clone().abilityOn, true); // Not disabled by this game's rules.
});

test('ordinary IV calculation equals brute-force calculation of all 1,024 pairs', () => {
  const p = preparePlayer(gyarados);
  const result = calculateSpawn(p, row('golem'), { move: 'Waterfall' });
  let chance = 0;
  for (let hp = 0; hp < 32; hp++) for (let def = 0; def < 32; def++) {
    const defender = boostedPokemon('Golem', { level: 100, ability: 'Rock Head', nature: 'Serious',
      ivs: { hp, atk: 0, def, spa: 0, spd: 0, spe: 0 } }, wildMultipliers);
    const r = calc.calculate(gen, p.pokemon, defender, new calc.Move(gen, 'Waterfall'));
    chance += r.damage.filter(damage => damage >= defender.maxHP()).length / r.damage.length / 1024;
  }
  assert.ok(result.rollChance > 0 && result.rollChance < 1);
  assert.ok(Math.abs(result.rollChance - chance) < 1e-10);
  assert.equal(result.useChance, result.rollChance);
  assert.match(result.mode, /Exact/);
});

test('selected move is honored, not replaced by the best move in the set', () => {
  const p = preparePlayer(gyarados);
  const a = calculateSpawn(p, row('golem'), { move: 'Tackle' });
  const b = calculateSpawn(p, row('golem'), { move: 'Waterfall' });
  assert.equal(a.move, 'Tackle');
  assert.ok(a.useChance < b.useChance);
  assert.throws(() => calculateSpawn(p, row('golem'), { move: 'Thunderbolt' }));
});

test('wild defensive natures change the result and neutral natures agree', () => {
  const p = preparePlayer(gyarados);
  const neutral = calculateSpawn(p, row('golem'));
  assert.equal(calculateSpawn(p, row('golem'), { nature: 'Hardy' }).rollChance, neutral.rollChance);
  assert.ok(calculateSpawn(p, row('golem'), { nature: 'Bold' }).rollChance < neutral.rollChance);
  assert.throws(() => calculateSpawn(p, row('golem'), { nature: 'Not a nature' }));
});

test('disabled Sturdy cannot block an OHKO, while active Disguise still can', () => {
  const p = preparePlayer(gyarados);
  const sturdy = calculateSpawn(p, row('nosepass', 10));
  assert.equal(sturdy.ability, 'Sturdy (disabled)');
  assert.equal(sturdy.rollChance, 1);
  assert.ok(sturdy.high >= 100);
  assert.equal(calculateSpawn(p, row('golem', 10), { abilities: 'worst' }).useChance, 1);
  assert.equal(calculateSpawn(p, row('mimikyu', 10)).rollChance, 0);
  assert.equal(calculateSpawn(player('Excadrill', 'Mold Breaker', 'Earthquake'), row('mimikyu', 10)).useChance, 1);
});

test('standard multi-hit and Parental Bond attacks can break first-hit protection', () => {
  const cloyster = player('Cloyster', 'Skill Link', 'Icicle Spear');
  assert.ok(calculateSpawn(cloyster, row('golem', 10), { abilities: 'worst' }).useChance > 0.999999);
  assert.ok(calculateSpawn(cloyster, row('mimikyu', 10)).useChance > 0.999999);
  const parent = player('Kangaskhan', 'Scrappy', 'Crunch', 'Kangaskhanite');
  assert.equal(parent.pokemon.name, 'Kangaskhan-Mega');
  assert.equal(parent.pokemon.ability, 'Parental Bond');
  assert.ok(calculateSpawn(parent, row('mimikyu', 10)).useChance > 0.999999);
  assert.deepEqual([...damageDistribution([[1, 2], [1, 2]])], [[2, 0.25], [3, 0.5], [4, 0.25]]);
});

test('accuracy, No Guard and entry weather are included without assuming all attacks hit', () => {
  const hydro = player('Gyarados', 'Intimidate', 'Hydro Pump');
  const r = calculateSpawn(hydro, row('golem', 10));
  assert.equal(r.rollChance, 1);
  assert.ok(Math.abs(r.useChance - 0.8) < 1e-10);
  assert.equal(calculateSpawn(player('Machamp', 'No Guard', 'Dynamic Punch'), row('golem', 10)).useChance, 1);
  assert.ok(Math.abs(calculateSpawn(player('Machamp', 'Guts', 'Dynamic Punch'), row('golem', 10)).useChance - 0.5) < 1e-10);
  assert.equal(calculateSpawn(player('Abomasnow', 'Snow Warning', 'Blizzard'), row('golem', 10)).useChance, 1);
});

test('False Swipe never reports an OHKO and unsupported mechanics stay explicit', () => {
  const swipe = calculateSpawn(player('Scizor', 'Technician', 'False Swipe'), row('golem', 10));
  assert.equal(swipe.useChance, 0);
  assert.ok(swipe.high < 100);
  const unknown = calculateSpawn(preparePlayer(gyarados), row('ditto'), { abilities: 'worst' });
  assert.match(unknown.error, /Imposter/);
  assert.throws(() => player('Mew', 'Synchronize', 'Magnitude'));
});

test('stat-dependent moves are reproducible estimates over all six random wild IVs', () => {
  const p = player('Mew', 'Synchronize', 'Foul Play');
  assert.ok(p.warnings.some(w => w.includes('×1.33')));
  const a = calculateSpawn(p, row('alakazam'));
  const b = calculateSpawn(p, row('alakazam'));
  assert.match(a.mode, /512.*estimate/);
  assert.deepEqual(a, b);
  assert.ok(a.useChance >= 0 && a.useChance <= 1);
});

test('rarity never weights the average and duplicate species count once', () => {
  const summary = summarize([{ useChance: 0.2, rarities: ['c'] }, { useChance: 0.8, rarities: ['er', 'vr'] }]);
  assert.equal(summary.mean, 0.5);
  const custom = { "Mewtwo's Lair": { Levels: [100, 100], Grass: { c: ['mew', 'mew'], er: ['mew', 'mewtwo'] } } };
  const rows = areaSpawns(custom, "Mewtwo's Lair", 'Grass');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].rarities, ['c', 'er']);
  const partial = summarize([{ useChance: 1 }, { error: 'Unsupported' }]);
  assert.equal(partial.lower, 0.5);
  assert.equal(partial.upper, 1);
});

test('Return and Frustration use the pasted friendship rather than always maximum power', () => {
  const full = preparePlayer('Kangaskhan\nAbility: Scrappy\nEVs: 252 Atk / 4 SpD / 252 Spe\nAdamant Nature\n- Return');
  const low = preparePlayer('Kangaskhan\nAbility: Scrappy\nHappiness: 0\nEVs: 252 Atk / 4 SpD / 252 Spe\nAdamant Nature\n- Return');
  assert.equal(full.moveOverrides.Return.basePower, 102);
  assert.equal(low.moveOverrides.Return.basePower, 1);
  assert.ok(calculateSpawn(full, row('alakazam', 10)).useChance > calculateSpawn(low, row('alakazam', 10)).useChance);
  assert.equal(preparePlayer('Mew\n- Frustration').moveOverrides.Frustration.basePower, 102);
});

test('one run ranks all supported moves by separate area averages and preserves per-move HP', () => {
  const p = preparePlayer(gyarados.replace('- Waterfall\n- Tackle', '- Flail\n- Reversal\n- Waterfall\n- Dragon Dance'));
  const encounters = [row('chansey'), row('golem')];
  const progress = [];
  const result = compareMoves(p, encounters, {}, event => progress.push(event));
  assert.equal(result.rankings.length, 3);
  assert.ok(result.complete);
  assert.equal(progress.length, 6);
  assert.equal(progress.at(-1).done, 6);
  assert.equal(progress.at(-1).total, 6);
  for (const r of result.rankings) {
    assert.deepEqual(r.summary, summarize(encounters.map(e => calculateSpawn(p, e, { move: r.move }))));
    assert.equal(r.hpAssumption, r.move === 'Waterfall' ? 'full HP' : '1 HP');
  }
  assert.ok(result.rankings.every(r => r.summary.mean <= result.rankings[0].summary.mean + 1e-10));
  assert.ok(result.bestMoves.length > 0);
  assert.equal(p.pokemon.curHP(), p.pokemon.maxHP());
  assert.ok(p.warnings.some(w => w.includes('Dragon Dance')));
  for (const event of progress) assert.equal(event.row.move, event.move);
});

test('move comparison reports ties instead of inventing a unique winner', () => {
  const p = preparePlayer('Persian\nAbility: Technician\nEVs: 252 Atk / 4 SpD / 252 Spe\nAdamant Nature\n- Fake Out\n- Scratch');
  const result = compareMoves(p, [row('magikarp', 10)]);
  assert.deepEqual(result.bestMoves, ['Fake Out', 'Scratch']);
});

test('unknown species prevent a conclusive comparison and are included in every move denominator', () => {
  const p = preparePlayer(gyarados);
  const result = compareMoves(p, [row('golem'), row('not-a-pokemon')]);
  assert.equal(result.complete, false);
  assert.deepEqual(result.bestMoves, []);
  assert.ok(result.rankings.every(r => r.summary.modeled === 1 && r.summary.total === 2));
  assert.throws(() => compareMoves(p, []));
  assert.throws(() => compareMoves(p, [row('golem')], { nature: 'Invalid' }));
});

test('move comparison includes exact per-Pokémon coverage without additional calculations', () => {
  const p = preparePlayer(gyarados);
  const result = compareMoves(p, [row('mimikyu'), row('golem', 10)]);
  assert.equal(result.matchups.length, 2);
  const ghost = result.matchups.find(r => r.name === 'Mimikyu');
  assert.equal(ghost.moves.length, p.moves.length);
  assert.equal(matchupState(ghost).cannot, true);
  assert.deepEqual(filterMatchups(result.matchups, 'never').map(r => r.name), ['Mimikyu']);
  assert.deepEqual(filterMatchups(result.matchups, 'move:Waterfall').map(r => r.name), ['Golem']);
});

test('coverage preserves other ability scenarios instead of calling worst-case zero impossible', () => {
  const p = player('Persian', 'Technician', 'Fake Out');
  const result = compareMoves(p, [row('bruxish', 10)], { abilities: 'worst' });
  const cell = result.matchups[0].moves[0];
  assert.equal(cell.chance, 0); // Dazzling blocks Fake Out.
  assert.equal(cell.upper, 1);  // Strong Jaw / Wonder Skin do not.
  assert.equal(matchupState(result.matchups[0]).cannot, false);
});

test('invalid player data is rejected and omitted nature/EVs/IVs have explicit defaults', () => {
  const p = preparePlayer('Mew\n- Psychic');
  assert.equal(p.pokemon.nature, 'Serious');
  assert.ok(Object.values(p.pokemon.ivs).every(n => n === 31));
  assert.ok(Object.values(p.pokemon.evs).every(n => n === 0));
  for (const text of ['', 'Great Tusk\n- Tackle', 'Mew\n- Not A Move', 'Mew\n- Calm Mind',
    'Mew\nEVs: 252 HP / 252 Def / 252 SpD\n- Psychic', 'Mew\nIVs: 32 HP\n- Psychic',
    'Mew\n- Psychic\n\nPikachu\n- Thunderbolt']) assert.throws(() => preparePlayer(text), text);
});
