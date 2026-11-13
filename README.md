# PokeNexus Spawn Search

A local website for searching Pokémon and locations from `spawns.json`.
Shows encounter method, rarity, level range, and solo spawn status. No dependencies or external requests.
A solo spawn is the only Pokémon in its rarity tier at that location and encounter method, regardless of search filters.

## Run

```sh
cd /home/art/Nexus/spawn-search
python3 -m http.server 8000 --bind 127.0.0.1
```

Open <http://127.0.0.1:8000>. Stop the server with Ctrl+C.
Opening `index.html` directly will not work because browsers block loading the JSON that way.

Search a Pokémon, a location, a rarity, or combine them (for example `golem sinnoh c`).
Rarity codes are exact, case-insensitive filters: `c` = Common, `uc` = Uncommon,
`r` = Rare, `vr` = Very rare, `er` = Extremely rare. Use a code as a separate word,
for example `er` or `marowak er`. A code inside a Pokémon or place name is not treated as a filter.
Add the separate word `solo` to show only solo spawns, alone or combined with other
terms (for example `solo`, `er solo`, or `hippopotas sinnoh er solo`).
Results are shown 200 at a time; use **Show more** for the rest.
Levels are displayed exactly as supplied by the dataset, including zero values.

## Update the data

The included dataset is a snapshot of `/home/art/Nexus/spawns.json`.
To refresh it:

```sh
cp /home/art/Nexus/spawns.json /home/art/Nexus/spawn-search/spawns.json
```

Reload the page afterward. No game installation files are included or changed.

## Test

Requires Node.js (only for tests):

```sh
node --test search.test.mjs
```

This is an unofficial viewer. Spawn data and Pokémon names belong to their respective owners.
