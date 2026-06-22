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

const DOMINO_COL_MS = 42;
const DOMINO_ROW_MS = 130;
const MISSILE_FALL_MS = 520;
const PLANE_FLY_MS = 1900;

// DOM 요소
const boardElement = document.getElementById("game-board");
const fxLayer = document.getElementById("fx-layer");
const boardFrame = document.querySelector(".board-frame");
const scoreElement = document.getElementById("score");
const gameStatusElement = document.getElementById("game-status");
const startBtn = document.getElementById("start-btn");
const restartBtn = document.getElementById("restart-btn");

// 테트로미노 정의 — 블록 모양별 색상
const PIECES = {
  I: {
    // 긴 막대 (ㅡ)
    shape: [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    color: "#FFEB3B",
  },
  O: {
    // 정사각형 (ㅁ)
    shape: [
      [1, 1],
      [1, 1],
    ],
    color: "#FFA000",
  },
  T: {
    // T자
    shape: [
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    color: "#AB47BC",
  },
  S: {
    // S자 (지그)
    shape: [
      [0, 1, 1],
      [1, 1, 0],
      [0, 0, 0],
    ],
    color: "#43A047",
  },
  Z: {
    // Z자 (역지그)
    shape: [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 0],
    ],
    color: "#E53935",
  },
  J: {
    // 반전 기역자 (ㅓ)
    shape: [
      [1, 0, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    color: "#1E88E5",
  },
  L: {
    // 기역자 (ㅏ)
    shape: [
      [0, 0, 1],
      [1, 1, 1],
      [0, 0, 0],
    ],
    color: "#FF5722",
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
let isAnimating = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCellSizePx() {
  const cell = boardElement.querySelector(".cell");
  return cell ? cell.offsetHeight : 30;
}

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
  cell.style.removeProperty("animation-delay");
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

function getFullLineRows() {
  const rows = [];
  for (let row = 0; row < ROWS; row++) {
    if (isRowFull(board[row])) rows.push(row);
  }
  return rows;
}

function expandBlastRows(fullRows) {
  const expanded = new Set(fullRows);
  for (const row of fullRows) {
    if (row > 0) expanded.add(row - 1);
    if (row < ROWS - 1) expanded.add(row + 1);
  }
  return [...expanded].sort((a, b) => a - b);
}

function removeRows(rowsToClear) {
  const removeSet = new Set(rowsToClear);
  board = board.filter((_, index) => !removeSet.has(index));
  while (board.length < ROWS) {
    board.unshift(Array(COLS).fill(null));
  }
}

function clearFxLayer() {
  fxLayer.innerHTML = "";
}

function createImpactBurst(left, top) {
  const burst = document.createElement("div");
  burst.className = "fx-impact";
  burst.style.left = `${left}px`;
  burst.style.top = `${top}px`;
  fxLayer.appendChild(burst);
  burst.addEventListener("animationend", () => burst.remove());
}

function dropBombAt(row, leftPx) {
  const cellSize = getCellSizePx();
  const bomb = document.createElement("div");
  bomb.className = "fx-bomb";
  bomb.style.left = `${leftPx}px`;
  bomb.style.top = "0px";
  fxLayer.appendChild(bomb);

  const targetY = row * cellSize + cellSize * 0.4;
  requestAnimationFrame(() => {
    bomb.style.transition = `top ${MISSILE_FALL_MS}ms ease-in`;
    bomb.style.top = `${targetY}px`;
  });

  setTimeout(() => {
    bomb.classList.add("detonate");
    createImpactBurst(leftPx, targetY);
    bomb.remove();
  }, MISSILE_FALL_MS);
}

function playMissileStrike(targetRows) {
  const cellSize = getCellSizePx();
  const strikes = targetRows.map((row, index) => {
    const left = (1.5 + index * 3.5) * cellSize;
    const targetY = row * cellSize + cellSize * 0.45;

    return new Promise((resolve) => {
      const missile = document.createElement("div");
      missile.className = "fx-missile";
      missile.style.left = `${left}px`;
      fxLayer.appendChild(missile);

      requestAnimationFrame(() => {
        missile.style.transition = `top ${MISSILE_FALL_MS}ms ease-in`;
        missile.style.top = `${targetY}px`;
      });

      setTimeout(() => {
        createImpactBurst(left, targetY);
        missile.remove();
        resolve();
      }, MISSILE_FALL_MS);
    });
  });

  return Promise.all(strikes);
}

function playAirplaneBombardment(targetRows) {
  const cellSize = getCellSizePx();
  const boardWidth = COLS * cellSize;

  return new Promise((resolve) => {
    const plane = document.createElement("div");
    plane.className = "fx-airplane";
    plane.style.setProperty("--plane-dur", `${PLANE_FLY_MS}ms`);
    plane.innerHTML = '<span class="plane-body"></span><span class="plane-wing"></span>';
    fxLayer.appendChild(plane);

    const bombCount = Math.max(targetRows.length + 1, 4);
    for (let i = 0; i < bombCount; i++) {
      setTimeout(() => {
        const row = targetRows[i % targetRows.length];
        const left = ((i + 1) / (bombCount + 1)) * boardWidth;
        dropBombAt(row, left);
      }, 280 + i * 320);
    }

    setTimeout(() => {
      plane.remove();
      resolve();
    }, PLANE_FLY_MS);
  });
}

function playMegaExplosion(targetRows) {
  const cellSize = getCellSizePx();
  const avgRow = targetRows.reduce((sum, row) => sum + row, 0) / targetRows.length;
  const centerY = avgRow * cellSize;

  return new Promise((resolve) => {
    boardFrame.classList.add("screen-shake");

    const boom = document.createElement("div");
    boom.className = "fx-mega-boom";
    boom.style.top = `${centerY - cellSize}px`;
    fxLayer.appendChild(boom);

    const flash = document.createElement("div");
    flash.className = "fx-mega-flash";
    fxLayer.appendChild(flash);

    setTimeout(() => {
      boardFrame.classList.remove("screen-shake");
      boom.remove();
      flash.remove();
      resolve();
    }, 780);
  });
}

function playDominoClear(rows, useStagger) {
  return new Promise((resolve) => {
    const orderedRows = [...rows].sort((a, b) => b - a);
    let maxDelay = 0;

    orderedRows.forEach((row, rowIndex) => {
      for (let col = 0; col < COLS; col++) {
        const cell = getCell(row, col);
        if (!board[row][col]) continue;

        if (useStagger) {
          const delay = rowIndex * DOMINO_ROW_MS + col * DOMINO_COL_MS;
          maxDelay = Math.max(maxDelay, delay);
          cell.style.animationDelay = `${delay}ms`;
          cell.classList.add("domino-out");
        } else {
          cell.classList.add("line-clear-flash");
          maxDelay = 180;
        }
      }
    });

    setTimeout(resolve, maxDelay + 380);
  });
}

async function playLineClearEffects(fullRows, lineCount, rowsToClear) {
  render();

  if (lineCount >= 3) {
    await playAirplaneBombardment(fullRows);
    await playMegaExplosion(fullRows);
  } else if (lineCount >= 2) {
    await playMissileStrike(fullRows);
  }

  await playDominoClear(rowsToClear, lineCount >= 2);
  clearFxLayer();
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

async function settlePiece() {
  lockPiece(currentPiece);
  currentPiece = null;

  const fullRows = getFullLineRows();
  if (fullRows.length === 0) {
    spawnPiece();
    render();
    return;
  }

  isAnimating = true;
  const lineCount = fullRows.length;
  const rowsToClear =
    lineCount >= 3 ? expandBlastRows(fullRows) : fullRows;

  await playLineClearEffects(fullRows, lineCount, rowsToClear);

  removeRows(rowsToClear);
  addScore(lineCount);

  isAnimating = false;
  spawnPiece();
  render();
}

function dropPiece() {
  if (!currentPiece || !isPlaying || isGameOver || isAnimating) return;

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
  if (!currentPiece || !isPlaying || isGameOver || isAnimating) return false;

  if (canMove(currentPiece, dx, dy, board)) {
    currentPiece.col += dx;
    currentPiece.row += dy;
    render();
    return true;
  }

  return false;
}

function tryRotatePiece() {
  if (!currentPiece || !isPlaying || isGameOver || isAnimating) return false;

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
  if (!currentPiece || !isPlaying || isGameOver || isAnimating) return;

  while (canMove(currentPiece, 0, 1, board)) {
    currentPiece.row += 1;
  }

  settlePiece();
}

function handleKeyDown(event) {
  if (!isPlaying || isGameOver || isAnimating) return;

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
  isAnimating = false;
  clearFxLayer();
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
