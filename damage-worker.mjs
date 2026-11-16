import { preparePlayer, compareMoves, natures, disabledAbilities, oneHpMoves } from './damage-core.mjs';
import { areaSpawns } from './areas.mjs';

let spawns;
self.onmessage = ({ data }) => {
  try {
    if (data.type === 'init') {
      spawns = data.spawns;
      self.postMessage({ type: 'ready', natures, disabledAbilities: [...disabledAbilities], oneHpMoves: [...oneHpMoves] });
    } else if (data.type === 'prepare') {
      const { pokemon, moves, warnings, abilityLabel } = preparePlayer(data.paste);
      self.postMessage({ type: 'prepared', paste: data.paste, moves, warnings,
        player: { name: pokemon.name, level: pokemon.level, ability: abilityLabel,
          nature: pokemon.nature, stats: pokemon.rawStats } });
    } else if (data.type === 'calculate') {
      if (!spawns) throw new Error('Spawn data is not loaded.');
      const player = preparePlayer(data.paste);
      const encounters = areaSpawns(spawns, data.area, data.method);
      const comparison = compareMoves(player, encounters, data, progress => self.postMessage({ type: 'progress', ...progress }));
      self.postMessage({ type: 'result', ...comparison });
    }
  } catch (error) {
    self.postMessage({ type: 'error', forType: data.type, paste: data.paste, error: error.message });
  }
};
