import { calculatorAreas } from './areas.mjs';
import { rarities } from './search.mjs';
import { matchupState, filterMatchups, chanceLabel } from './matchups.mjs';

const element = id => document.getElementById(id);
const form = element('damage-form');
const paste = element('paste');
const moveList = element('moves');
const rankings = element('rankings');
const rankingSection = element('ranking-section');
const matchupSection = element('matchup-section');
const matchupFilter = element('matchup-filter');
const area = element('area');
const mapSearch = element('map-search');
const method = element('method');
const nature = element('wild-nature');
const abilities = element('abilities');
const currentHP = element('current-hp');
const read = element('read');
const calculate = element('calculate');
const cancel = element('cancel');
const status = element('status');
const summary = element('summary');
const results = element('results');
const percent = value => `${(Math.max(0, Math.min(1, value)) * 100).toFixed(1)}%`;
let worker, spawns, loadedPaste = '', busy = false, ready = false;
let areas = [];
let oneHpMoves = new Set();
let preparedMoves = [];
let matchups = [], matchupMoves = [];

function showMoves() {
  moveList.textContent = !loadedPaste ? 'Read your set to list the supported moves.'
    : preparedMoves.map(name => `${name} (${currentHP.value !== '' ? `${currentHP.value} HP` : oneHpMoves.has(name) ? '1 HP' : 'full HP'})`).join(', ');
}

function option(select, value, text = value) {
  const entry = document.createElement('option');
  entry.value = value;
  entry.textContent = text;
  select.append(entry);
}
function filterAreas() {
  const selected = area.value;
  const query = mapSearch.value.trim().toLowerCase();
  area.replaceChildren();
  for (const entry of areas.filter(entry => entry.name.toLowerCase().includes(query))) option(area, entry.name);
  if ([...area.options].some(entry => entry.value === selected)) area.value = selected;
  if (area.value !== selected) area.dispatchEvent(new Event('change'));
  controls();
}
mapSearch.addEventListener('input', filterAreas);
function methods() {
  method.replaceChildren();
  const selected = areas.find(a => a.name === area.value);
  for (const name of selected?.methods || []) option(method, name);
  element('area-info').textContent = !selected ? 'No matching maps with valid encounter levels.'
    : selected.level ? `No stat boosts on either side. Wild level ${selected.level} (map maximum); player level 100.`
      : 'Custom area profile. Player and wild Pokémon use level 100.';
}
area.addEventListener('change', methods);

function controls() {
  if (!loadedPaste) {
    currentHP.removeAttribute('max');
    element('hp-limit').textContent = 'Read your set to see its maximum HP.';
  }
  showMoves();
  for (const input of [paste, mapSearch, area, method, nature, abilities, currentHP]) input.disabled = busy;
  read.disabled = busy || !ready || !area.value;
  calculate.disabled = busy || !ready || !area.value || !method.value || !loadedPaste || paste.value !== loadedPaste || !currentHP.validity.valid;
  cancel.disabled = !busy;
  matchupFilter.disabled = busy || !matchups.length;
}
function markStale() {
  rankingSection.hidden = true;
  matchupSection.hidden = true;
  if (summary.textContent) summary.textContent = 'Settings changed—calculate again. Any detailed table below is from the previous run.';
}
for (const input of [area, method, nature, abilities]) input.addEventListener('change', markStale);
currentHP.addEventListener('input', () => {
  markStale();
  controls();
});
paste.addEventListener('input', () => {
  markStale();
  element('warnings').replaceChildren();
  loadedPaste = '';
  element('player-info').textContent = '';
  controls();
});
function readSet() {
  loadedPaste = '';
  element('player-info').textContent = '';
  element('warnings').replaceChildren();
  controls();
  status.textContent = 'Reading player set…';
  worker.postMessage({ type: 'prepare', paste: paste.value, area: area.value });
}
read.addEventListener('click', readSet);
area.addEventListener('change', () => {
  if (ready && area.value && paste.value.trim()) readSet();
  else {
    loadedPaste = '';
    element('player-info').textContent = '';
    controls();
  }
});

function appendRow(row) {
  const tr = document.createElement('tr');
  const add = (value, span = 1) => {
    const td = document.createElement('td');
    td.textContent = value;
    td.colSpan = span;
    tr.append(td);
  };
  add(row.move); add(row.name); add(row.level); add(row.rarities.map(code => rarities[code] || code).join(', '));
  if (row.error) add(`Unknown: ${row.error}`, 5);
  else {
    add(row.ability);
    add(`${row.low.toFixed(1)}–${row.high.toFixed(1)}%`);
    add(percent(row.rollChance)); add(percent(row.useChance)); add(row.mode);
  }
  results.append(tr);
}

function showMatchups() {
  const head = element('matchup-head');
  const body = element('matchup-results');
  head.replaceChildren();
  body.replaceChildren();
  for (const title of ['Pokémon', 'Level', 'Rarity', ...matchupMoves.map(m => `${m.move} · ${m.hpAssumption}`), 'Result']) {
    const th = document.createElement('th'); th.scope = 'col'; th.textContent = title; head.append(th);
  }
  const visible = filterMatchups(matchups, matchupFilter.value);
  for (const row of visible) {
    const tr = document.createElement('tr');
    const add = (value, title = '') => {
      const td = document.createElement('td'); td.textContent = value; td.title = title; tr.append(td);
    };
    add(row.name); add(row.level); add(row.rarities.map(r => rarities[r] || r).join(', '));
    for (const { move } of matchupMoves) {
      const cell = row.moves.find(c => c.move === move);
      add(chanceLabel(cell), cell.error || `Ability used for the lower chance: ${cell.ability}.`);
    }
    const state = matchupState(row);
    let label = state.cannot ? '0% with every tested move' : state.guaranteed ? 'Guaranteed OHKO available'
      : state.possible ? 'Possible OHKO, not guaranteed' : state.unknown ? 'Unknown — incomplete data'
        : 'No OHKO found in samples; not proven impossible';
    if (state.abilityDependent) label += '; ability-dependent';
    if (state.sampled) label += '; sampled estimates';
    if (state.unknown && state.possible) label += '; some moves unknown';
    add(label);
    body.append(tr);
  }
  element('matchup-count').textContent = visible.length ? `${visible.length}/${matchups.length} Pokémon in this view.` : 'No Pokémon match this view.';
}
matchupFilter.addEventListener('change', showMatchups);

function loadMatchups(data) {
  matchups = data.matchups;
  matchupMoves = data.rankings;
  matchupFilter.replaceChildren();
  const choices = [['all', 'All Pokémon'], ...matchupMoves.map(m => [`move:${m.move}`, `Possible OHKO with ${m.move}`]),
    ['guaranteed', 'Guaranteed OHKO with at least one move'], ['never', '0% with every tested move'],
    ['not-guaranteed', 'No guaranteed OHKO'], ['uncertain', 'Unknown or sampled results']];
  for (const [value, label] of choices) option(matchupFilter, value, `${label} (${filterMatchups(matchups, value).length})`);
  matchupFilter.value = 'all';
  showMatchups();
  matchupSection.hidden = false;
}

function startWorker() {
  ready = false;
  loadedPaste = '';
  controls();
  const current = new Worker('./damage-worker.bundle.mjs', { type: 'module' });
  worker = current;
  current.onmessage = ({ data }) => {
    if (worker !== current) return;
    if (data.type === 'ready') {
      element('disabled-abilities').textContent = 'Disabled in PokeNexus (both sides): ' + data.disabledAbilities.join(', ') + '.';
      oneHpMoves = new Set(data.oneHpMoves);
      const selected = nature.value || 'Serious';
      nature.replaceChildren();
      for (const name of data.natures) option(nature, name, name === 'Serious' ? 'Serious (neutral)' : name);
      nature.value = selected;
      ready = true;
      status.textContent = 'Ready. Read your Pokémon set, then compare all supported moves.';
    } else if (data.type === 'prepared') {
      if (data.paste !== paste.value || data.area !== area.value) return;
      preparedMoves = data.moves;
      loadedPaste = paste.value;
      const p = data.player;
      currentHP.max = p.stats.hp;
      element('hp-limit').textContent = `Maximum HP for this set and area: ${p.stats.hp}.`;
      element('player-info').textContent = `${p.name}, level ${p.level}, ${p.ability}, ${p.nature}. ` +
        `Player IVs: ${Object.entries(p.ivs).map(([s, n]) => `${s.toUpperCase()} ${n}`).join(' / ')}. ` +
        `Area-scaled stats before item/ability combat modifiers: ${Object.entries(p.stats).map(([s, n]) => `${s.toUpperCase()} ${n}`).join(' / ')}.`;
      const list = element('warnings');
      list.replaceChildren();
      for (const warning of data.warnings) {
        const li = document.createElement('li'); li.textContent = warning; list.append(li);
      }
      status.textContent = `Set loaded. ${data.moves.length} supported damaging moves will be compared.`;
    } else if (data.type === 'progress') {
      appendRow(data.row);
      status.textContent = `Calculated ${data.done}/${data.total} matchups (${data.move})…`;
    } else if (data.type === 'result') {
      busy = false;
      const top = data.rankings[0];
      summary.textContent = data.complete
        ? `${data.bestMoves.length > 1 ? 'Tied best calculated moves' : 'Best calculated move'}: ${data.bestMoves.join(', ')} — ${percent(top.summary.mean)} average OHKO/use across ${top.summary.total} equally weighted species.`
        : 'No conclusive best move: unsupported species leave unknown probabilities. The table is sorted by lower bounds, not a proven winner.';
      summary.textContent += ' Accuracy is included; random critical hits are excluded. Rarity does not weight the average.';
      if (data.rankings.some(r => r.estimated)) summary.textContent += ' Some rates are sampled estimates; close rankings may vary.';
      for (const result of data.rankings) {
        const tr = document.createElement('tr');
        const s = result.summary;
        for (const value of [result.move, result.hpAssumption,
          s.modeled === s.total ? percent(s.mean) : `${percent(s.lower)}–${percent(s.upper)}`,
          `${s.modeled}/${s.total}`, s.modeled === 0 ? 'Unknown' : result.estimated ? 'Includes 512-IV estimates' : 'Exact IV enumeration']) {
          const td = document.createElement('td'); td.textContent = value; tr.append(td);
        }
        rankings.append(tr);
      }
      rankingSection.hidden = false;
      loadMatchups(data);
      status.textContent = 'Done. Each move was averaged separately across the same species; no per-species best-move substitution.';
    } else if (data.type === 'error') {
      if (data.forType === 'prepare' && (data.paste !== paste.value || data.area !== area.value)) return;
      busy = false;
      status.textContent = `Error: ${data.error}`;
      summary.textContent = 'No completed move comparison was produced.';
      rankingSection.hidden = true;
      matchupSection.hidden = true;
    }
    controls();
  };
  current.onerror = event => {
    if (worker !== current) return;
    busy = false;
    ready = false;
    status.textContent = `Calculator worker failed: ${event.message}. Serve the folder over HTTP and check the build files.`;
    summary.textContent = 'No completed move comparison was produced.';
    rankingSection.hidden = true;
    matchupSection.hidden = true;
    controls();
  };
  current.postMessage({ type: 'init', spawns });
}

form.addEventListener('submit', event => {
  event.preventDefault();
  if (!ready || !area.value || !method.value || !loadedPaste || paste.value !== loadedPaste || busy || !currentHP.reportValidity()) return;
  results.replaceChildren();
  rankings.replaceChildren();
  rankingSection.hidden = true;
  matchupSection.hidden = true;
  matchups = [];
  summary.textContent = '';
  element('results-caption').textContent = `${area.value} · ${method.value} · all supported moves`;
  busy = true;
  controls();
  status.textContent = 'Calculating IV distributions…';
  worker.postMessage({ type: 'calculate', paste: paste.value, area: area.value,
    method: method.value, nature: nature.value, abilities: abilities.value,
    currentHP: currentHP.value === '' ? undefined : currentHP.valueAsNumber });
});
cancel.addEventListener('click', () => {
  worker.terminate();
  busy = false;
  rankingSection.hidden = true;
  matchupSection.hidden = true;
  summary.textContent = 'Cancelled: any displayed rows are partial. No completed ranking, coverage list or winner was produced. Your pasted set was preserved.';
  startWorker();
});

try {
  const response = await fetch('./spawns.json');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  spawns = await response.json();
  areas = calculatorAreas(spawns);
  filterAreas();
  startWorker();
} catch (error) {
  status.textContent = `Could not load spawn data: ${error.message}. Start the local server described in README.md.`;
}
