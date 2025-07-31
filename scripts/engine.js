// engine.js
import { cards } from './data.js';

let gameState = {
  playerHand: [],
  opponentHand: [],
  board: {
    player: [[], [], []],  // Vought, Boys, Godolkin zones
    opponent: [[], [], []]
  },
  deck: [],
  turn: 'player',
  history: []
};

export function initializeGame() {
  gameState.deck = [...cards];
  shuffle(gameState.deck);
  gameState.playerHand = drawCards(4);
  gameState.opponentHand = drawCards(4);
}

function drawCards(n) {
  return gameState.deck.splice(0, n);
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}

export function getGameState() {
  return gameState;
}

export function playCard(card, zone, side) {
  const zoneIndex = zone; // 0: Vought, 1: Boys, 2: Godolkin
  gameState.board[side][zoneIndex].push(card);
  triggerAbility(card, zoneIndex, side);
}

function triggerAbility(card, zone, side) {
  if (card.ability === "Strategy") {
    gameState.turn = side; // extra turn
  }
  // Other abilities can be added here
}

export function endTurn() {
  gameState.turn = gameState.turn === 'player' ? 'opponent' : 'player';
  if (gameState.turn === 'opponent') makeAIMove();
}

function makeAIMove() {
  setTimeout(() => {
    import('./ai.js').then(mod => {
      mod.aiPlayTurn(gameState);
    });
  }, 500);
}
