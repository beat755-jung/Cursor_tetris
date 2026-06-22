// 게임 설정
const COLS = 10;
const ROWS = 20;
const DROP_INTERVAL_MS = 800;

const LINE_SCORES = {
  1: 100,
  2: 300,
  3: 500,
  4: 800,
};

// DOM 요소
const boardElement = document.getElementById("game-board");
const scoreElement = document.getElementById("score");
const gameStatusElement = document.getElementById("game-status");
const startBtn = document.getElementById("start-btn");
const restartBtn = document.getElementById("restart-btn");

// 테트로미노 정의
const PIECES = {
  I: {
    shape: [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    color: "#00f0f0",
  },
  O: {
    shape: [
      [1, 1],
      [1, 1],
    ],
    color: "#f0f000",
  },
  T: {
    shape: [
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    color: "#a000f0",
  },
  S: {
    shape: [
      [0, 1, 1],
      [1, 1, 0],
      [0, 0, 0],
    ],
    color: "#00f000",
  },
  Z: {
    shape: [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 0],
    ],
    color: "#f00000",
  },
  J: {
    shape: [
      [1, 0, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    color: "#0000f0",
  },
  L: {
    shape: [
      [0, 0, 1],
      [1, 1, 1],
      [0, 0, 0],
    ],
    color: "#f0a000",
  },
};

const PIECE_TYPES = Object.keys(PIECES);

// 게임 상태
let board = [];
let currentPiece = null;
let dropTimer = null;
let isPlaying = false;
let isGameOver = false;
let score = 0;

function createEmptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function initBoardDOM() {
  boardElement.innerHTML = "";

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.row = row;
      cell.dataset.col = col;
      boardElement.appendChild(cell);
    }
  }
}

function getCell(row, col) {
  return boardElement.querySelector(`[data-row="${row}"][data-col="${col}"]`);
}

function clearCell(cell) {
  cell.className = "cell";
  cell.style.removeProperty("background-color");
}

function createPiece(type) {
  const pieceData = PIECES[type];

  return {
    type,
    shape: pieceData.shape,
    color: pieceData.color,
    row: 0,
    col: Math.floor((COLS - pieceData.shape[0].length) / 2),
  };
}

function createRandomPiece() {
  const type = PIECE_TYPES[Math.floor(Math.random() * PIECE_TYPES.length)];
  return createPiece(type);
}

function renderBoard() {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cell = getCell(row, col);
      clearCell(cell);

      if (board[row][col]) {
        cell.classList.add("filled");
        cell.style.backgroundColor = board[row][col];
      }
    }
  }
}

function drawPiece(piece) {
  if (!piece) return;

  const { shape, color, row: pieceRow, col: pieceCol } = piece;

  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;

      const boardRow = pieceRow + r;
      const boardCol = pieceCol + c;

      if (
        boardRow >= 0 &&
        boardRow < ROWS &&
        boardCol >= 0 &&
        boardCol < COLS
      ) {
        const cell = getCell(boardRow, boardCol);
        cell.classList.add("filled", "active-piece");
        cell.style.backgroundColor = color;
      }
    }
  }
}

function render() {
  renderBoard();
  drawPiece(currentPiece);
}

function canMove(piece, dx, dy, matrix, shapeOverride) {
  if (!piece) return false;

  const shape = shapeOverride ?? piece.shape;
  const { row, col } = piece;

  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;

      const boardRow = row + r + dy;
      const boardCol = col + c + dx;

      if (
        boardRow < 0 ||
        boardRow >= ROWS ||
        boardCol < 0 ||
        boardCol >= COLS
      ) {
        return false;
      }

      if (matrix[boardRow][boardCol]) {
        return false;
      }
    }
  }

  return true;
}

function lockPiece(piece) {
  const { shape, color, row: pieceRow, col: pieceCol } = piece;

  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;

      const boardRow = pieceRow + r;
      const boardCol = pieceCol + c;

      if (
        boardRow >= 0 &&
        boardRow < ROWS &&
        boardCol >= 0 &&
        boardCol < COLS
      ) {
        board[boardRow][boardCol] = color;
      }
    }
  }
}

function isRowFull(row) {
  return row.every((cell) => cell !== null);
}

function clearFullLines() {
  let linesCleared = 0;

  for (let row = ROWS - 1; row >= 0; row--) {
    if (!isRowFull(board[row])) continue;

    board.splice(row, 1);
    board.unshift(Array(COLS).fill(null));
    linesCleared += 1;
    row += 1;
  }

  return linesCleared;
}

function addScore(linesCleared) {
  score += LINE_SCORES[linesCleared] ?? linesCleared * 100;
  scoreElement.textContent = String(score);
}

function updateGameStatus(message) {
  gameStatusElement.textContent = message;
}

function triggerGameOver() {
  isGameOver = true;
  stopGameLoop();
  currentPiece = null;
  updateGameStatus("게임 오버");
  render();
}

function spawnPiece() {
  currentPiece = createRandomPiece();

  if (!canMove(currentPiece, 0, 0, board)) {
    triggerGameOver();
    return false;
  }

  return true;
}

function settlePiece() {
  lockPiece(currentPiece);

  const linesCleared = clearFullLines();
  if (linesCleared > 0) {
    addScore(linesCleared);
  }

  spawnPiece();
  render();
}

function dropPiece() {
  if (!currentPiece || !isPlaying || isGameOver) return;

  if (canMove(currentPiece, 0, 1, board)) {
    currentPiece.row += 1;
    render();
    return;
  }

  settlePiece();
}

function rotateMatrix(matrix) {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const rotated = Array.from({ length: cols }, () => Array(rows).fill(0));

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      rotated[c][rows - 1 - r] = matrix[r][c];
    }
  }

  return rotated;
}

const ROTATION_KICKS = [0, -1, 1, -2, 2];

function tryMovePiece(dx, dy) {
  if (!currentPiece || !isPlaying || isGameOver) return false;

  if (canMove(currentPiece, dx, dy, board)) {
    currentPiece.col += dx;
    currentPiece.row += dy;
    render();
    return true;
  }

  return false;
}

function tryRotatePiece() {
  if (!currentPiece || !isPlaying || isGameOver) return false;

  const rotatedShape = rotateMatrix(currentPiece.shape);

  for (const dx of ROTATION_KICKS) {
    if (canMove(currentPiece, dx, 0, board, rotatedShape)) {
      currentPiece.col += dx;
      currentPiece.shape = rotatedShape;
      render();
      return true;
    }
  }

  return false;
}

function hardDrop() {
  if (!currentPiece || !isPlaying || isGameOver) return;

  while (canMove(currentPiece, 0, 1, board)) {
    currentPiece.row += 1;
  }

  settlePiece();
}

function handleKeyDown(event) {
  if (!isPlaying || isGameOver) return;

  switch (event.code) {
    case "ArrowLeft":
      event.preventDefault();
      tryMovePiece(-1, 0);
      break;
    case "ArrowRight":
      event.preventDefault();
      tryMovePiece(1, 0);
      break;
    case "ArrowDown":
      event.preventDefault();
      tryMovePiece(0, 1);
      break;
    case "ArrowUp":
      event.preventDefault();
      tryRotatePiece();
      break;
    case "Space":
      event.preventDefault();
      hardDrop();
      break;
  }
}

function stopGameLoop() {
  isPlaying = false;

  if (dropTimer !== null) {
    clearInterval(dropTimer);
    dropTimer = null;
  }
}

function startGameLoop() {
  stopGameLoop();
  isPlaying = true;

  dropTimer = setInterval(dropPiece, DROP_INTERVAL_MS);
}

function resetScore() {
  score = 0;
  scoreElement.textContent = "0";
}

function resetGame() {
  stopGameLoop();
  board = createEmptyBoard();
  currentPiece = null;
  isGameOver = false;
  updateGameStatus("");
  render();
}

function beginGame() {
  resetGame();
  spawnPiece();
  startGameLoop();
}

startBtn.addEventListener("click", function () {
  resetScore();
  beginGame();
});

restartBtn.addEventListener("click", function () {
  resetScore();
  beginGame();
});

initBoardDOM();
resetScore();
resetGame();
document.addEventListener("keydown", handleKeyDown);
