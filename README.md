# PokeNexus Spawn Search

A local website for searching Pokémon and locations from `spawns.json`.
Shows encounter method, rarity, level range, and solo spawn status. Includes a local legendary-area OHKO calculator.
No external requests or runtime npm setup are needed; calculator dependencies are bundled locally.
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

## Legendary-area OHKO calculator

Open **Legendary-area OHKO calculator** from the search page (or `/damage.html`).
Paste one Showdown set, click **Read set**, choose an area/method, then click **Compare all moves**.
One run calculates every supported damaging move and ranks its unweighted average OHKO/use rate across the area.
The best calculated move (or tied moves) is named at the end. Detailed per-spawn results are expandable.
You can choose a wild nature; **Serious (neutral)** is the default.
Rarity is displayed but **never weights the average**. Every distinct species in the chosen method counts once,
even if it occurs in multiple rarity groups. Each move is averaged separately across the same species;
this is a comparison of fixed moves for the whole area, **not** choosing a different best move for each wild Pokémon.
Accuracy is included in the ranking; random critical hits are not. Unsupported moves remain listed as warnings.
If any move has unmodeled species, the table shows probability bounds and does not declare a conclusive winner.
Sampled results are estimates, so close rankings should not be treated as statistically proven differences.

After a run, **Show Pokémon** lets you select a move to see which species it can OHKO, view guaranteed OHKOs,
or list species with **0% for every tested move**. The table shows each move's chance beside each Pokémon.
“Possible” is not “guaranteed,” and “no guaranteed OHKO” is broader than “0% with every move.”
These labels apply only under the current assumptions, excluding random critical hits.
Unknown results and zero observed in sampled IVs are never labeled proven impossible; sampled 100% is not called guaranteed.
In worst-ability mode the coverage table shows the worst-to-best ability scenario range, while the area ranking still
uses the worst case. A worst-case 0% is not proof that every possible ability prevents an OHKO.

The listed legendary maps are included, with Cave of Origin split into land and water choices and Ancient Dungeon
restricted to land. Wild levels come from the JSON: Ancient Dungeon is level 90; the other listed areas are level 100.
Grass, Surfing and Fishing are calculated separately, not combined.

### Stat and probability assumptions

- Gen 7 mechanics. Wild Pokémon have **0 EVs** and independent, uniformly random **0–31 IVs**.
- Player multipliers: HP ×1, Attack/Special Attack ×2.5, Defence/Special Defence/Speed ×2.
- Wild multipliers: HP/Defence/Special Defence ×2, Attack/Special Attack/Speed unchanged.
  The wild ×1.33 offensive bonus is intentionally ignored; Foul Play results are conditional on ignoring it too.
- Multipliers apply to normal calculated stats **after nature**, rounding down. They survive the damage library's cloning
  and are not stat stages (critical hits and Unaware must not remove area bonuses).
  **Validate this multiplication/rounding order against PokeNexus before treating results as exact game odds.**
- Ordinary moves enumerate all **1,024 HP/defence IV pairs**, with normal damage rolls included.
  When wild Speed/Attack/other Defence matters (e.g. Gyro Ball, Foul Play, Download), results use **512 reproducible
  full-IV samples**, clearly labeled estimates. No random-IV information is exposed to a per-encounter best-move chooser.
- `OHKO / hit` is conditional on connecting; `OHKO / use` also includes accuracy. Random critical hits are excluded;
  forced critical moves still follow Gen 7 rules. The area summary uses OHKO/use, not damage at the average IV.
- Wild ability frequencies weren't supplied. Default mode uses each species' standard first ability; the optional
  worst-case mode minimizes the chance across its legal Gen 7 abilities (including hidden abilities).
  Neither mode pretends to be an average over random abilities. Wild held items are assumed absent.
- **Disabled in PokeNexus on both sides:** Intimidate, Innards Out, Sturdy, Cursed Body, Aftermath, Rough Skin and Iron Barbs.
  Their names remain visible with a disabled label, but they have no calculator effects. Intimidate does not lower Attack,
  and Sturdy does not prevent OHKOs. The others mostly concern post-hit retaliation/disabling, outside outgoing OHKO odds.
  Other abilities, including Disguise and Slow Start, retain their Gen 7 behavior.
- Wild Pokémon start at full HP. **Flail and Reversal assume the player is at exactly 1 HP**; other moves use full player HP.
  Each move's assumption is shown in the supported-move list and ranking table. Low HP survives calculator clones
  and does not change your set's other moves. Power still follows the real HP ratio (1 HP is not necessarily maximum power on very low-level Pokémon).
  No prior setup/status/hazards or enemy attacks. Entry weather/terrain is accounted for.
  Held Mega Stones/Primal Orbs assume the player's transformed form. Other battle-only forms should be pasted explicitly.
  Friendship is honored for Return/Frustration; absent friendship uses 255 (or 0 for Frustration-only sets).
- Standard multi-hit moves include the Gen 7 hit-count distribution or Skill Link, independent damage rolls,
  Parental Bond and Gen 7 Disguise. Sturdy is disabled by the PokeNexus rules above. Moves requiring unmodeled conditions/random effects (such as Sucker Punch,
  Counter, Magnitude, OHKO moves, per-hit accuracy and status/setup moves) are reported rather than silently guessed.
  Z-Moves are not automatically activated. Imposter is not modeled; an unsupported wild ability/species is marked unknown.
- If species cannot be calculated, the summary shows an interval including those unknowns instead of quietly
  dropping them. Estimates/assumptions still apply to the modeled rows. This is not a survival or one-turn battle simulator.

Calculations run in one Web Worker so spawn search/the browser stays responsive; “all moves” means one batch,
not multiple CPU-heavy parallel workers. **Cancel** stops the worker without losing your paste and never declares
a winner from a partial run. Changing settings hides stale rankings until recalculated.
This tool validates names and stat limits, not complete move learnsets or custom PokeNexus legality.

### Development / rebuild

Only needed when changing calculator code or dependencies:

```sh
npm ci
npm run build
npm test
```

Commit `damage-worker.bundle.mjs` and `gen7-data.mjs` along with source changes when publishing static hosting updates.
`build.mjs` generates Gen 7 metadata from pinned Showdown data and bundles the worker with esbuild.
The game installation and original `spawns.json` are not modified. See [third-party licenses](THIRD_PARTY_LICENSES.md).

## Update the data

The included dataset is a snapshot of `/home/art/Nexus/spawns.json`.
To refresh it:

```sh
cp /home/art/Nexus/spawns.json /home/art/Nexus/spawn-search/spawns.json
```

Reload the page afterward. No game installation files are included or changed.

## Test

Requires Node.js. Search-only tests need no npm packages; calculator tests need `npm ci`:

```sh
node --test search.test.mjs
npm test
```

This is an unofficial viewer. Spawn data and Pokémon names belong to their respective owners.
