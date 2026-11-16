import test from 'node:test';
import assert from 'node:assert/strict';
import { matchupState, filterMatchups, chanceLabel } from './matchups.mjs';

const cell = (move, chance, extra = {}) => ({ move, chance, upper: chance, estimated: false, ...extra });
const row = (name, ...moves) => ({ name, moves });

test('move dropdown separates possible OHKOs from guarantees and exact zero', () => {
  const rows = [row('Always', cell('Surf', 1), cell('Tackle', 0)),
    row('Sometimes', cell('Surf', 0.4), cell('Tackle', 0)),
    row('Never', cell('Surf', 0), cell('Tackle', 0))];
  assert.deepEqual(filterMatchups(rows, 'move:Surf').map(r => r.name), ['Always', 'Sometimes']);
  assert.deepEqual(filterMatchups(rows, 'guaranteed').map(r => r.name), ['Always']);
  assert.deepEqual(filterMatchups(rows, 'never').map(r => r.name), ['Never']);
  assert.deepEqual(filterMatchups(rows, 'not-guaranteed').map(r => r.name), ['Sometimes', 'Never']);
  assert.deepEqual(filterMatchups(rows, 'move:Tackle'), []);
});

test('unknown or sampled zero is not classified as impossible', () => {
  const unknown = row('Unknown', cell('Surf', 0), cell('Tackle', null, { error: 'Missing data' }));
  const sampled = row('Sampled zero', cell('Surf', 0, { estimated: true }));
  assert.equal(matchupState(unknown).cannot, false);
  assert.equal(matchupState(sampled).cannot, false);
  assert.deepEqual(filterMatchups([unknown, sampled], 'never'), []);
  assert.equal(filterMatchups([unknown, sampled], 'uncertain').length, 2);
  assert.equal(chanceLabel(unknown.moves[1]), 'Unknown');
  assert.match(chanceLabel(sampled.moves[0]), /≈.*0%/);
});

test('sampled 100% is not labeled guaranteed', () => {
  const sampled = row('Estimated', cell('Surf', 1, { estimated: true }));
  assert.equal(matchupState(sampled).guaranteed, false);
  assert.equal(matchupState(sampled).possible, true);
  assert.deepEqual(filterMatchups([sampled], 'guaranteed'), []);
  assert.match(chanceLabel(sampled.moves[0]), /≈.*100%/);
});

test('positive chances that round to 0.0% are still possible; near-100 is not guaranteed', () => {
  const tiny = row('Tiny', cell('Surf', 1e-8));
  const near = row('Near', cell('Surf', 0.999999));
  assert.equal(matchupState(tiny).cannot, false);
  assert.equal(filterMatchups([tiny], 'move:Surf').length, 1);
  assert.equal(chanceLabel(tiny.moves[0]), '<0.1%');
  assert.equal(matchupState(near).guaranteed, false);
  assert.equal(chanceLabel(near.moves[0]), '>99.9%');
});

test('worst-ability zero does not imply no ability can ever be OHKOed', () => {
  const dependent = row('Ability-dependent', cell('Fake Out', 0, { upper: 1 }));
  assert.equal(matchupState(dependent).cannot, false);
  assert.equal(matchupState(dependent).abilityDependent, true);
  assert.equal(filterMatchups([dependent], 'move:Fake Out').length, 1);
  assert.match(chanceLabel(dependent.moves[0]), /0%–100%.*ability-dependent/);
});

test('one known guaranteed move is usable even if a different move has unknown data', () => {
  const mixed = row('Mixed', cell('Surf', 1), cell('Tackle', null, { error: 'Unsupported' }));
  assert.equal(matchupState(mixed).guaranteed, true);
  assert.equal(matchupState(mixed).unknown, true);
  assert.equal(filterMatchups([mixed], 'guaranteed').length, 1);
});

test('an empty move list cannot prove that a Pokémon cannot be OHKOed', () => {
  assert.equal(matchupState(row('Empty')).cannot, false);
  assert.equal(matchupState(row('Empty')).unknown, true);
});
