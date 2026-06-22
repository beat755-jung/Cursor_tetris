// 게임 설정
const COLS = 10;
const ROWS = 20;
const DROP_INTERVAL_MS = 800;
const LINES_PER_LEVEL = 10;
const NEXT_COUNT = 3;
const BOMB_CHANCE = 0.08;
const STORAGE_KEY = "tetris-warzone-best";

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
const levelElement = document.getElementById("level");
const comboElement = document.getElementById("combo");
const bestScoreElement = document.getElementById("best-score");
const bestLevelElement = document.getElementById("best-level");
const gameStatusElement = document.getElementById("game-status");
const nextQueueElement = document.getElementById("next-queue");
const holdPreviewElement = document.getElementById("hold-preview");
const comboBannerElement = document.getElementById("combo-banner");
const kingKongElement = document.getElementById("king-kong");
const kongRoarElement = document.getElementById("kong-roar");
const startBtn = document.getElementById("start-btn");
const restartBtn = document.getElementById("restart-btn");
const pauseOverlay = document.getElementById("pause-overlay");

// 테트로미노 정의 — 블록 모양별 색상
const PIECES = {
  I: {
    shape: [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    color: "#FFEB3B",
  },
  O: {
    shape: [
      [1, 1],
      [1, 1],
    ],
    color: "#FFA000",
  },
  T: {
    shape: [
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    color: "#AB47BC",
  },
  S: {
    shape: [
      [0, 1, 1],
      [1, 1, 0],
      [0, 0, 0],
    ],
    color: "#43A047",
  },
  Z: {
    shape: [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 0],
    ],
    color: "#E53935",
  },
  J: {
    shape: [
      [1, 0, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    color: "#1E88E5",
  },
  L: {
    shape: [
      [0, 0, 1],
      [1, 1, 1],
      [0, 0, 0],
    ],
    color: "#FF5722",
  },
};

const PIECE_TYPES = Object.keys(PIECES);
const BOMB_COLOR = "#FF1744";

// 게임 상태
let board = [];
let currentPiece = null;
let nextQueue = [];
let heldPiece = null;
let holdUsed = false;
let dropTimer = null;
let isPlaying = false;
let isGameOver = false;
let isAnimating = false;
let isPaused = false;
let score = 0;
let level = 1;
let linesTotal = 0;
let comboCount = 0;
let audioCtx = null;
let kongBeatTimer = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCellSizePx() {
  const cell = boardElement.querySelector(".cell");
  return cell ? cell.offsetHeight : 30;
}

function loadBest() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return data || { score: 0, level: 1 };
  } catch {
    return { score: 0, level: 1 };
  }
}

function updateBestDisplay() {
  const best = loadBest();
  bestScoreElement.textContent = String(best.score);
  bestLevelElement.textContent = String(best.level);
}

function saveBestIfNeeded() {
  const best = loadBest();
  const next = {
    score: Math.max(score, best.score),
    level: Math.max(level, best.level),
  };
  if (next.score !== best.score || next.level !== best.level) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    updateBestDisplay();
  }
}

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
}

function playTone(freq, duration, type = "square", volume = 0.08, delay = 0) {
  initAudio();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  const t = audioCtx.currentTime + delay;
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.start(t);
  osc.stop(t + duration);
}

function playNoise(duration, volume = 0.06) {
  initAudio();
  const bufferSize = audioCtx.sampleRate * duration;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const source = audioCtx.createBufferSource();
  const gain = audioCtx.createGain();
  source.buffer = buffer;
  source.connect(gain);
  gain.connect(audioCtx.destination);
  gain.gain.setValueAtTime(volume, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  source.start();
}

const SFX = {
  missile() {
    playTone(920, 0.08, "sawtooth", 0.06);
    playTone(280, 0.22, "square", 0.07, 0.06);
    playNoise(0.18, 0.05);
  },
  plane() {
    playTone(180, 0.35, "sawtooth", 0.05);
    playTone(120, 0.5, "triangle", 0.04, 0.1);
  },
  domino() {
    playTone(660, 0.05, "square", 0.05);
    playTone(880, 0.05, "square", 0.04, 0.05);
    playTone(1100, 0.08, "square", 0.03, 0.1);
  },
  bomb() {
    playNoise(0.35, 0.12);
    playTone(90, 0.4, "sawtooth", 0.1);
  },
  combo() {
    playTone(523, 0.1, "square", 0.07);
    playTone(659, 0.1, "square", 0.07, 0.1);
    playTone(784, 0.15, "square", 0.06, 0.2);
  },
  kong() {
    playTone(110, 0.12, "sawtooth", 0.09);
    playTone(82, 0.18, "triangle", 0.07, 0.1);
  },
  hold() {
    playTone(440, 0.08, "triangle", 0.05);
  },
};

function startKongBeat() {
  stopKongBeat();
  SFX.kong();
  kongBeatTimer = setInterval(() => SFX.kong(), 600);
}

function stopKongBeat() {
  if (kongBeatTimer !== null) {
    clearInterval(kongBeatTimer);
    kongBeatTimer = null;
  }
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

function cloneShape(shape) {
  return shape.map((row) => [...row]);
}

function createPiece(type, options = {}) {
  if (type === "BOMB") {
    return {
      type: "BOMB",
      isBomb: true,
      shape: [[1]],
      color: BOMB_COLOR,
      row: 0,
      col: Math.floor((COLS - 1) / 2),
    };
  }

  const pieceData = PIECES[type];
  return {
    type,
    isBomb: false,
    shape: cloneShape(pieceData.shape),
    color: pieceData.color,
    row: 0,
    col: Math.floor((COLS - pieceData.shape[0].length) / 2),
    ...options,
  };
}

function createRandomPieceData() {
  if (Math.random() < BOMB_CHANCE) return { type: "BOMB" };
  const type = PIECE_TYPES[Math.floor(Math.random() * PIECE_TYPES.length)];
  return { type };
}

function pieceFromData(data) {
  return createPiece(data.type);
}

function refillQueue() {
  while (nextQueue.length < NEXT_COUNT) {
    nextQueue.push(createRandomPieceData());
  }
}

function stripPiece(piece) {
  return {
    type: piece.type,
    isBomb: piece.isBomb,
    shape: cloneShape(piece.shape),
    color: piece.color,
  };
}

function renderMiniPreview(container, piece) {
  container.innerHTML = "";
  if (!piece) {
    container.classList.add("empty");
    return;
  }
  container.classList.remove("empty");

  const { shape, color } = piece;
  const grid = document.createElement("div");
  grid.className = "preview-grid";
  grid.style.gridTemplateColumns = `repeat(${shape[0].length}, var(--preview-cell))`;
  grid.style.gridTemplateRows = `repeat(${shape.length}, var(--preview-cell))`;

  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      const cell = document.createElement("div");
      cell.className = "preview-cell";
      if (shape[r][c]) {
        cell.classList.add("filled");
        if (piece.isBomb) cell.classList.add("bomb-cell");
        cell.style.backgroundColor = color;
      }
      grid.appendChild(cell);
    }
  }

  container.appendChild(grid);
}

function renderNextQueue() {
  nextQueueElement.innerHTML = "";
  nextQueue.forEach((data, index) => {
    const slot = document.createElement("div");
    slot.className = "next-slot";
    if (index === 0) slot.classList.add("next-first");
    renderMiniPreview(slot, pieceFromData(data));
    nextQueueElement.appendChild(slot);
  });
}

function renderHoldPreview() {
  renderMiniPreview(holdPreviewElement, heldPiece);
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

function drawPiece(piece, className = "active-piece") {
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
        cell.classList.add("filled", className);
        if (piece.isBomb) cell.classList.add("bomb-block");
        cell.style.backgroundColor = color;
      }
    }
  }
}

function getGhostRow(piece) {
  let ghostRow = piece.row;
  while (canMove({ ...piece, row: ghostRow }, 0, 1, board)) {
    ghostRow += 1;
  }
  return ghostRow;
}

function drawGhost(piece) {
  if (!piece || piece.isBomb) return;

  const ghostRow = getGhostRow(piece);
  if (ghostRow === piece.row) return;

  drawPiece({ ...piece, row: ghostRow }, "ghost-piece");
}

function isTopHalfDanger() {
  for (let row = 0; row < ROWS / 2; row++) {
    if (board[row].some((cell) => cell !== null)) return true;
  }
  return false;
}

function updateDangerWarning() {
  boardFrame.classList.toggle("danger-warning", isTopHalfDanger());
}

function render() {
  renderBoard();
  drawGhost(currentPiece);
  drawPiece(currentPiece);
  updateDangerWarning();
  renderNextQueue();
  renderHoldPreview();
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

function explodeBombArea(piece) {
  const centerR =
    piece.row + Math.floor((piece.shape.length - 1) / 2);
  const centerC =
    piece.col + Math.floor((piece.shape[0].length - 1) / 2);

  for (let r = centerR - 1; r <= centerR + 1; r++) {
    for (let c = centerC - 1; c <= centerC + 1; c++) {
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
        board[r][c] = null;
      }
    }
  }

  const cellSize = getCellSizePx();
  createImpactBurst(
    centerC * cellSize + cellSize / 2,
    centerR * cellSize + cellSize / 2
  );
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
  SFX.missile();
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
  SFX.plane();
  const cellSize = getCellSizePx();
  const boardWidth = COLS * cellSize;

  return new Promise((resolve) => {
    const plane = document.createElement("div");
    plane.className = "fx-airplane";
    plane.style.setProperty("--plane-dur", `${PLANE_FLY_MS}ms`);
    plane.innerHTML =
      '<span class="plane-body"></span><span class="plane-wing"></span>';
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
  const avgRow =
    targetRows.reduce((sum, row) => sum + row, 0) / targetRows.length;
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
  if (useStagger) SFX.domino();

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

function showComboBanner(lineCount) {
  if (lineCount < 2 && comboCount < 2) {
    comboBannerElement.textContent = "";
    comboBannerElement.className = "combo-banner";
    return;
  }

  const multiplier = Math.max(comboCount, lineCount >= 2 ? 2 : 1);
  comboBannerElement.textContent = `ARTILLERY COMBO x${multiplier}!`;
  comboBannerElement.className = "combo-banner show";
  SFX.combo();

  setTimeout(() => {
    comboBannerElement.classList.remove("show");
  }, 1800);
}

function triggerKongReaction(lineCount) {
  kingKongElement.classList.remove("kong-clap", "kong-frenzy");
  kongRoarElement.classList.remove("show");
  stopKongBeat();

  if (lineCount >= 3) {
    kingKongElement.classList.add("kong-frenzy");
    kongRoarElement.classList.add("show");
    startKongBeat();
    setTimeout(() => {
      kingKongElement.classList.remove("kong-frenzy");
      kongRoarElement.classList.remove("show");
      stopKongBeat();
    }, 2400);
  } else if (lineCount >= 2) {
    kingKongElement.classList.add("kong-clap");
    SFX.kong();
    setTimeout(() => kingKongElement.classList.remove("kong-clap"), 1200);
  }
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

function getDropInterval() {
  return Math.max(120, DROP_INTERVAL_MS - (level - 1) * 55);
}

function updateLevelDisplay() {
  levelElement.textContent = String(level);
}

function updateComboDisplay() {
  comboElement.textContent = String(comboCount);
}

function applyLevelFromLines() {
  const newLevel = Math.floor(linesTotal / LINES_PER_LEVEL) + 1;
  if (newLevel !== level) {
    level = newLevel;
    updateLevelDisplay();
    if (isPlaying && !isGameOver) {
      startGameLoop();
    }
  }
}

function addScore(linesCleared) {
  const multiplier = comboCount >= 2 ? comboCount : 1;
  const base = LINE_SCORES[linesCleared] ?? linesCleared * 100;
  score += base * multiplier;
  scoreElement.textContent = String(score);
  saveBestIfNeeded();
}

function updateGameStatus(message) {
  gameStatusElement.textContent = message;
}

function triggerGameOver() {
  isGameOver = true;
  isPaused = false;
  pauseOverlay.classList.add("hidden");
  document.body.classList.remove("game-paused");
  stopGameLoop();
  stopKongBeat();
  currentPiece = null;
  saveBestIfNeeded();
  updateGameStatus("게임 오버");
  render();
}

function spawnPiece() {
  refillQueue();
  currentPiece = pieceFromData(nextQueue.shift());
  refillQueue();
  holdUsed = false;

  if (!canMove(currentPiece, 0, 0, board)) {
    triggerGameOver();
    return false;
  }

  return true;
}

async function settlePiece() {
  const lockedPiece = currentPiece;
  lockPiece(currentPiece);

  if (lockedPiece.isBomb) {
    explodeBombArea(lockedPiece);
    SFX.bomb();
  }

  currentPiece = null;

  const fullRows = getFullLineRows();
  if (fullRows.length === 0) {
    comboCount = 0;
    updateComboDisplay();
    comboBannerElement.textContent = "";
    spawnPiece();
    render();
    return;
  }

  isAnimating = true;
  const lineCount = fullRows.length;
  comboCount += 1;
  updateComboDisplay();

  const rowsToClear =
    lineCount >= 3 ? expandBlastRows(fullRows) : fullRows;

  showComboBanner(lineCount);
  triggerKongReaction(lineCount);
  await playLineClearEffects(fullRows, lineCount, rowsToClear);

  removeRows(rowsToClear);
  linesTotal += lineCount;
  applyLevelFromLines();
  addScore(lineCount);

  isAnimating = false;
  spawnPiece();
  render();
}

function dropPiece() {
  if (!currentPiece || !isPlaying || isGameOver || isAnimating || isPaused) return;

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
  if (!currentPiece || !isPlaying || isGameOver || isAnimating || isPaused) return false;

  if (canMove(currentPiece, dx, dy, board)) {
    currentPiece.col += dx;
    currentPiece.row += dy;
    render();
    return true;
  }

  return false;
}

function tryRotatePiece() {
  if (!currentPiece || !isPlaying || isGameOver || isAnimating || isPaused) return false;
  if (currentPiece.isBomb) return false;

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

function tryHold() {
  if (!currentPiece || !isPlaying || isGameOver || isAnimating || isPaused || holdUsed) {
    return;
  }

  initAudio();
  SFX.hold();
  holdUsed = true;
  const currentStripped = stripPiece(currentPiece);

  if (heldPiece) {
    currentPiece = createPiece(heldPiece.type, {
      isBomb: heldPiece.isBomb,
      shape: cloneShape(heldPiece.shape),
      color: heldPiece.color,
    });
    heldPiece = currentStripped;
  } else {
    heldPiece = currentStripped;
    refillQueue();
    currentPiece = pieceFromData(nextQueue.shift());
    refillQueue();
  }

  if (!canMove(currentPiece, 0, 0, board)) {
    triggerGameOver();
    return;
  }

  render();
}

function hardDrop() {
  if (!currentPiece || !isPlaying || isGameOver || isAnimating || isPaused) return;

  while (canMove(currentPiece, 0, 1, board)) {
    currentPiece.row += 1;
  }

  settlePiece();
}

function togglePause() {
  if (!isPlaying || isGameOver || isAnimating) return;

  isPaused = !isPaused;
  pauseOverlay.classList.toggle("hidden", !isPaused);
  pauseOverlay.setAttribute("aria-hidden", String(!isPaused));
  document.body.classList.toggle("game-paused", isPaused);

  if (isPaused) {
    if (dropTimer !== null) {
      clearInterval(dropTimer);
      dropTimer = null;
    }
    stopKongBeat();
    updateGameStatus("일시 정지 — P로 재개");
  } else {
    updateGameStatus("");
    dropTimer = setInterval(dropPiece, getDropInterval());
  }
}

function handleKeyDown(event) {
  if (event.code === "KeyP") {
    event.preventDefault();
    togglePause();
    return;
  }

  if (!isPlaying || isGameOver || isAnimating || isPaused) return;

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
    case "KeyC":
      event.preventDefault();
      tryHold();
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
  if (dropTimer !== null) {
    clearInterval(dropTimer);
    dropTimer = null;
  }
  isPlaying = true;
  if (!isPaused) {
    dropTimer = setInterval(dropPiece, getDropInterval());
  }
}

function resetScore() {
  score = 0;
  level = 1;
  linesTotal = 0;
  comboCount = 0;
  scoreElement.textContent = "0";
  updateLevelDisplay();
  updateComboDisplay();
  comboBannerElement.textContent = "";
}

function resetGame() {
  stopGameLoop();
  stopKongBeat();
  board = createEmptyBoard();
  currentPiece = null;
  nextQueue = [];
  heldPiece = null;
  holdUsed = false;
  isGameOver = false;
  isAnimating = false;
  isPaused = false;
  pauseOverlay.classList.add("hidden");
  pauseOverlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("game-paused");
  clearFxLayer();
  kingKongElement.classList.remove("kong-clap", "kong-frenzy");
  kongRoarElement.classList.remove("show");
  boardFrame.classList.remove("danger-warning");
  updateGameStatus("");
  refillQueue();
  render();
}

function beginGame() {
  initAudio();
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
updateBestDisplay();
resetScore();
resetGame();
document.addEventListener("keydown", handleKeyDown);
