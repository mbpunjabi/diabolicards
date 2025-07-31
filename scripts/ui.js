// ui.js
import { initializeGame, getGameState, playCard, endTurn } from './engine.js';

let selectedCard = null;

function createCardElement(card, side) {
  const div = document.createElement('div');
  div.className = 'card';
  div.style.backgroundImage = `url(${card.image})`;
  div.title = card.name;
  if (side === 'player') {
    div.onclick = () => {
      selectedCard = card;
      renderBoard();
    };
  }
  return div;
}

function createZone(index, label, cardsInZone) {
  const zoneDiv = document.createElement('div');
  zoneDiv.className = 'zone';
  const title = document.createElement('div');
  title.innerText = label;
  zoneDiv.appendChild(title);

  cardsInZone.forEach(card => {
    const el = createCardElement(card, 'player');
    el.onclick = null;
    zoneDiv.appendChild(el);
  });

  zoneDiv.onclick = () => {
    if (selectedCard) {
      playCard(selectedCard, index, 'player');
      selectedCard = null;
      renderBoard();
      endTurn();
    }
  };
  return zoneDiv;
}

function renderBoard() {
  const root = document.getElementById('game-root');
  root.innerHTML = '<h1>Diabolicards</h1>';

  const state = getGameState();

  const handRow = document.createElement('div');
  handRow.style.marginBottom = '1rem';
  state.playerHand.forEach(card => {
    handRow.appendChild(createCardElement(card, 'player'));
  });
  root.appendChild(handRow);

  const zoneLabels = ['Vought Tower', 'The Boys Hideout', 'Godolkin Campus'];
  for (let i = 0; i < 3; i++) {
    root.appendChild(createZone(i, zoneLabels[i], state.board.player[i]));
  }

  const info = document.createElement('p');
  info.innerText = selectedCard ? `Selected: ${selectedCard.name}. Click a zone to play.` : 'Select a card to play.';
  root.appendChild(info);
}

initializeGame();
renderBoard();
