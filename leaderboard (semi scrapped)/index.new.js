// grab references and define constants and variables from html
const boardElement = document.getElementById('board');
const statusElement = document.getElementById('status');
const restartButton = document.getElementById('restart');
const startMenu = document.getElementById('startMenu');
const gameSection = document.getElementById('gameSection');
const startGameButton = document.getElementById('startGame');
const backToMenuButton = document.getElementById('backToMenu');
const modeButtons = Array.from(document.querySelectorAll('.mode-btn'));
const playerNameInput = document.getElementById('playerName');
const difficultySelect = document.getElementById('difficultySelect');
const nameField = document.getElementById('nameField');
const openLeaderboardButton = document.getElementById('openLeaderboard');
const closeLeaderboardButton = document.getElementById('closeLeaderboard');
const leaderboardModal = document.getElementById('leaderboardModal');
const leaderboardList = document.getElementById('leaderboardList');
const exportLeaderboardButton = document.getElementById('exportLeaderboard');

// map out array and stuff,and all winning combos
const winningCombos = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

// Single value that controls how long each turn stays active before timing out.
const MOVE_TIME_LIMIT_MS = 3000;
const LEADERBOARD_STORAGE_KEY = 'ticTacToeLeaderboard';
const LEADERBOARD_API_URL = '/api/leaderboard';

let board = Array(9).fill('');
let currentPlayer = 'X';
let gameActive = true;
let winningLine = null;
let gameStarted = false;
let gameMode = 'local';
let difficulty = 'easy';
let playerName = 'Player';
let moveTimerId = null;
let moveCountdownIntervalId = null;
let moveDeadline = null;
let leaderboard = { easy: {}, medium: {}, hard: {} };

async function loadLeaderboard() {
  try {
    const response = await fetch(LEADERBOARD_API_URL);
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.warn('Leaderboard file is unavailable, using fallback storage.', error);
  }

  const saved = localStorage.getItem(LEADERBOARD_STORAGE_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (error) {
      console.warn('Unable to read cached leaderboard.', error);
    }
  }

  return { easy: {}, medium: {}, hard: {} };
}

async function saveLeaderboard() {
  try {
    // Send the latest leaderboard state to the local JSON endpoint so it is saved in the workspace.
    await fetch(LEADERBOARD_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(leaderboard, null, 2),
    });
  } catch (error) {
    // Fall back to browser storage if the local server cannot be reached.
    localStorage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(leaderboard));
  }

  renderLeaderboard();
}

function getRatio(stats) {
  if (stats.losses === 0) {
    return stats.wins === 0 ? '0.00' : '∞';
  }

  return (stats.wins / stats.losses).toFixed(2);
}

function renderLeaderboard() {
  const rows = Object.entries(leaderboard).flatMap(([difficultyKey, entries]) =>
    Object.entries(entries).map(([name, stats]) => ({ difficultyKey, name, stats }))
  );

  rows.sort((a, b) => {
    if (a.difficultyKey !== b.difficultyKey) {
      return a.difficultyKey.localeCompare(b.difficultyKey);
    }

    const ratioA = a.stats.losses === 0 ? (a.stats.wins > 0 ? Infinity : 0) : a.stats.wins / a.stats.losses;
    const ratioB = b.stats.losses === 0 ? (b.stats.wins > 0 ? Infinity : 0) : b.stats.wins / b.stats.losses;
    return ratioB - ratioA;
  });

  if (!rows.length) {
    leaderboardList.innerHTML = '<p class="empty-state">No results yet. Finish an AI match to build the board.</p>';
    return;
  }

  leaderboardList.innerHTML = [
    '<div class="leaderboard-row head"><span>Player</span><span>Mode</span><span>W</span><span>L</span><span>Ratio</span></div>',
    ...rows.map(({ difficultyKey, name, stats }) => `
      <div class="leaderboard-row">
        <span>${name}</span>
        <span>${difficultyKey}</span>
        <span>${stats.wins}</span>
        <span>${stats.losses}</span>
        <span>${getRatio(stats)}</span>
      </div>
    `),
  ].join('');
}

function exportLeaderboard() {
  const blob = new Blob([JSON.stringify(leaderboard, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = 'leaderboard.json';
  link.click();
  URL.revokeObjectURL(url);
}

function openLeaderboard() {
  leaderboardModal.classList.remove('hidden');
  leaderboardModal.setAttribute('aria-hidden', 'false');
  renderLeaderboard();
}

function closeLeaderboard() {
  leaderboardModal.classList.add('hidden');
  leaderboardModal.setAttribute('aria-hidden', 'true');
}

function clearTurnTimer() {
  if (moveTimerId) {
    clearTimeout(moveTimerId);
    moveTimerId = null;
  }

  if (moveCountdownIntervalId) {
    clearInterval(moveCountdownIntervalId);
    moveCountdownIntervalId = null;
  }
}

function updateModeUI() {
  modeButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.mode === gameMode);
  });

  const nameDisabled = gameMode === 'local';
  nameField.classList.toggle('disabled', nameDisabled);
  playerNameInput.disabled = nameDisabled;
  difficultySelect.disabled = nameDisabled;

  if (nameDisabled) {
    playerNameInput.value = '';
  }
}

function getPlayerLabel(symbol) {
  if (gameMode === 'local') {
    return symbol === 'X' ? 'Player X' : 'Player O';
  }

  return symbol === 'X' ? (playerName || 'You') : 'AI';
}

function updateTurnStatus() {
  if (!gameActive || !gameStarted) {
    return;
  }

  const remainingSeconds = Math.max(0, Math.ceil((moveDeadline - Date.now()) / 1000));
  statusElement.textContent = `${getPlayerLabel(currentPlayer)}'s turn (${remainingSeconds}s)`;
}

function startTurnTimer() {
  if (gameMode === 'ai' && currentPlayer === 'O') {
    return;
  }

  // Reset any previous timer before starting a fresh countdown for the next turn.
  clearTurnTimer();
  moveDeadline = Date.now() + MOVE_TIME_LIMIT_MS;
  updateTurnStatus();
  moveCountdownIntervalId = setInterval(updateTurnStatus, 1000);
  moveTimerId = setTimeout(() => {
    clearTurnTimer();
    handleMoveTimeout();
  }, MOVE_TIME_LIMIT_MS);
}

function handleMoveTimeout() {
  if (!gameActive) {
    return;
  }

  gameActive = false;
  renderBoard();
  statusElement.textContent = `${getPlayerLabel(currentPlayer)} timed out!`;
}

function renderBoard() {
  boardElement.innerHTML = '';
  board.forEach((value, index) => {
    const cell = document.createElement('button');
    cell.className = 'cell';
    cell.type = 'button';
    cell.setAttribute('role', 'gridcell');

    cell.textContent = value;
    cell.disabled = Boolean(value) || !gameActive || (gameMode === 'ai' && currentPlayer === 'O');

    cell.classList.toggle('is-filled', Boolean(value));
    cell.classList.toggle('winner', winningLine && winningLine.includes(index));
    cell.addEventListener('click', () => handleCellClick(index));
    boardElement.appendChild(cell);
  });
}

function checkBoardWinner(boardState) {
  for (const combo of winningCombos) {
    const [a, b, c] = combo;
    if (boardState[a] && boardState[a] === boardState[b] && boardState[a] === boardState[c]) {
      return { winner: boardState[a], line: combo };
    }
  }

  if (boardState.every(Boolean)) {
    return { winner: 'draw' };
  }

  return null;
}

function checkWinner() {
  return checkBoardWinner(board);
}

function getOrCreateEntry(difficultyKey, name) {
  if (!leaderboard[difficultyKey]) {
    leaderboard[difficultyKey] = {};
  }

  if (!leaderboard[difficultyKey][name]) {
    leaderboard[difficultyKey][name] = { wins: 0, losses: 0, draws: 0 };
  }

  return leaderboard[difficultyKey][name];
}

function updateLeaderboard(winnerSymbol) {
  if (gameMode !== 'ai') {
    return;
  }

  const playerKey = (playerName || 'Player').trim() || 'Player';
  const aiKey = 'AI';
  const playerEntry = getOrCreateEntry(difficulty, playerKey);
  const aiEntry = getOrCreateEntry(difficulty, aiKey);

  if (winnerSymbol === 'X') {
    playerEntry.wins += 1;
    aiEntry.losses += 1;
  } else if (winnerSymbol === 'O') {
    playerEntry.losses += 1;
    aiEntry.wins += 1;
  } else {
    playerEntry.draws += 1;
    aiEntry.draws += 1;
  }

  saveLeaderboard();
}

function endGame(result) {
  clearTurnTimer();
  gameActive = false;
  winningLine = result.line || null;
  renderBoard();

  if (result.winner === 'draw') {
    statusElement.textContent = "It's a draw!";
  } else {
    statusElement.textContent = `${getPlayerLabel(result.winner)} wins!!!`;
  }

  if (gameMode === 'ai' && result.winner !== undefined) {
    updateLeaderboard(result.winner);
  }
}

function handleCellClick(index) {
  if (!gameActive || board[index]) {
    return;
  }

  if (gameMode === 'ai' && currentPlayer === 'O') {
    return;
  }

  board[index] = currentPlayer;
  const result = checkWinner();
  clearTurnTimer();

  if (result?.winner === 'draw') {
    endGame(result);
    return;
  }

  if (result) {
    endGame(result);
    return;
  }

  currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
  renderBoard();

  if (gameMode === 'ai' && currentPlayer === 'O') {
    statusElement.textContent = `${getPlayerLabel('O')} is thinking...`;
    window.setTimeout(() => {
      if (gameActive) {
        makeAIMove();
      }
    }, 400);
    return;
  }

  startTurnTimer();
}

function getBestMove(boardState, aiSymbol, humanSymbol) {
  const emptyIndexes = boardState
    .map((value, index) => (value === '' ? index : null))
    .filter((value) => value !== null);

  if (!emptyIndexes.length) {
    return null;
  }

  const winningMove = emptyIndexes.find((index) => {
    const trialBoard = [...boardState];
    trialBoard[index] = aiSymbol;
    return checkBoardWinner(trialBoard)?.winner === aiSymbol;
  });

  if (winningMove !== undefined) {
    return winningMove;
  }

  const blockingMove = emptyIndexes.find((index) => {
    const trialBoard = [...boardState];
    trialBoard[index] = humanSymbol;
    return checkBoardWinner(trialBoard)?.winner === humanSymbol;
  });

  if (blockingMove !== undefined) {
    return blockingMove;
  }

  if (difficulty === 'hard') {
    let bestScore = -Infinity;
    let chosenMove = emptyIndexes[0];

    emptyIndexes.forEach((index) => {
      const trialBoard = [...boardState];
      trialBoard[index] = aiSymbol;
      const score = minimax(trialBoard, 0, false, aiSymbol, humanSymbol);
      if (score > bestScore) {
        bestScore = score;
        chosenMove = index;
      }
    });

    return chosenMove;
  }

  return emptyIndexes[Math.floor(Math.random() * emptyIndexes.length)];
}

function minimax(boardState, depth, isMaximizing, aiSymbol, humanSymbol) {
  const result = checkBoardWinner(boardState);
  if (result?.winner === aiSymbol) {
    return 10 - depth;
  }

  if (result?.winner === humanSymbol) {
    return depth - 10;
  }

  if (result?.winner === 'draw') {
    return 0;
  }

  const emptyIndexes = boardState
    .map((value, index) => (value === '' ? index : null))
    .filter((value) => value !== null);

  if (isMaximizing) {
    let bestScore = -Infinity;
    emptyIndexes.forEach((index) => {
      const trialBoard = [...boardState];
      trialBoard[index] = aiSymbol;
      bestScore = Math.max(bestScore, minimax(trialBoard, depth + 1, false, aiSymbol, humanSymbol));
    });
    return bestScore;
  }

  let bestScore = Infinity;
  emptyIndexes.forEach((index) => {
    const trialBoard = [...boardState];
    trialBoard[index] = humanSymbol;
    bestScore = Math.min(bestScore, minimax(trialBoard, depth + 1, true, aiSymbol, humanSymbol));
  });
  return bestScore;
}

function makeAIMove() {
  if (!gameActive || gameMode !== 'ai' || currentPlayer !== 'O') {
    return;
  }

  const moveIndex = getBestMove(board, 'O', 'X');
  if (moveIndex === null || moveIndex === undefined) {
    return;
  }

  board[moveIndex] = 'O';
  const result = checkWinner();
  clearTurnTimer();

  if (result?.winner === 'draw') {
    endGame(result);
    return;
  }

  if (result) {
    endGame(result);
    return;
  }

  currentPlayer = 'X';
  renderBoard();
  statusElement.textContent = `${getPlayerLabel('X')}'s turn`;
  startTurnTimer();
}

function startGame() {
  gameMode = document.querySelector('.mode-btn.active')?.dataset.mode || 'local';
  difficulty = difficultySelect.value;
  playerName = playerNameInput.value.trim() || 'Player';
  gameStarted = true;
  board = Array(9).fill('');
  currentPlayer = 'X';
  gameActive = true;
  winningLine = null;
  clearTurnTimer();
  renderBoard();
  updateModeUI();
  gameSection.classList.remove('hidden');
  startMenu.classList.add('hidden');
  statusElement.textContent = `${getPlayerLabel('X')}'s turn`;
  startTurnTimer();
}

function showMenu() {
  gameStarted = false;
  clearTurnTimer();
  gameActive = false;
  gameSection.classList.add('hidden');
  startMenu.classList.remove('hidden');
  statusElement.textContent = 'Pick a mode to begin';
}

modeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    gameMode = button.dataset.mode;
    updateModeUI();
  });
});

startGameButton.addEventListener('click', startGame);
restartButton.addEventListener('click', () => {
  if (!gameStarted) {
    return;
  }

  clearTurnTimer();
  board = Array(9).fill('');
  currentPlayer = 'X';
  gameActive = true;
  winningLine = null;
  renderBoard();
  statusElement.textContent = `${getPlayerLabel('X')}'s turn`;
  startTurnTimer();
});
backToMenuButton.addEventListener('click', showMenu);
openLeaderboardButton.addEventListener('click', openLeaderboard);
closeLeaderboardButton.addEventListener('click', closeLeaderboard);
leaderboardModal.addEventListener('click', (event) => {
  if (event.target === leaderboardModal) {
    closeLeaderboard();
  }
});
exportLeaderboardButton.addEventListener('click', exportLeaderboard);
difficultySelect.addEventListener('change', () => {
  difficulty = difficultySelect.value;
});

async function initializeApp() {
  leaderboard = await loadLeaderboard();
  renderLeaderboard();
  updateModeUI();
  renderBoard();
  showMenu();
}

initializeApp();
