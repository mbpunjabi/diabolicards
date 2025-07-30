
// board.js

import React from 'react';
import gameDefinition from './diabolicards_game_definition_v16_with_layout.json';

const overlayColors = {
  zones: 'lime',
  slots: 'red',
  diabolical: 'blue',
  scorchedEarth: 'yellow',
};

const MatOverlay = () => {
  const layout = gameDefinition.matLayout;

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <img
        src={layout.matImage}
        alt="Game Mat"
        style={{ width: '100%', display: 'block' }}
      />
      {Object.entries(layout).map(([type, boxes]) =>
        type !== 'matImage' ? boxes.map((box, idx) => (
          <div
            key={`${type}-${idx}`}
            style={{
              position: 'absolute',
              left: `${box.x1}px`,
              top: `${box.y1}px`,
              width: `${box.x2 - box.x1}px`,
              height: `${box.y2 - box.y1}px`,
              border: `2px solid ${overlayColors[type]}`,
              pointerEvents: 'none',
              boxSizing: 'border-box',
            }}
          />
        )) : null
      )}
    </div>
  );
};

export const Board = ({ G, ctx, moves, playerID }) => {
  return (
    <div style={{ position: 'relative' }}>
      <MatOverlay />
      {/* Additional interactive components can go here */}
    </div>
  );
};
