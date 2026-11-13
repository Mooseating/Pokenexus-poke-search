import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildEncounters, search } from './search.mjs';

const data = JSON.parse(readFileSync(new URL('./spawns.json', import.meta.url), 'utf8'));
const encounters = buildEncounters(data);

test('indexes every spawn with its location, method, rarity and levels', () => {
  let expected = 0;
  for (const details of Object.values(data)) {
    for (const method of ['Grass', 'Surfing', 'Fishing']) {
      for (const names of Object.values(details[method])) expected += names.length;
    }
  }
  assert.equal(encounters.length, expected);
  assert.ok(expected > 0);
  assert.ok(encounters.some(row => row.name === 'golem'
    && row.location === 'Sinnoh Underground Top Left'
    && row.method === 'Grass' && row.rarity === 'c' && row.levels === '80–80'));
});

test('searches Pokémon, places, partial names and combined terms', () => {
  for (const query of ['GOLEM', 'Sinnoh Underground', 'gole', 'golem sinnoh']) {
    const matches = search(encounters, query);
    assert.ok(matches.length > 0, query);
    assert.ok(matches.every(row => query.toLowerCase().split(' ')
      .every(word => `${row.name} ${row.location}`.toLowerCase().includes(word))));
  }
  assert.deepEqual(search(encounters, '   '), encounters);
  assert.deepEqual(search(encounters, 'not-a-real-pokemon-zzzz'), []);
});

test('rarity codes match exact tiers, alone or combined with Pokémon and places', () => {
  for (const code of ['c', 'uc', 'r', 'vr', 'er']) {
    assert.deepEqual(search(encounters, `  ${code.toUpperCase()}  `),
      encounters.filter(row => row.rarity === code));
  }
  assert.deepEqual(search(encounters, 'golem sinnoh C'), encounters.filter(row =>
    row.name.includes('golem') && row.location.includes('Sinnoh') && row.rarity === 'c'));
  assert.ok(search(encounters, 'golem sinnoh c').length > 0);
  assert.deepEqual(search(encounters, 'er hippopotas'), encounters.filter(row =>
    row.name === 'hippopotas' && row.rarity === 'er'));
  assert.ok(search(encounters, 'er hippopotas').length > 0);
  assert.deepEqual(search(encounters, 'r not-a-real-pokemon-zzzz'), []);
  assert.ok(search(encounters, 'golem').some(row => row.rarity !== 'er'));
});

test('solo filters combine with Pokémon, places and rarity codes', () => {
  assert.deepEqual(search(encounters, '  SOLO  '), encounters.filter(row => row.solo));
  for (const query of ['hippopotas', 'sinnoh', 'er', 'hippopotas sinnoh er']) {
    const expected = search(encounters, query).filter(row => row.solo);
    assert.ok(expected.length > 0, query);
    assert.deepEqual(search(encounters, `solo ${query}`), expected);
    assert.deepEqual(search(encounters, `${query} solo`), expected);
  }
  const sample = buildEncounters({ Forest: {
    Levels: [10, 12], Grass: { c: ['solosis', 'pikachu'] }, Surfing: {}, Fishing: {},
  } });
  assert.equal(search(sample, 'solosis').length, 1);
  assert.deepEqual(search(sample, 'solosis solo'), []);
});

test('solo status uses the full rarity group for each location and method', () => {
  const sample = buildEncounters({
    Forest: { Levels: [10, 12],
      Grass: { c: ['pikachu', 'weedle'], r: ['pikachu'], er: [] },
      Surfing: { c: ['pikachu'] }, Fishing: {},
    },
    Cave: { Levels: [10, 12], Grass: { r: ['pikachu', 'zubat'] },
      Surfing: {}, Fishing: { r: ['magikarp', 'magikarp'] },
    },
  });
  assert.deepEqual(search(sample, 'pikachu').map(row => row.solo), [false, true, true, false]);
  assert.deepEqual(search(sample, 'pikachu forest').map(row => row.solo), [false, true, true]);
  assert.ok(search(sample, 'magikarp').every(row => row.solo));
});

test('formats Alolan names and searches both original and displayed names', () => {
  const sample = buildEncounters({ Cave: {
    Levels: [10, 12], Grass: { r: ['marowakalola', 'raichualola', 'marowak'] },
    Surfing: {}, Fishing: {},
  } });
  assert.deepEqual(sample.map(row => row.displayName), ['Marowak-Alola', 'Raichu-Alola', 'Marowak']);
  for (const query of ['marowakalola', 'Marowak-Alola', 'marowak alola']) {
    assert.deepEqual(search(sample, query).map(row => row.name), ['marowakalola']);
  }
  assert.equal(search(sample, 'alola').length, 2);
});

test('ignores accents and punctuation in names', () => {
  const sample = buildEncounters({ 'Pokémon Tower': {
    Levels: [10, 12], Grass: { r: ['mr. mime'] }, Surfing: {}, Fishing: {},
  } });
  assert.equal(search(sample, 'MR MIME pokemon').length, 1);
});
