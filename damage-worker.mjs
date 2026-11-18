import { preparePlayer, compareMoves, natures, disabledAbilities, oneHpMoves } from './damage-core.mjs';
import { calculatorAreas, areaSpawns } from './areas.mjs';

let spawns, areas;
self.onmessage = ({ data }) => {
  try {
    if (data.type === 'init') {
      spawns = data.spawns;
      areas = calculatorAreas(spawns);
      self.postMessage({ type: 'ready', natures, disabledAbilities: [...disabledAbilities], oneHpMoves: [...oneHpMoves] });
    } else if (data.type === 'prepare') {
      const area = areas?.find(area => area.name === data.area);
      if (!area) throw new Error('Choose a listed area.');
      const modifiers = area.modifiers;
      const { pokemon, moves, warnings, abilityLabel } = preparePlayer(data.paste, modifiers?.player);
      self.postMessage({ type: 'prepared', paste: data.paste, area: data.area, moves, warnings,
        player: { name: pokemon.name, level: pokemon.level, ability: abilityLabel,
          nature: pokemon.nature, ivs: pokemon.ivs, stats: pokemon.rawStats } });
    } else if (data.type === 'calculate') {
      if (!spawns) throw new Error('Spawn data is not loaded.');
      const encounters = areaSpawns(spawns, data.area, data.method);
      const modifiers = areas.find(area => area.name === data.area)?.modifiers;
      const player = preparePlayer(data.paste, modifiers?.player);
      const comparison = compareMoves(player, encounters, { ...data, multipliers: modifiers?.wild },
        progress => self.postMessage({ type: 'progress', ...progress }));
      self.postMessage({ type: 'result', ...comparison });
    }
  } catch (error) {
    self.postMessage({ type: 'error', forType: data.type, paste: data.paste, area: data.area, error: error.message });
  }
};
