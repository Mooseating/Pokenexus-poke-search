import { buildEncounters, search, rarities } from './search.mjs';

const query = document.querySelector('#query');
const results = document.querySelector('#results');
const status = document.querySelector('#status');
const more = document.querySelector('#more');
const pageSize = 200;
let matches = [];
let shown = 0;

function showMore() {
  const fragment = document.createDocumentFragment();
  for (const row of matches.slice(shown, shown + pageSize)) {
    const tr = document.createElement('tr');
    for (const value of [row.displayName, row.location, row.method, rarities[row.rarity], row.levels, row.solo ? 'Yes' : 'No']) {
      const td = document.createElement('td');
      td.textContent = value;
      tr.append(td);
    }
    fragment.append(tr);
  }
  results.append(fragment);
  shown = Math.min(shown + pageSize, matches.length);
  status.textContent = matches.length
    ? `${matches.length.toLocaleString()} encounters found · showing ${shown.toLocaleString()}`
    : 'No encounters found. Try another Pokémon or location.';
  more.hidden = shown >= matches.length;
}

try {
  const response = await fetch('./spawns.json');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const encounters = buildEncounters(await response.json());
  function update() {
    matches = search(encounters, query.value);
    shown = 0;
    results.replaceChildren();
    showMore();
  }
  query.addEventListener('input', update);
  more.addEventListener('click', showMore);
  query.disabled = false;
  update();
} catch (error) {
  status.textContent = `Could not load spawn data (${error.message}). Start the local server described in README.md, then reload.`;
}
