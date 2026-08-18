// game setup with defining constants and variables, and such
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

// winning combos for board
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

// Time limit used for each player move
const MOVE_TIME_LIMIT_MS = 5000;

// Game state variables used across functions
let board = Array(9).fill('');
let currentPlayer = 'X';
let gameActive = false;
let winningLine = null;
let gameMode = 'local';
let difficulty = 'easy';
let playerName = 'Player';
let moveTimerId = null;
let countdownId = null;
let deadline = null;
let gameStarted = false;

// Update which mode button is active and enable/disable menu fields
function updateModeUI() {
  modeButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.mode === gameMode);
  });

  const disableFields = gameMode === 'local';
  nameField.classList.toggle('disabled', disableFields);
  playerNameInput.disabled = disableFields;
  difficultySelect.disabled = disableFields;

  if (disableFields) {
    playerNameInput.value = '';
  }
}

// Return the display label for the current player or AI
function getPlayerLabel(symbol) {
  if (gameMode === 'local') {
    return symbol === 'X' ? 'Player X' : 'Player O';
  }

  return symbol === 'X' ? (playerName || 'You') : 'AI';
}

// Update status text with current player turn and countdown
function updateTurnStatus() {
  if (!gameActive || !gameStarted) {
    return;
  }

  const secondsLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  statusElement.textContent = `${getPlayerLabel(currentPlayer)}'s turn (${secondsLeft}s)`;
}

// Clear any existing move timer or countdown interval
function clearTurnTimer() {
  if (moveTimerId) {
    clearTimeout(moveTimerId);
    moveTimerId = null;
  }

  if (countdownId) {
    clearInterval(countdownId);
    countdownId = null;
  }
}

// Start a new timer for the active player's move
function startTurnTimer() {
  if (gameMode === 'ai' && currentPlayer === 'O') {
    return;
  }

  clearTurnTimer();
  deadline = Date.now() + MOVE_TIME_LIMIT_MS;
  updateTurnStatus();
  countdownId = setInterval(updateTurnStatus, 1000);
  moveTimerId = setTimeout(() => {
    clearTurnTimer();
    handleMoveTimeout();
  }, MOVE_TIME_LIMIT_MS);
}

// Handle the case when a player runs out of time
function handleMoveTimeout() {
  if (!gameActive) {
    return;
  }

  gameActive = false;
  renderBoard();
  statusElement.textContent = `${getPlayerLabel(currentPlayer)} timed out!`;
}

// Render the board buttons based on current board state
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

// Check the board for a winning line or draw
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

// Wrapper that checks the current game board
function checkWinner() {
  return checkBoardWinner(board);
}

// Handle a click on a board cell and update the game
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
    gameActive = false;
    renderBoard();
    statusElement.textContent = "It's a draw!";
    return;
  }

  if (result) {
    gameActive = false;
    winningLine = result.line;
    renderBoard();
    statusElement.textContent = `${getPlayerLabel(result.winner)} wins!!!`;
    return;
  }

  currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
  renderBoard();

  if (gameMode === 'ai' && currentPlayer === 'O') {
    statusElement.textContent = `${getPlayerLabel('O')} is thinking...`;
    setTimeout(() => {
      if (gameActive) {
        makeAIMove();
      }
    }, 350);
    return;
  }

  startTurnTimer();
}

// AI/CPU SECTION: move selection and difficulty handling
// -----------------------------------------------------------------------------
// This section decides the AI move when the game is in AI mode
// It first checks for immediate winning or blocking moves, then falls back to a difficulty-specific strategy
// - easy: random move after forced win/block detection (100% random)
// - medium: occasional MINIMAX, otherwise random (60% random, 40% MINIMAX)
// - hard: mostly MINIMAX with occasional weaker moves (85% MINIMAX, 15% random)
// - impossible: always MINIMAX for the best move (100% MINIMAX)

function getBestMove(boardState, aiSymbol, humanSymbol) {
  // Build a list of empty cells that the AI can choose from (similar to buidling a list of available moves)
  const available = boardState.map((value, idx) => (value === '' ? idx : null)).filter((idx) => idx !== null);

  if (!available.length) {
    return null;
  }

  // First, see if the AI can win immediately by filling one of the open spots.
  const winMove = available.find((index) => {
    const trial = [...boardState];
    trial[index] = aiSymbol;
    return checkBoardWinner(trial)?.winner === aiSymbol;
  });

  if (winMove !== undefined) {
    return winMove;
  }

  // Second, see if the human player would win next turn and block that spot.
  const blockMove = available.find((index) => {
    const trial = [...boardState];
    trial[index] = humanSymbol;
    return checkBoardWinner(trial)?.winner === humanSymbol;
  });

  if (blockMove !== undefined) {
    return blockMove;
  }

  // Impossible difficulty always uses MINIMAX for the best move.
  if (difficulty === 'impossible') {
    let bestScore = -Infinity;
    let chosen = available[0];

    available.forEach((index) => {
      const trial = [...boardState];
      trial[index] = aiSymbol;
      const score = MINIMAX(trial, 0, false, aiSymbol, humanSymbol);
      if (score > bestScore) {
        bestScore = score;
        chosen = index;
      }
    });

    return chosen;
  }

  // Hard difficulty uses MINIMAX most of the time, but can still make weaker moves occasionally.
  if (difficulty === 'hard') {
    const useMINIMAX = Math.random() < 0.85; // 85% chance to use MINIMAX on hard
    if (useMINIMAX) {
      let bestScore = -Infinity;
      let chosen = available[0];

      available.forEach((index) => {
        const trial = [...boardState];
        trial[index] = aiSymbol;
        const score = MINIMAX(trial, 0, false, aiSymbol, humanSymbol);
        if (score > bestScore) {
          bestScore = score;
          chosen = index;
        }
      });

      return chosen;
    }
  }

  // Medium difficulty uses MINIMAX occasionally (40%), otherwise it chooses randomly
  if (difficulty === 'medium') {
    const useMINIMAX = Math.random() < 0.4; // 40% chance to use MINIMAX on medium
    if (useMINIMAX) {
      let bestScore = -Infinity;
      let chosen = available[0];

      available.forEach((index) => {
        const trial = [...boardState];
        trial[index] = aiSymbol;
        const score = MINIMAX(trial, 0, false, aiSymbol, humanSymbol);
        if (score > bestScore) {
          bestScore = score;
          chosen = index;
        }
      });

      return chosen;
    }
  }

  // easy mode and the random fallback paths for medium/hard choose a random available move.
  return available[Math.floor(Math.random() * available.length)];
}

// END OF AI/CPU SECTION
// -----------------------------------------------------------------------------






// MINIMAX SECTION: i had a hard time understanding how this works
// -----------------------------------------------------------------------------
// MINIMAX is a "recursive" search that explores possible future moves
// It simulates AI and human turns, assigning scores to game states, then it chooses the highest-score move for the AI and the lowest-score move for the player
// essentially, training an ai mid-game
function MINIMAX(boardState, depth, isMaximizing, aiSymbol, humanSymbol) {
  const result = checkBoardWinner(boardState);

  // If the board is a terminal state, return a score immediately
  // AI win is positive, human win is negative, draw is neutral
  if (result?.winner === aiSymbol) return 10 - depth;
  if (result?.winner === humanSymbol) return depth - 10;
  if (result?.winner === 'draw') return 0;

  // Build a list of all empty cells that can be played next
  const available = boardState.map((value, idx) => (value === '' ? idx : null)).filter((idx) => idx !== null);

  // If this call is for the AI's turn, choose the best score among child moves
  if (isMaximizing) {
    // AI turn: test each empty cell and pick the move with the highest MINIMAX score
    return available.reduce((best, index) => {
      const trial = [...boardState];
      trial[index] = aiSymbol; // simulate AI move on this cell
      const score = MINIMAX(trial, depth + 1, false, aiSymbol, humanSymbol); // evaluate subsequent human turn
      return Math.max(best, score); // keep the highest value
    }, -Infinity);
  }

  // Human turn: the opponent will choose the move that minimizes the AI's score
  return available.reduce((best, index) => {
    const trial = [...boardState];
    trial[index] = humanSymbol; // simulate human move on this cell
    const score = MINIMAX(trial, depth + 1, true, aiSymbol, humanSymbol); // evaluate AI's next turn
    return Math.min(best, score); // keep the lowest value
  }, Infinity);
}

// END OF MINIMAX SECTION
// -----------------------------------------------------------------------------








// Perform the AI move when AI mode is active and it is the AI's turn
function makeAIMove() {
  if (!gameActive || gameMode !== 'ai' || currentPlayer !== 'O') {
    return;
  }

  const moveIndex = getBestMove(board, 'O', 'X');
  if (moveIndex === null) {
    return;
  }

  board[moveIndex] = 'O';
  const result = checkWinner();
  clearTurnTimer();

  if (result?.winner === 'draw') {
    gameActive = false;
    renderBoard();
    statusElement.textContent = "It's a draw!";
    return;
  }

  if (result) {
    gameActive = false;
    winningLine = result.line;
    renderBoard();
    statusElement.textContent = `${getPlayerLabel(result.winner)} wins!!!`;
    return;
  }

  currentPlayer = 'X';
  renderBoard();
  statusElement.textContent = `${getPlayerLabel('X')}'s turn`;
  startTurnTimer();
}




// Start the game from the menu state using selected options
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

// Return to the start menu and pause the current game
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

// Initialize the UI and show the menu on page load
updateModeUI();
renderBoard();
showMenu();
