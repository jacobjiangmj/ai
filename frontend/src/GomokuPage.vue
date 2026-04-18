<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import GomokuEngineWorker from './gomokuEngineWorker.js?worker'
import { getForbiddenMoveReason } from './gomokuEngine'

const boardSize = 15
const settingsStorageKey = 'gomoku-settings'
const gameStorageKey = 'gomoku-game-state'
const sideLabels = {
  black: '黑方',
  white: '白方',
}
const modeOptions = [
  { label: '双人对弈', value: 'human-vs-human' },
  { label: '人机对战', value: 'human-vs-ai' },
]
const aiSideOptions = [
  { label: 'AI 执白', value: 'white' },
  { label: 'AI 执黑', value: 'black' },
]
const aiDifficultyOptions = [
  { label: '简单', value: 'easy' },
  { label: '普通', value: 'normal' },
  { label: '困难', value: 'hard' },
]
const suggestionStrengthOptions = [
  { label: '标准', value: 'standard' },
  { label: '深度', value: 'deep' },
  { label: '极限', value: 'max' },
]
const suggestionStyleOptions = [
  { label: '平衡', value: 'balanced' },
  { label: '进攻', value: 'aggressive' },
  { label: '防守', value: 'defensive' },
]
const ruleOptions = [
  { label: '自由连珠', value: 'freestyle' },
  { label: '标准五子', value: 'standard' },
]
const aiDifficultyConfig = {
  easy: { delay: 220, radius: 1, rootBreadth: 5, searchBreadth: 4, searchDepth: 1, maxSearchMs: 80, randomTop: 2 },
  normal: { delay: 360, radius: 2, rootBreadth: 6, searchBreadth: 5, searchDepth: 2, maxSearchMs: 180, randomTop: 1 },
  hard: { delay: 520, radius: 2, rootBreadth: 8, searchBreadth: 6, searchDepth: 3, maxSearchMs: 420, randomTop: 1 },
}
const suggestionStrengthConfig = {
  standard: { radius: 2, limit: 3, rootBreadth: 5, searchBreadth: 4, searchDepth: 1, maxSearchMs: 90 },
  deep: { radius: 2, limit: 4, rootBreadth: 7, searchBreadth: 5, searchDepth: 2, maxSearchMs: 200 },
  max: { radius: 3, limit: 5, rootBreadth: 9, searchBreadth: 6, searchDepth: 3, maxSearchMs: 460 },
}
const winnerBurstOffsets = [
  { x: '-32%', y: '-28%', delay: '0s' },
  { x: '30%', y: '-30%', delay: '0.08s' },
  { x: '-36%', y: '2%', delay: '0.16s' },
  { x: '40%', y: '4%', delay: '0.24s' },
  { x: '-28%', y: '34%', delay: '0.32s' },
  { x: '26%', y: '36%', delay: '0.4s' },
]
function createEmptyBoard() {
  return Array.from({ length: boardSize }, () => Array.from({ length: boardSize }, () => null))
}

function cloneBoard(sourceBoard) {
  return sourceBoard.map((row) => [...row])
}

function createEnginePayload(payload) {
  return {
    ...payload,
    board: cloneBoard(payload.board),
  }
}

function serializeMove(row, col) {
  return `${row}-${col}`
}

function oppositeSide(side) {
  return side === 'black' ? 'white' : 'black'
}

function isInsideBoard(row, col) {
  return row >= 0 && row < boardSize && col >= 0 && col < boardSize
}

function buildMoveText(row, col) {
  return `第 ${row + 1} 行，第 ${col + 1} 列`
}

const gameMode = ref('human-vs-ai')
const aiSide = ref('white')
const aiDifficulty = ref('normal')
const suggestionStrength = ref('deep')
const suggestionStyle = ref('balanced')
const ruleMode = ref('freestyle')
const forbiddenMoveEnabled = ref(false)
const board = ref(createEmptyBoard())
const currentPlayer = ref('black')
const winner = ref('')
const notice = ref('黑方先行，点击棋盘落子。')
const moveRecords = ref([])
const historyStack = ref([])
const lastMove = ref(null)
const aiThinking = ref(false)
const aiSuggestion = ref(null)
const suggestedIndex = ref(0)
const suggestedMove = ref(null)
const suggestionLoading = ref(false)
const suggestionAbortHint = ref(false)
const suggestionTaskId = ref(0)
const winnerOverlayTransparent = ref(false)
const soundEnabled = ref(true)
const audioReady = ref(false)
const audioDebugMessage = ref('等待首次交互解锁音频')

let aiTimer = null
let suggestionTimer = null
let audioContext = null
let effectsGainNode = null
let engineWorker = null

const boardRows = computed(() => Array.from({ length: boardSize }, (_, index) => index))
const boardCols = computed(() => Array.from({ length: boardSize }, (_, index) => index))
const aiEnabled = computed(() => gameMode.value === 'human-vs-ai')
const forbiddenRulesActive = computed(() => ruleMode.value === 'standard' && forbiddenMoveEnabled.value)
const forbiddenToggleLocked = computed(() => moveCount.value > 0)
const isAiTurn = computed(() => aiEnabled.value && currentPlayer.value === aiSide.value && !winner.value)
const currentAiConfig = computed(() => aiDifficultyConfig[aiDifficulty.value] || aiDifficultyConfig.normal)
const moveCount = computed(() => moveRecords.value.length)
const recentMoves = computed(() => [...moveRecords.value].slice(-12).reverse())
const currentAiDifficultyLabel = computed(() => aiDifficultyOptions.find((item) => item.value === aiDifficulty.value)?.label || '普通')
const suggestionButtonDisabledReason = computed(() => {
  if (suggestionLoading.value) {
    return ''
  }
  if (winner.value) {
    return '本局已结束，重开后才能继续推荐。'
  }
  if (isAiTurn.value || aiThinking.value) {
    return `${sideLabels[aiSide.value]}回合进行中，暂不提供人工介入推荐。`
  }
  return ''
})
const suggestionButtonLabel = computed(() => {
  if (suggestionLoading.value) {
    return '计算中...'
  }
  if (suggestionButtonDisabledReason.value && !winner.value) {
    return '智能推荐一步'
  }
  return '智能推荐一步'
})
const winnerOverlayTitle = computed(() => {
  if (!winner.value) {
    return ''
  }
  return winner.value === 'draw' ? '本局和棋' : `${sideLabels[winner.value]}胜了`
})
const winnerOverlayHeadline = computed(() => {
  if (!winner.value) {
    return ''
  }
  if (winner.value === 'draw') {
    return '和棋'
  }
  return winner.value === 'black' ? '黑方胜' : '白方胜'
})
const winnerOverlaySubtitle = computed(() => {
  if (!winner.value) {
    return ''
  }
  if (winner.value === 'draw') {
    return '双方在当前棋盘上未分胜负。'
  }
  if (aiEnabled.value) {
    return winner.value === aiSide.value ? '这一局 AI 率先连成五子。' : '这一局你率先连成五子。'
  }
  return '本局五子棋已经分出胜负。'
})
const audioStateLabel = computed(() => audioContext?.state || 'not-created')

function createSnapshot() {
  return {
    board: cloneBoard(board.value),
    currentPlayer: currentPlayer.value,
    winner: winner.value,
    notice: notice.value,
    lastMove: lastMove.value ? { ...lastMove.value } : null,
    moveRecords: moveRecords.value.map((move) => ({ ...move })),
  }
}

function restoreSnapshot(snapshot) {
  terminateEngineWorker()
  board.value = cloneBoard(snapshot.board)
  currentPlayer.value = snapshot.currentPlayer
  winner.value = snapshot.winner
  notice.value = snapshot.notice
  lastMove.value = snapshot.lastMove ? { ...snapshot.lastMove } : null
  moveRecords.value = snapshot.moveRecords.map((move) => ({ ...move }))
  aiThinking.value = false
  winnerOverlayTransparent.value = false
  aiSuggestion.value = null
  suggestedMove.value = null
}

function getForbiddenReason(sourceBoard, move, side) {
  return getForbiddenMoveReason(sourceBoard, move, side, forbiddenRulesActive.value)
}

function isLegalMove(sourceBoard, move, side) {
  return !getForbiddenReason(sourceBoard, move, side)
}

function countDirection(sourceBoard, row, col, rowStep, colStep, side) {
  let total = 0
  let nextRow = row + rowStep
  let nextCol = col + colStep
  while (isInsideBoard(nextRow, nextCol) && sourceBoard[nextRow][nextCol] === side) {
    total += 1
    nextRow += rowStep
    nextCol += colStep
  }
  return total
}

function findWinningLine(sourceBoard, row, col, side) {
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ]

  for (const [rowStep, colStep] of directions) {
    const cells = [{ row, col }]

    let nextRow = row + rowStep
    let nextCol = col + colStep
    while (isInsideBoard(nextRow, nextCol) && sourceBoard[nextRow][nextCol] === side) {
      cells.push({ row: nextRow, col: nextCol })
      nextRow += rowStep
      nextCol += colStep
    }

    nextRow = row - rowStep
    nextCol = col - colStep
    while (isInsideBoard(nextRow, nextCol) && sourceBoard[nextRow][nextCol] === side) {
      cells.unshift({ row: nextRow, col: nextCol })
      nextRow -= rowStep
      nextCol -= colStep
    }

    if (cells.length >= 5) {
      return cells
    }
  }

  return null
}

function hasFiveInRow(sourceBoard, row, col, side) {
  return Boolean(findWinningLine(sourceBoard, row, col, side))
}

function getLineScore(sourceBoard, row, col, side) {
  let best = 0
  for (const [rowStep, colStep] of directions) {
    const total = 1
      + countDirection(sourceBoard, row, col, rowStep, colStep, side)
      + countDirection(sourceBoard, row, col, -rowStep, -colStep, side)
    best = Math.max(best, total)
  }
  return best
}

function countNearbyStones(sourceBoard, row, col, radius = 2) {
  let total = 0
  for (let rowOffset = -radius; rowOffset <= radius; rowOffset += 1) {
    for (let colOffset = -radius; colOffset <= radius; colOffset += 1) {
      if (rowOffset === 0 && colOffset === 0) {
        continue
      }
      const nextRow = row + rowOffset
      const nextCol = col + colOffset
      if (isInsideBoard(nextRow, nextCol) && sourceBoard[nextRow][nextCol]) {
        total += 1
      }
    }
  }
  return total
}

function getCandidateMoves(sourceBoard, radius = 2) {
  const moves = []
  let hasStone = false
  for (let row = 0; row < boardSize; row += 1) {
    for (let col = 0; col < boardSize; col += 1) {
      if (sourceBoard[row][col]) {
        hasStone = true
      }
    }
  }

  if (!hasStone) {
    return [{ row: Math.floor(boardSize / 2), col: Math.floor(boardSize / 2) }]
  }

  const visited = new Set()
  for (let row = 0; row < boardSize; row += 1) {
    for (let col = 0; col < boardSize; col += 1) {
      if (!sourceBoard[row][col]) {
        continue
      }

      for (let rowOffset = -radius; rowOffset <= radius; rowOffset += 1) {
        for (let colOffset = -radius; colOffset <= radius; colOffset += 1) {
          const nextRow = row + rowOffset
          const nextCol = col + colOffset
          const key = serializeMove(nextRow, nextCol)
          if (!isInsideBoard(nextRow, nextCol) || sourceBoard[nextRow][nextCol] || visited.has(key)) {
            continue
          }
          visited.add(key)
          moves.push({ row: nextRow, col: nextCol })
        }
      }
    }
  }

  return moves
}

function buildMoveTags(entry, side) {
  return entry.evaluation?.tags?.length ? entry.evaluation.tags : ['均衡']
}

function describeSuggestion(bestEntry, alternativeEntry, side) {
  if (bestEntry.evaluation?.analysis?.selfPattern?.maxLine >= 5) {
    return '这一步可以直接连成五子，立即结束对局。'
  }
  if (bestEntry.evaluation?.analysis?.blockedWins > 0) {
    return '这一步优先封堵对手的胜势。'
  }
  if ((bestEntry.reachedDepth || 0) >= 2) {
    return `引擎已向后推演 ${bestEntry.reachedDepth} 层，这一步在后续变化里依然最稳。`
  }
  if (!alternativeEntry) {
    return '当前它就是最直接有效的一手。'
  }
  if (bestEntry.score - alternativeEntry.score >= 2400) {
    return '相比其他候选，这一步更容易形成连续威胁。'
  }
  return bestEntry.evaluation?.summary || '这一步在进攻和防守之间更平衡。'
}

function createAudioContext() {
  const AudioCtor = window.AudioContext || window.webkitAudioContext
  return AudioCtor ? new AudioCtor() : null
}

function ensureAudioReady() {
  if (!soundEnabled.value) {
    return
  }
  if (!audioContext) {
    audioContext = createAudioContext()
    if (!audioContext) {
      audioDebugMessage.value = '当前浏览器不支持 Web Audio。'
      return
    }
    effectsGainNode = audioContext.createGain()
    effectsGainNode.gain.value = 0.54
    effectsGainNode.connect(audioContext.destination)
  }

  if (audioContext.state === 'suspended') {
    audioContext.resume()
  }
  audioReady.value = true
  audioDebugMessage.value = '音频已解锁。'
}

function playTone({ frequency, duration, volume, type = 'sine', delay = 0, attack = 0.002, sustain = 0.18 }) {
  if (!soundEnabled.value || !audioContext || !effectsGainNode) {
    return
  }
  const startAt = audioContext.currentTime + delay
  const endAt = startAt + duration
  const oscillator = audioContext.createOscillator()
  const gainNode = audioContext.createGain()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, startAt)
  gainNode.gain.setValueAtTime(0.0001, startAt)
  gainNode.gain.linearRampToValueAtTime(volume, startAt + attack)
  gainNode.gain.exponentialRampToValueAtTime(0.0001, endAt + duration * sustain)
  oscillator.connect(gainNode)
  gainNode.connect(effectsGainNode)
  oscillator.start(startAt)
  oscillator.stop(endAt + duration * sustain)
}

function playMoveSound(kind = 'move') {
  ensureAudioReady()
  const patterns = {
    move: [
      { frequency: 168, duration: 0.05, volume: 0.58, type: 'square' },
      { frequency: 102, duration: 0.08, volume: 0.26, type: 'triangle', delay: 0.005 },
    ],
    win: [
      { frequency: 440, duration: 0.12, volume: 0.22, type: 'triangle' },
      { frequency: 660, duration: 0.12, volume: 0.22, type: 'triangle', delay: 0.08 },
      { frequency: 880, duration: 0.18, volume: 0.24, type: 'sine', delay: 0.16 },
    ],
    select: [
      { frequency: 520, duration: 0.04, volume: 0.12, type: 'sine' },
    ],
  }

  for (const tone of patterns[kind] || patterns.move) {
    playTone(tone)
  }
}

function terminateEngineWorker() {
  if (engineWorker) {
    engineWorker.terminate()
    engineWorker = null
  }
}

function requestEngineAnalysis(payload) {
  terminateEngineWorker()
  engineWorker = new GomokuEngineWorker()
  const worker = engineWorker
  const safePayload = createEnginePayload(payload)
  return new Promise((resolve, reject) => {
    worker.onmessage = (event) => {
      if (engineWorker === worker) {
        engineWorker = null
      }
      if (event.data?.type === 'result') {
        resolve(event.data)
        return
      }
      reject(new Error(event.data?.message || 'worker error'))
    }

    worker.onerror = (event) => {
      if (engineWorker === worker) {
        engineWorker = null
      }
      reject(new Error(event.message || 'worker error'))
    }

    worker.postMessage(safePayload)
  })
}

function finalizeTurn(row, col, side) {
  if (hasFiveInRow(board.value, row, col, side)) {
    winner.value = side
    notice.value = `${sideLabels[side]}连成五子，赢下本局。`
    return
  }

  if (moveRecords.value.length >= boardSize * boardSize) {
    winner.value = 'draw'
    notice.value = '棋盘已满，本局和棋。'
    return
  }

  currentPlayer.value = oppositeSide(side)
  notice.value = `${sideLabels[currentPlayer.value]}继续行棋。`
}

function performMove(row, col, actor = 'human') {
  if (winner.value || board.value[row][col]) {
    return
  }

  const forbiddenReason = getForbiddenReason(board.value, { row, col }, currentPlayer.value)
  if (forbiddenReason) {
    notice.value = `${sideLabels[currentPlayer.value]}该点属于${forbiddenReason}，请改下别处。`
    return
  }

  historyStack.value.push(createSnapshot())
  board.value[row][col] = currentPlayer.value
  lastMove.value = { row, col }
  moveRecords.value.push({ row, col, side: currentPlayer.value, actor })
  const movedSide = currentPlayer.value
  finalizeTurn(row, col, movedSide)

  if (winner.value) {
    playMoveSound('win')
  } else {
    playMoveSound('move')
  }
}

function handleCellClick(row, col) {
  ensureAudioReady()
  if (winner.value) {
    return
  }
  if (aiThinking.value || isAiTurn.value) {
    notice.value = `${sideLabels[aiSide.value]}正在思考，请稍候。`
    return
  }
  if (board.value[row][col]) {
    notice.value = '该位置已有棋子，请选择空位。'
    return
  }
  playMoveSound('select')
  performMove(row, col)
}

function undoMove() {
  if (!historyStack.value.length) {
    notice.value = '当前没有可悔棋的着法。'
    return
  }

  let steps = 1
  const lastRecord = moveRecords.value[moveRecords.value.length - 1]
  if (aiEnabled.value && lastRecord?.side === aiSide.value && historyStack.value.length >= 2) {
    steps = 2
  }

  let snapshot = null
  while (steps > 0 && historyStack.value.length) {
    snapshot = historyStack.value.pop()
    steps -= 1
  }

  if (snapshot) {
    restoreSnapshot(snapshot)
    notice.value = aiEnabled.value ? '已悔棋并回退到你的上一手。' : '已悔棋。'
  }
}

function resetGame() {
  terminateEngineWorker()
  board.value = createEmptyBoard()
  currentPlayer.value = 'black'
  winner.value = ''
  notice.value = '黑方先行，点击棋盘落子。'
  lastMove.value = null
  moveRecords.value = []
  historyStack.value = []
  aiThinking.value = false
  aiSuggestion.value = null
  suggestedMove.value = null
  suggestedIndex.value = 0
  winnerOverlayTransparent.value = false
}

function restartCurrentGame() {
  resetGame()
}

function resignGame() {
  if (winner.value) {
    return
  }
  winner.value = oppositeSide(currentPlayer.value)
  notice.value = `${sideLabels[currentPlayer.value]}认输，${sideLabels[winner.value]}获胜。`
  playMoveSound('win')
}

function exportRecord() {
  const lines = [
    '五子棋对局记录',
    `模式: ${modeOptions.find((item) => item.value === gameMode.value)?.label || gameMode.value}`,
    `规则: ${ruleOptions.find((item) => item.value === ruleMode.value)?.label || ruleMode.value}`,
    `结果: ${winner.value ? (winner.value === 'draw' ? '和棋' : `${sideLabels[winner.value]}胜`) : '进行中'}`,
    '',
    '落子记录:',
  ]

  if (!moveRecords.value.length) {
    lines.push('暂无落子')
  } else {
    moveRecords.value.forEach((move, index) => {
      lines.push(`${index + 1}. ${sideLabels[move.side]} -> ${buildMoveText(move.row, move.col)}`)
    })
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `gomoku-${Date.now()}.txt`
  link.click()
  URL.revokeObjectURL(url)
  notice.value = '棋谱已导出。'
}

async function requestAiSuggestion() {
  if (suggestionLoading.value) {
    suggestionLoading.value = false
    suggestionAbortHint.value = false
    if (suggestionTimer) {
      window.clearTimeout(suggestionTimer)
      suggestionTimer = null
    }
    terminateEngineWorker()
    notice.value = '已取消本次推荐。'
    return
  }

  if (suggestionButtonDisabledReason.value) {
    notice.value = suggestionButtonDisabledReason.value
    return
  }

  suggestionLoading.value = true
  suggestionAbortHint.value = false
  const myTaskId = ++suggestionTaskId.value
  suggestionTimer = window.setTimeout(async () => {
    if (myTaskId !== suggestionTaskId.value) {
      return
    }
    const config = suggestionStrengthConfig[suggestionStrength.value] || suggestionStrengthConfig.deep
    let entries = []
    let timedOut = false
    try {
      const result = await requestEngineAnalysis({
        board: board.value,
        side: currentPlayer.value,
        limit: 3,
        radius: config.radius,
        rootBreadth: config.rootBreadth,
        searchBreadth: config.searchBreadth,
        searchDepth: config.searchDepth,
        maxSearchMs: config.maxSearchMs,
        style: suggestionStyle.value,
        forbiddenRulesActive: forbiddenRulesActive.value,
      })
      if (myTaskId !== suggestionTaskId.value) {
        return
      }
      entries = result.moves || []
      timedOut = Boolean(result.timedOut)
    } catch (error) {
      if (myTaskId !== suggestionTaskId.value) {
        return
      }
      suggestionLoading.value = false
      suggestionAbortHint.value = false
      notice.value = `推荐计算失败：${String(error?.message || error)}`
      return
    }

    suggestionLoading.value = false
    if (!entries.length) {
      notice.value = forbiddenRulesActive.value ? '当前局面下没有符合禁手规则的推荐着法。' : '当前局面没有可用推荐着法。'
      return
    }
    const [bestEntry, alternativeEntry] = entries
    suggestedIndex.value = 0
    suggestedMove.value = { ...bestEntry.move }
    aiSuggestion.value = {
      moveText: `${buildMoveText(bestEntry.move.row, bestEntry.move.col)}`,
      tags: buildMoveTags(bestEntry, currentPlayer.value),
      summary: describeSuggestion(bestEntry, alternativeEntry, currentPlayer.value),
      compareText: alternativeEntry
        ? `比备选 ${buildMoveText(alternativeEntry.move.row, alternativeEntry.move.col)} 更适合当前局面。`
        : '当前它就是最直接有效的一手。',
      candidates: entries.map((entry, index) => ({
        rank: index + 1,
        text: buildMoveText(entry.move.row, entry.move.col),
        tags: buildMoveTags(entry, currentPlayer.value),
        scoreGap: Math.max(0, Math.round(bestEntry.score - entry.score)),
        summary: entry.evaluation?.summary || '兼顾当前局面的攻守平衡。',
        row: entry.move.row,
        col: entry.move.col,
      })),
    }
    notice.value = timedOut ? '已生成智能推荐，当前为限时搜索结果。' : '已生成智能推荐。'
  }, 180)
}

function cycleAiSuggestion() {
  if (!aiSuggestion.value?.candidates?.length) {
    notice.value = '请先请求智能推荐。'
    return
  }
  const nextIndex = (suggestedIndex.value + 1) % aiSuggestion.value.candidates.length
  applySuggestionCandidate(nextIndex)
}

function applySuggestionCandidate(index) {
  if (!aiSuggestion.value?.candidates?.[index]) {
    return
  }
  const item = aiSuggestion.value.candidates[index]
  suggestedIndex.value = index
  suggestedMove.value = {
    row: item.row,
    col: item.col,
  }
  notice.value = `已切换到第 ${item.rank} 个推荐。`
}

function playSuggestedMove() {
  if (!suggestedMove.value) {
    notice.value = '请先请求智能推荐。'
    return
  }
  if (winner.value || isAiTurn.value || aiThinking.value || board.value[suggestedMove.value.row][suggestedMove.value.col]) {
    notice.value = '当前状态下不能直接应用推荐着法。'
    return
  }
  const forbiddenReason = getForbiddenReason(board.value, suggestedMove.value, currentPlayer.value)
  if (forbiddenReason) {
    notice.value = `当前推荐点已变为${forbiddenReason}，请重新请求推荐。`
    return
  }
  performMove(suggestedMove.value.row, suggestedMove.value.col)
}

function toggleWinnerOverlayTransparency() {
  if (!winner.value) {
    return
  }
  winnerOverlayTransparent.value = !winnerOverlayTransparent.value
}

function toggleSound() {
  soundEnabled.value = !soundEnabled.value
  if (!soundEnabled.value) {
    audioDebugMessage.value = '音效已关闭。'
  }
}

function runAudioDiagnostics() {
  ensureAudioReady()
  playMoveSound('move')
  audioDebugMessage.value = '已播放测试音。'
}

function saveSettings() {
  localStorage.setItem(settingsStorageKey, JSON.stringify({
    gameMode: gameMode.value,
    aiSide: aiSide.value,
    aiDifficulty: aiDifficulty.value,
    suggestionStrength: suggestionStrength.value,
    suggestionStyle: suggestionStyle.value,
    ruleMode: ruleMode.value,
    forbiddenMoveEnabled: forbiddenMoveEnabled.value,
    soundEnabled: soundEnabled.value,
  }))
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(settingsStorageKey)
    if (!raw) {
      return
    }
    const saved = JSON.parse(raw)
    if (saved.gameMode === 'human-vs-human' || saved.gameMode === 'human-vs-ai') {
      gameMode.value = saved.gameMode
    }
    if (saved.aiSide === 'black' || saved.aiSide === 'white') {
      aiSide.value = saved.aiSide
    }
    if (saved.aiDifficulty in aiDifficultyConfig) {
      aiDifficulty.value = saved.aiDifficulty
    }
    if (saved.suggestionStrength in suggestionStrengthConfig) {
      suggestionStrength.value = saved.suggestionStrength
    }
    if (saved.suggestionStyle === 'balanced' || saved.suggestionStyle === 'aggressive' || saved.suggestionStyle === 'defensive') {
      suggestionStyle.value = saved.suggestionStyle
    }
    if (saved.ruleMode === 'freestyle' || saved.ruleMode === 'standard') {
      ruleMode.value = saved.ruleMode
    }
    if (typeof saved.forbiddenMoveEnabled === 'boolean') {
      forbiddenMoveEnabled.value = saved.forbiddenMoveEnabled
    }
    if (typeof saved.soundEnabled === 'boolean') {
      soundEnabled.value = saved.soundEnabled
    }
  } catch {
    // ignore invalid local settings
  }
}

function saveGameState() {
  localStorage.setItem(gameStorageKey, JSON.stringify({
    gameMode: gameMode.value,
    aiSide: aiSide.value,
    aiDifficulty: aiDifficulty.value,
    suggestionStrength: suggestionStrength.value,
    suggestionStyle: suggestionStyle.value,
    ruleMode: ruleMode.value,
    forbiddenMoveEnabled: forbiddenMoveEnabled.value,
    board: board.value,
    currentPlayer: currentPlayer.value,
    winner: winner.value,
    notice: notice.value,
    lastMove: lastMove.value,
    moveRecords: moveRecords.value,
    historyStack: historyStack.value,
  }))
}

function loadGameState() {
  try {
    const raw = localStorage.getItem(gameStorageKey)
    if (!raw) {
      return
    }
    const saved = JSON.parse(raw)
    if (saved.gameMode === 'human-vs-human' || saved.gameMode === 'human-vs-ai') {
      gameMode.value = saved.gameMode
    }
    if (saved.aiSide === 'black' || saved.aiSide === 'white') {
      aiSide.value = saved.aiSide
    }
    if (saved.aiDifficulty in aiDifficultyConfig) {
      aiDifficulty.value = saved.aiDifficulty
    }
    if (saved.suggestionStrength in suggestionStrengthConfig) {
      suggestionStrength.value = saved.suggestionStrength
    }
    if (saved.suggestionStyle === 'balanced' || saved.suggestionStyle === 'aggressive' || saved.suggestionStyle === 'defensive') {
      suggestionStyle.value = saved.suggestionStyle
    }
    if (saved.ruleMode === 'freestyle' || saved.ruleMode === 'standard') {
      ruleMode.value = saved.ruleMode
    }
    if (typeof saved.forbiddenMoveEnabled === 'boolean') {
      forbiddenMoveEnabled.value = saved.forbiddenMoveEnabled
    }
    if (Array.isArray(saved.board) && saved.board.length === boardSize) {
      board.value = saved.board.map((row) => [...row])
    }
    currentPlayer.value = saved.currentPlayer === 'white' ? 'white' : 'black'
    winner.value = saved.winner || ''
    notice.value = saved.notice || notice.value
    lastMove.value = saved.lastMove || null
    moveRecords.value = Array.isArray(saved.moveRecords) ? saved.moveRecords.map((move) => ({ ...move })) : []
    historyStack.value = Array.isArray(saved.historyStack)
      ? saved.historyStack.map((snapshot) => ({
          ...snapshot,
          board: snapshot.board.map((row) => [...row]),
          lastMove: snapshot.lastMove ? { ...snapshot.lastMove } : null,
          moveRecords: Array.isArray(snapshot.moveRecords) ? snapshot.moveRecords.map((move) => ({ ...move })) : [],
        }))
      : []
  } catch {
    resetGame()
  }
}

watch(
  () => [gameMode.value, aiSide.value, aiDifficulty.value, suggestionStrength.value, suggestionStyle.value, ruleMode.value, forbiddenMoveEnabled.value, soundEnabled.value],
  () => {
    saveSettings()
  },
)

watch(
  () => [board.value, currentPlayer.value, winner.value, notice.value, lastMove.value, moveRecords.value, historyStack.value, gameMode.value, aiSide.value, aiDifficulty.value, suggestionStrength.value, suggestionStyle.value, ruleMode.value, forbiddenMoveEnabled.value],
  () => {
    saveGameState()
  },
  { deep: true },
)

watch(ruleMode, (nextMode) => {
  if (nextMode !== 'standard' && forbiddenMoveEnabled.value) {
    forbiddenMoveEnabled.value = false
  }
})

watch(isAiTurn, (nextTurn) => {
  if (!nextTurn || winner.value) {
    aiThinking.value = false
    if (aiTimer) {
      window.clearTimeout(aiTimer)
      aiTimer = null
    }
    terminateEngineWorker()
    return
  }

  aiThinking.value = true
  notice.value = `${sideLabels[aiSide.value]}正在以${currentAiDifficultyLabel.value}难度思考...`
  aiTimer = window.setTimeout(async () => {
    const config = currentAiConfig.value
    let move = null
    let timedOut = false
    try {
      const result = await requestEngineAnalysis({
        board: board.value,
        side: aiSide.value,
        limit: Math.max(config.randomTop, 1),
        radius: config.radius,
        rootBreadth: config.rootBreadth,
        searchBreadth: config.searchBreadth,
        searchDepth: config.searchDepth,
        maxSearchMs: config.maxSearchMs,
        style: suggestionStyle.value,
        forbiddenRulesActive: forbiddenRulesActive.value,
      })
      move = result.moves?.[0]?.move || null
      timedOut = Boolean(result.timedOut)
    } catch (error) {
      aiThinking.value = false
      aiTimer = null
      notice.value = `AI 计算失败：${String(error?.message || error)}`
      return
    }

    aiThinking.value = false
    aiTimer = null
    if (!move) {
      notice.value = `${sideLabels[aiSide.value]}当前无可用落子。`
      return
    }
    if (timedOut) {
      notice.value = `${sideLabels[aiSide.value]}给出了限时搜索下的最优着法。`
    }
    performMove(move.row, move.col, 'ai')
  }, currentAiConfig.value.delay)
}, { immediate: true })

loadSettings()
loadGameState()
</script>

<template>
  <main class="gomoku-page">
    <section class="gomoku-shell">
      <header class="gomoku-hero">
        <div>
          <p class="eyebrow">Gomoku</p>
          <h1>五子棋游戏页</h1>
          <p class="intro">按象棋页的完整体验补齐：支持独立路由、人机对战、胜利弹层、智能推荐、悔棋、棋谱导出和更完整的对局反馈。</p>
        </div>
        <div class="hero-actions">
          <RouterLink class="back-link" to="/">返回看板</RouterLink>
          <button class="accent-button" type="button" @click="resetGame">按当前配置开局</button>
        </div>
      </header>

      <section class="gomoku-layout">
        <div class="board-panel">
          <div class="status-strip" :class="{ success: winner }">
            <strong>{{ winner ? (winner === 'draw' ? '和棋' : `${sideLabels[winner]}获胜`) : `${sideLabels[currentPlayer]}回合` }}</strong>
            <span>{{ notice }}</span>
          </div>

          <div class="board-meta">
            <span>模式：{{ modeOptions.find((item) => item.value === gameMode)?.label }}</span>
            <span>当前手数：{{ moveCount }}</span>
            <span v-if="aiEnabled">AI 执子：{{ sideLabels[aiSide] }}</span>
            <span v-if="aiEnabled">AI 难度：{{ currentAiDifficultyLabel }}</span>
          </div>

          <div class="gomoku-board-scroll">
            <div class="gomoku-board-wrap" :class="{ 'transparent-finish': winnerOverlayTransparent && winner }">
              <div v-if="winner" class="winner-overlay" :class="[{ transparent: winnerOverlayTransparent }, winner === 'draw' ? 'winner-draw' : `winner-${winner}`]">
                <span
                  v-for="(burst, index) in winnerBurstOffsets"
                  :key="`winner-burst-${index}`"
                  class="winner-burst"
                  :style="{ '--burst-x': burst.x, '--burst-y': burst.y, '--burst-delay': burst.delay }"
                ></span>
                <div class="winner-card">
                  <p class="winner-label">对局结束</p>
                  <div class="winner-headline">{{ winnerOverlayHeadline }}</div>
                  <h2>{{ winnerOverlayTitle }}</h2>
                  <p>{{ winnerOverlaySubtitle }}</p>
                  <div class="winner-overlay-actions">
                    <button class="winner-visibility-button" type="button" @click="toggleWinnerOverlayTransparency">
                      {{ winnerOverlayTransparent ? '恢复遮罩' : '看棋盘' }}
                    </button>
                  </div>
                  <div class="winner-button-wrap">
                    <span class="winner-button-beam top" aria-hidden="true"></span>
                    <span class="winner-button-beam bottom" aria-hidden="true"></span>
                    <button class="winner-restart-button" type="button" @click="restartCurrentGame">再开一局</button>
                  </div>
                </div>
              </div>

              <div v-if="aiThinking && aiEnabled" class="thinking-banner floating-thinking-banner" :class="`difficulty-${aiDifficulty}`">
                <span class="thinking-dots" aria-hidden="true">
                  <i></i>
                  <i></i>
                  <i></i>
                </span>
                <strong>{{ sideLabels[aiSide] }} AI 正在以{{ currentAiDifficultyLabel }}难度计算落子</strong>
              </div>

              <div class="gomoku-board">
                <div v-for="row in boardRows" :key="`row-${row}`" class="gomoku-row">
                  <button
                    v-for="col in boardCols"
                    :key="`cell-${row}-${col}`"
                    class="gomoku-cell"
                    :class="{
                      occupied: Boolean(board[row][col]),
                      last: lastMove?.row === row && lastMove?.col === col,
                      suggested: suggestedMove?.row === row && suggestedMove?.col === col,
                    }"
                    type="button"
                    @click="handleCellClick(row, col)"
                  >
                    <span v-if="board[row][col]" class="stone" :class="board[row][col]"></span>
                    <span v-else-if="suggestedMove?.row === row && suggestedMove?.col === col" class="suggestion-dot"></span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <aside class="side-panel">
          <article class="info-card controls-card">
            <h2>对局设置</h2>
            <label class="control-field">
              <span>模式</span>
              <select v-model="gameMode" class="control-select">
                <option v-for="option in modeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>

            <label class="control-field" :class="{ disabled: !aiEnabled }">
              <span>AI 执子</span>
              <select v-model="aiSide" class="control-select" :disabled="!aiEnabled">
                <option v-for="option in aiSideOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>

            <label class="control-field" :class="{ disabled: !aiEnabled }">
              <span>AI 难度</span>
              <select v-model="aiDifficulty" class="control-select" :disabled="!aiEnabled">
                <option v-for="option in aiDifficultyOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>

            <label class="control-field">
              <span>推荐强度</span>
              <select v-model="suggestionStrength" class="control-select">
                <option v-for="option in suggestionStrengthOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>

            <label class="control-field">
              <span>推荐风格</span>
              <select v-model="suggestionStyle" class="control-select">
                <option v-for="option in suggestionStyleOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>

            <label class="control-field">
              <span>规则模式</span>
              <select v-model="ruleMode" class="control-select" :disabled="forbiddenToggleLocked">
                <option v-for="option in ruleOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>

            <div class="control-field">
              <span>禁手规则</span>
              <button class="panel-button" :class="{ active: forbiddenRulesActive, disabled: ruleMode !== 'standard' || forbiddenToggleLocked }" type="button" :disabled="ruleMode !== 'standard' || forbiddenToggleLocked" @click="forbiddenMoveEnabled = !forbiddenMoveEnabled">
                {{ forbiddenRulesActive ? '已启用黑方禁手' : '禁手关闭' }}
              </button>
              <p class="audio-tip">{{ forbiddenToggleLocked ? '开局后规则已锁定，本局结束前不能再修改。' : (ruleMode === 'standard' ? '启用后黑方会判定长连、双三、双四，推荐和 AI 也会自动避开。' : '切到标准五子后可启用禁手。') }}</p>
            </div>

            <div class="action-grid controls-main-actions">
              <button class="panel-button primary" type="button" @click="resetGame">重新开局</button>
              <button class="panel-button" type="button" @click="undoMove">悔棋</button>
              <button class="panel-button" type="button" @click="exportRecord">导出棋谱</button>
            </div>

            <div class="action-grid utility-grid">
              <button class="panel-button warn" type="button" @click="resignGame">认输</button>
              <button class="panel-button" type="button" @click="restartCurrentGame">重开本局</button>
            </div>

            <div class="action-grid suggestion-action-grid">
              <button
                class="panel-button hint"
                :class="{ loading: suggestionLoading, abortable: suggestionLoading && suggestionAbortHint, disabled: !suggestionLoading && Boolean(suggestionButtonDisabledReason) }"
                type="button"
                :disabled="!suggestionLoading && Boolean(suggestionButtonDisabledReason)"
                @mouseenter="suggestionAbortHint = suggestionLoading"
                @mouseleave="suggestionAbortHint = false"
                @click="requestAiSuggestion"
              >
                <span v-if="suggestionLoading" class="button-spinner" aria-hidden="true"></span>
                {{ suggestionButtonLabel }}
              </button>
              <button class="panel-button hint" type="button" :disabled="suggestionLoading || Boolean(suggestionButtonDisabledReason)" @click="playSuggestedMove">
                下推荐棋
              </button>
            </div>

            <p v-if="suggestionLoading" class="audio-tip suggestion-loading-tip">推荐计算中，点击按钮可取消。</p>
            <p v-else-if="suggestionButtonDisabledReason" class="audio-tip suggestion-disabled-tip">{{ suggestionButtonDisabledReason }}</p>

            <div class="action-grid audio-grid">
              <button class="panel-button" :class="{ active: soundEnabled }" type="button" @click="toggleSound">
                {{ soundEnabled ? '关闭音效' : '开启音效' }}
              </button>
              <button class="panel-button" type="button" @click="runAudioDiagnostics">播放测试音</button>
            </div>

            <p class="audio-tip">浏览器需要首次交互后才能发声。</p>
            <p class="audio-tip">音频状态：{{ audioStateLabel }}</p>
            <p class="audio-tip">调试信息：{{ audioDebugMessage }}</p>
          </article>

          <article v-if="aiSuggestion" class="info-card suggestion-card">
            <h2>智能推荐</h2>
            <p class="suggestion-note">当前推荐会结合威胁手筛选、迭代加深搜索、封堵急所与禁手规则综合分析。</p>
            <p><strong>建议：</strong>{{ aiSuggestion.moveText }}</p>
            <div class="suggestion-tags">
              <span v-for="tag in aiSuggestion.tags" :key="tag" class="suggestion-tag">{{ tag }}</span>
            </div>
            <p><strong>原因：</strong>{{ aiSuggestion.summary }}</p>
            <p><strong>对比：</strong>{{ aiSuggestion.compareText }}</p>
            <div class="action-grid utility-grid">
              <button class="panel-button hint" type="button" @click="cycleAiSuggestion">切换下一推荐</button>
              <button class="panel-button hint" type="button" @click="playSuggestedMove">按当前推荐走</button>
            </div>

            <div class="candidate-list">
              <p class="candidate-title">前三候选</p>
              <button v-for="(item, index) in aiSuggestion.candidates" :key="`${item.rank}-${item.text}`" type="button" class="candidate-item" :class="{ active: index === suggestedIndex }" @click="applySuggestionCandidate(index)">
                <strong>#{{ item.rank }}</strong>
                <span>{{ item.text }}</span>
                <small class="candidate-gap">{{ item.scoreGap === 0 ? '当前最佳' : `比最佳低约 ${item.scoreGap} 分` }}</small>
                <small class="candidate-gap">{{ item.summary }}</small>
                <div class="suggestion-tags compact-tags">
                  <span v-for="tag in item.tags" :key="`${item.rank}-${tag}`" class="suggestion-tag">{{ tag }}</span>
                </div>
              </button>
            </div>
          </article>

          <article class="info-card">
            <h2>对局信息</h2>
            <p>当前执子：{{ sideLabels[currentPlayer] }}</p>
            <p>终局状态：{{ winner ? (winner === 'draw' ? '和棋' : `${sideLabels[winner]}胜`) : '进行中' }}</p>
            <p v-if="aiEnabled">AI 难度：{{ currentAiDifficultyLabel }}</p>
            <p>推荐说明：当前推荐会使用职业引擎风格的威胁优先搜索，而不只是单步打分。</p>
            <p>玩法说明：黑方先手，先连成五子者获胜；人机对战时 AI 会自动响应。</p>
          </article>

          <article class="info-card">
            <h2>规则支持</h2>
            <p>1. 提供自由连珠和标准五子两种规则模式。</p>
            <p>2. 标准五子下可单独开启黑方禁手，落子、AI 与推荐都会同步遵守。</p>
            <p>3. 页面刷新后会恢复当前棋盘、手数和历史落子。</p>
          </article>

          <article class="info-card move-card">
            <h2>最近落子</h2>
            <p v-if="!recentMoves.length" class="muted">还没有落子。</p>
            <ul v-else class="move-list">
              <li v-for="(move, index) in recentMoves" :key="`${index}-${move.row}-${move.col}-${move.side}`">
                <span>{{ sideLabels[move.side] }}：</span>
                <strong>{{ buildMoveText(move.row, move.col) }}</strong>
              </li>
            </ul>
          </article>
        </aside>
      </section>
    </section>
  </main>
</template>

<style scoped>
.gomoku-page {
  min-height: 100vh;
  padding: 24px;
  background:
    radial-gradient(circle at top left, rgba(180, 83, 9, 0.2), transparent 24%),
    linear-gradient(180deg, #fbf0da 0%, #eed8b0 100%);
}

.gomoku-shell {
  max-width: 1480px;
  margin: 0 auto;
}

.gomoku-hero {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: flex-end;
}

.eyebrow {
  margin: 0;
  color: #9a3412;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.gomoku-hero h1 {
  margin: 8px 0 0;
  font-size: clamp(32px, 4.2vw, 50px);
  color: #7c2d12;
}

.intro {
  max-width: 760px;
  margin: 12px 0 0;
  color: #8a6640;
  line-height: 1.6;
}

.hero-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.back-link,
.accent-button,
.accent-link,
.panel-button,
.winner-restart-button,
.winner-visibility-button,
.candidate-item {
  border: 0;
  border-radius: 14px;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 180ms ease, box-shadow 180ms ease, opacity 180ms ease;
}

.back-link,
.accent-link {
  padding: 12px 18px;
}

.back-link {
  background: rgba(255, 255, 255, 0.78);
  color: #9a3412;
}

.accent-button,
.accent-link,
.winner-restart-button {
  padding: 12px 18px;
  background: linear-gradient(135deg, #b45309, #dc2626);
  color: #fff7ed;
  box-shadow: 0 18px 34px rgba(180, 83, 9, 0.24);
}

.gomoku-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 28px;
  margin-top: 28px;
}

.board-panel,
.info-card {
  background: rgba(255, 252, 247, 0.88);
  border: 1px solid rgba(146, 64, 14, 0.12);
  border-radius: 24px;
  box-shadow: 0 20px 50px rgba(120, 53, 15, 0.08);
}

.board-panel {
  padding: 22px;
  display: flex;
  flex-direction: column;
}

.status-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(180, 83, 9, 0.08);
}

.status-strip.success {
  background: rgba(22, 163, 74, 0.12);
}

.board-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 14px;
  color: #8a6640;
  font-size: 14px;
}

.gomoku-board-scroll {
  margin-top: 18px;
  overflow: auto;
  display: flex;
  justify-content: center;
}

.gomoku-board-wrap {
  position: relative;
  width: min(100%, 980px);
  min-width: 720px;
  min-height: min(78vh, 980px);
  padding: 18px;
  border-radius: 28px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0)),
    linear-gradient(180deg, #ddb26f 0%, #cf9042 100%);
  box-shadow: inset 0 0 0 2px rgba(120, 53, 15, 0.18), inset 0 0 40px rgba(92, 47, 16, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
}

.winner-overlay {
  position: absolute;
  inset: 16px;
  z-index: 11;
  border-radius: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: radial-gradient(circle at center, rgba(255, 251, 235, 0.72), rgba(120, 53, 15, 0.18));
  backdrop-filter: blur(10px);
  animation: winnerOverlayFadeIn 320ms ease-out;
  transition: background 280ms ease, backdrop-filter 280ms ease;
}

.winner-overlay.transparent {
  background: radial-gradient(circle at center, rgba(255, 251, 235, 0.015), rgba(120, 53, 15, 0.006));
  backdrop-filter: blur(0px);
}

.winner-overlay.transparent .winner-burst,
.winner-overlay.transparent .winner-button-wrap::before,
.winner-overlay.transparent .winner-button-beam {
  opacity: 0.08 !important;
}

.winner-overlay.transparent .winner-card {
  background: rgba(255, 252, 248, 0.12) !important;
  box-shadow: 0 2px 8px rgba(63, 42, 20, 0.05) !important;
  backdrop-filter: blur(0px);
  border: 1px solid rgba(255, 255, 255, 0.18);
  min-width: 0;
  width: min(280px, 42vw);
  padding: 16px 16px 14px;
  border-radius: 18px;
  transform: translate(188px, -178px) scale(0.64);
}

.winner-overlay.transparent .winner-label {
  margin-bottom: 4px;
  font-size: 11px;
  opacity: 0.72;
}

.winner-overlay.transparent .winner-headline {
  font-size: clamp(24px, 3vw, 34px);
  letter-spacing: 0.06em;
  opacity: 0.82;
}

.winner-overlay.transparent .winner-card h2,
.winner-overlay.transparent .winner-card p {
  opacity: 0;
  height: 0;
  overflow: hidden;
  margin-bottom: 0;
}

.winner-overlay.transparent .winner-overlay-actions,
.winner-overlay.transparent .winner-button-wrap {
  margin-top: 10px;
}

.winner-overlay.transparent .winner-restart-button,
.winner-overlay.transparent .winner-visibility-button {
  padding: 9px 14px;
  font-size: 13px;
}

.winner-overlay.winner-black {
  color: #111827;
}

.winner-overlay.winner-white,
.winner-overlay.winner-draw {
  color: #7c2d12;
}

.winner-burst {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 18px;
  height: 18px;
  margin-left: -9px;
  margin-top: -9px;
  border-radius: 999px;
  background: currentColor;
  opacity: 0;
  filter: blur(0.2px);
  animation: winnerBurstOrbit 1.2s ease-out forwards;
  animation-delay: var(--burst-delay);
  pointer-events: none;
}

.winner-card {
  position: relative;
  z-index: 2;
  min-width: 260px;
  padding: 28px 26px 24px;
  border-radius: 28px;
  text-align: center;
  background: linear-gradient(180deg, rgba(255, 252, 248, 0.96), rgba(240, 234, 226, 0.94));
  box-shadow: 0 24px 60px rgba(120, 53, 15, 0.18);
  animation: winnerCardRise 420ms cubic-bezier(0.22, 1, 0.36, 1);
  transition: transform 680ms cubic-bezier(0.16, 0.92, 0.18, 1), width 360ms ease, padding 360ms ease, border-radius 360ms ease, background 260ms ease, box-shadow 260ms ease;
}

.winner-label {
  margin: 0 0 8px;
  font-size: 12px;
  letter-spacing: 0.18em;
  font-weight: 800;
  color: #b45309;
  transition: opacity 220ms ease, transform 220ms ease;
}

.winner-headline {
  font-size: clamp(42px, 6vw, 72px);
  line-height: 0.95;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-shadow: 0 6px 18px rgba(120, 53, 15, 0.16);
  -webkit-text-stroke: 1px rgba(255, 251, 235, 0.72);
  transition: opacity 220ms ease, transform 220ms ease, font-size 220ms ease;
}

.winner-card h2 {
  margin: 8px 0 0;
  font-size: clamp(24px, 2.4vw, 30px);
  line-height: 1.1;
  transition: opacity 220ms ease, transform 220ms ease, font-size 220ms ease;
}

.winner-card p {
  margin: 10px 0 0;
  color: #7c5731;
  transition: opacity 220ms ease, transform 220ms ease, font-size 220ms ease;
}

.winner-overlay-actions {
  margin-top: 14px;
}

.winner-visibility-button {
  position: relative;
  z-index: 3;
  padding: 8px 14px;
  background: rgba(255, 255, 255, 0.72);
  color: #7c2d12;
  font-weight: 700;
  box-shadow: inset 0 0 0 1px rgba(180, 83, 9, 0.16);
}

.winner-button-wrap {
  position: relative;
  margin-top: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.winner-button-wrap::before {
  content: '';
  position: absolute;
  width: 168px;
  height: 168px;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(251, 191, 36, 0.28), rgba(251, 191, 36, 0));
  animation: winnerButtonAura 1.4s ease-out both;
  pointer-events: none;
}

.winner-button-beam {
  position: absolute;
  left: 50%;
  width: 180px;
  height: 2px;
  margin-left: -90px;
  background: linear-gradient(90deg, rgba(251, 191, 36, 0), rgba(251, 191, 36, 0.9), rgba(251, 191, 36, 0));
  opacity: 0;
  animation: winnerBeamGather 0.9s ease-out both;
  pointer-events: none;
}

.winner-button-beam.top {
  top: 18px;
}

.winner-button-beam.bottom {
  bottom: 18px;
  animation-delay: 0.08s;
}

.winner-restart-button {
  position: relative;
  z-index: 3;
}

.thinking-banner {
  padding: 12px 16px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 18px 36px rgba(59, 130, 246, 0.14);
  color: #1d4ed8;
}

.floating-thinking-banner {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 10;
  pointer-events: none;
}

.thinking-dots {
  display: inline-flex;
  gap: 4px;
  margin-right: 8px;
}

.thinking-dots i {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: currentColor;
  animation: thinkingPulse 1s ease-in-out infinite;
}

.thinking-dots i:nth-child(2) {
  animation-delay: 0.12s;
}

.thinking-dots i:nth-child(3) {
  animation-delay: 0.24s;
}

.gomoku-board {
  width: fit-content;
  max-width: 100%;
  padding: clamp(16px, 2vw, 24px);
  border-radius: 24px;
  background: linear-gradient(180deg, #ddb26f 0%, #cf9042 100%);
  box-shadow: inset 0 0 0 2px rgba(120, 53, 15, 0.18);
}

.gomoku-row {
  display: flex;
}

.gomoku-cell {
  width: clamp(38px, 3vw, 48px);
  height: clamp(38px, 3vw, 48px);
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  position: relative;
  cursor: pointer;
}

.gomoku-cell::before,
.gomoku-cell::after {
  content: '';
  position: absolute;
  background: rgba(120, 53, 15, 0.42);
}

.gomoku-cell::before {
  left: 50%;
  top: 0;
  width: 1px;
  height: 100%;
  transform: translateX(-50%);
}

.gomoku-cell::after {
  top: 50%;
  left: 0;
  height: 1px;
  width: 100%;
  transform: translateY(-50%);
}

.stone {
  position: absolute;
  left: 50%;
  top: 50%;
  width: clamp(26px, 2.05vw, 34px);
  height: clamp(26px, 2.05vw, 34px);
  border-radius: 999px;
  transform: translate(-50%, -50%);
  z-index: 1;
}

.stone.black {
  background: radial-gradient(circle at 30% 30%, #5b5b5b, #111827 70%);
}

.stone.white {
  background: radial-gradient(circle at 30% 30%, #ffffff, #d1d5db 78%);
  box-shadow: inset 0 0 0 1px rgba(17, 24, 39, 0.12);
}

.gomoku-cell.last .stone {
  box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.48);
}

.gomoku-cell.suggested::after {
  height: 14px;
  width: 14px;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.74);
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 1;
}

.suggestion-dot {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.8);
  transform: translate(-50%, -50%);
  z-index: 1;
}

.side-panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.info-card {
  padding: 20px;
}

.info-card h2 {
  margin: 0;
}

.control-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 14px;
}

.control-field.disabled {
  opacity: 0.56;
}

.control-select {
  border: 1px solid rgba(146, 64, 14, 0.16);
  padding: 10px 12px;
  border-radius: 14px;
  background: #fff;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 16px;
}

.controls-main-actions .panel-button:last-child {
  grid-column: 1 / -1;
}

.utility-grid .panel-button:last-child,
.audio-grid .panel-button:last-child {
  grid-column: auto;
}

.panel-button {
  padding: 11px 16px;
  background: rgba(180, 83, 9, 0.1);
  color: #8a4b12;
  font-weight: 700;
}

.panel-button.primary {
  background: linear-gradient(135deg, #b45309, #dc2626);
  color: #fff7ed;
}

.panel-button.warn {
  background: rgba(220, 38, 38, 0.12);
  color: #b91c1c;
}

.panel-button.warn-soft {
  background: rgba(120, 53, 15, 0.08);
  color: #92400e;
}

.panel-button.hint {
  position: relative;
  z-index: 1;
  background: rgba(59, 130, 246, 0.12);
  color: #1d4ed8;
}

.panel-button.loading {
  background: rgba(37, 99, 235, 0.18);
  color: #1d4ed8;
}

.panel-button.active {
  background: linear-gradient(135deg, rgba(180, 83, 9, 0.92), rgba(220, 38, 38, 0.88));
  color: #fff7ed;
}

.panel-button.disabled {
  opacity: 0.52;
  cursor: not-allowed;
}

.suggestion-action-grid {
  grid-template-columns: minmax(0, 1.3fr) minmax(132px, 0.7fr);
}

.panel-button.abortable {
  background: rgba(220, 38, 38, 0.14);
  color: #b91c1c;
}

.button-spinner {
  width: 14px;
  height: 14px;
  margin-right: 8px;
  border: 2px solid rgba(29, 78, 216, 0.22);
  border-top-color: currentColor;
  border-radius: 999px;
  display: inline-block;
  vertical-align: -2px;
  animation: buttonSpin 0.72s linear infinite;
}

.audio-tip {
  margin: 0;
  color: #8a6640;
  font-size: 13px;
}

.suggestion-loading-tip {
  color: #1d4ed8;
  font-weight: 700;
}

.suggestion-disabled-tip {
  color: #9a3412;
  font-weight: 700;
}

.suggestion-card {
  border-color: rgba(59, 130, 246, 0.18);
  background: rgba(239, 246, 255, 0.72);
}

.suggestion-card strong {
  color: #1d4ed8;
}

.suggestion-note {
  color: #475569;
}

.suggestion-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 12px;
}

.compact-tags {
  margin: 6px 0 0;
}

.suggestion-tag {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.12);
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 700;
}

.candidate-list {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed rgba(59, 130, 246, 0.2);
}

.candidate-title {
  margin: 0 0 10px;
  color: #1e3a8a;
  font-weight: 700;
}

.candidate-item {
  width: 100%;
  border: 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.6);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  text-align: left;
}

.candidate-item.active {
  background: rgba(59, 130, 246, 0.16);
}

.candidate-gap {
  color: #64748b;
}

.move-card .move-list {
  margin: 12px 0 0;
  padding-left: 18px;
  color: #8a6640;
}

.muted {
  color: #8a6640;
}

@keyframes buttonSpin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

@keyframes thinkingPulse {
  0%,
  100% {
    transform: translateY(0);
    opacity: 0.32;
  }

  50% {
    transform: translateY(-3px);
    opacity: 1;
  }
}

@keyframes winnerOverlayFadeIn {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes winnerCardRise {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.92);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes winnerBurstOrbit {
  0% {
    opacity: 0;
    transform: translate(0, 0) scale(0.2);
  }

  18% {
    opacity: 0.95;
    transform: translate(var(--burst-x), var(--burst-y)) scale(1.12);
  }

  58% {
    opacity: 0.92;
    transform: translate(calc(var(--burst-x) * 0.52), calc(var(--burst-y) * 0.52)) scale(0.98);
  }

  100% {
    opacity: 0;
    transform: translate(0, 44px) scale(0.16);
  }
}

@keyframes winnerButtonAura {
  0% {
    opacity: 0;
    transform: scale(0.4);
  }

  55% {
    opacity: 0.95;
    transform: scale(1.08);
  }

  100% {
    opacity: 0.42;
    transform: scale(1);
  }
}

@keyframes winnerBeamGather {
  0% {
    opacity: 0;
    transform: scaleX(1.8);
    filter: blur(4px);
  }

  60% {
    opacity: 1;
    transform: scaleX(0.7);
    filter: blur(0);
  }

  100% {
    opacity: 0;
    transform: scaleX(0.22);
    filter: blur(0);
  }
}

@media (max-width: 1080px) {
  .gomoku-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .gomoku-page {
    padding: 14px;
  }

  .gomoku-hero {
    flex-direction: column;
    align-items: stretch;
  }

  .hero-actions {
    width: 100%;
  }

  .hero-actions > * {
    flex: 1;
  }

  .gomoku-board-wrap {
    min-width: 0;
    min-height: 0;
    padding: 12px;
  }

  .gomoku-cell {
    width: 30px;
    height: 30px;
  }

  .stone {
    width: 20px;
    height: 20px;
  }

  .winner-overlay.transparent .winner-card {
    transform: translate(108px, -120px) scale(0.62);
  }
}
</style>
