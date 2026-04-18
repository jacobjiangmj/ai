<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import SuggestionWorker from './xiangqiSuggestionWorker.js?worker'

const sideLabels = {
  red: '红方',
  black: '黑方',
}

const modeLabels = {
  'human-vs-human': '双人对弈',
  'human-vs-ai': '人机对战',
}

const pieceLabels = {
  general: { red: '帅', black: '将' },
  advisor: { red: '仕', black: '士' },
  elephant: { red: '相', black: '象' },
  horse: { red: '马', black: '马' },
  chariot: { red: '车', black: '车' },
  cannon: { red: '炮', black: '炮' },
  soldier: { red: '兵', black: '卒' },
}

const pieceValues = {
  general: 100000,
  advisor: 110,
  elephant: 110,
  horse: 320,
  chariot: 640,
  cannon: 360,
  soldier: 90,
}

const boardRows = Array.from({ length: 10 }, (_, index) => index)
const boardCols = Array.from({ length: 9 }, (_, index) => index)
const fileLabels = ['一', '二', '三', '四', '五', '六', '七', '八', '九']
const modeOptions = [
  { label: '双人对弈', value: 'human-vs-human' },
  { label: '人机对战', value: 'human-vs-ai' },
]
const aiSideOptions = [
  { label: 'AI 执黑', value: 'black' },
  { label: 'AI 执红', value: 'red' },
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
  { label: '稳健', value: 'solid' },
]
const aiDifficultyConfig = {
  easy: { depth: 1, delay: 220, topMoves: 3 },
  normal: { depth: 2, delay: 360, topMoves: 2 },
  hard: { depth: 3, delay: 520, topMoves: 1 },
}
const suggestionDepthConfig = {
  easy: 3,
  normal: 4,
  hard: 5,
}
const suggestionStrengthDepthBonus = {
  standard: 0,
  deep: 1,
  max: 2,
}
const defaultGameMode = 'human-vs-ai'
const defaultAiSide = 'black'
const defaultAiDifficulty = 'normal'
const defaultSuggestionStrength = 'deep'
const defaultSuggestionStyle = 'balanced'
const settingsStorageKey = 'xiangqi-settings'
const gameStorageKey = 'xiangqi-game-state'
const topStarPoints = [
  { row: 2, col: 1 },
  { row: 2, col: 7 },
  { row: 3, col: 0 },
  { row: 3, col: 2 },
  { row: 3, col: 4 },
  { row: 3, col: 6 },
  { row: 3, col: 8 },
]
const bottomStarPoints = [
  { row: 1, col: 0 },
  { row: 1, col: 2 },
  { row: 1, col: 4 },
  { row: 1, col: 6 },
  { row: 1, col: 8 },
  { row: 2, col: 1 },
  { row: 2, col: 7 },
]
const winnerBurstOffsets = [
  { x: '-34%', y: '-28%', delay: '0s' },
  { x: '32%', y: '-30%', delay: '0.08s' },
  { x: '-38%', y: '6%', delay: '0.16s' },
  { x: '40%', y: '2%', delay: '0.24s' },
  { x: '-28%', y: '34%', delay: '0.32s' },
  { x: '28%', y: '36%', delay: '0.4s' },
]

const gameMode = ref(defaultGameMode)
const aiSide = ref(defaultAiSide)
const aiDifficulty = ref(defaultAiDifficulty)
const pendingGameMode = ref(defaultGameMode)
const pendingAiSide = ref(defaultAiSide)
const pendingAiDifficulty = ref(defaultAiDifficulty)
const suggestionStrength = ref(defaultSuggestionStrength)
const suggestionStyle = ref(defaultSuggestionStyle)
const board = ref(createInitialBoard())
const currentPlayer = ref('red')
const selected = ref(null)
const legalMoves = ref([])
const winner = ref('')
const notice = ref('点击己方棋子后，再点击高亮位置落子。')
const aiThinking = ref(false)
const moveRecords = ref([])
const historyStack = ref([])
const lastMove = ref(null)
const flyingPiece = ref(null)
const aiPreviewMove = ref(null)
const capturedFlash = ref(null)
const reviewState = ref(null)
const winnerOverlayTransparent = ref(false)
const soundEnabled = ref(true)
const bgmEnabled = ref(true)
const audioReady = ref(false)
const audioDebugMessage = ref('等待首次交互解锁音频')
const aiSuggestion = ref(null)
const suggestedMove = ref(null)
const suggestedIndex = ref(0)
const suggestionLoading = ref(false)
const suggestionAbortHint = ref(false)

let aiTimer = null
let flyingPieceTimer = null
let capturedFlashTimer = null
let suggestionTaskId = 0
let suggestionWorker = null
let audioContext = null
let effectsGainNode = null
let bgmGainNode = null
let bgmTimer = null
let bgmStep = 0
const boardWrapRef = ref(null)
const boardPanelRef = ref(null)
const cellElements = new Map()

const aiEnabled = computed(() => gameMode.value === 'human-vs-ai')
const pendingAiEnabled = computed(() => pendingGameMode.value === 'human-vs-ai')
const currentAiConfig = computed(() => aiDifficultyConfig[aiDifficulty.value] || aiDifficultyConfig.normal)
const currentSuggestionDepth = computed(() => {
  const base = suggestionDepthConfig[aiDifficulty.value] || 4
  return base + (suggestionStrengthDepthBonus[suggestionStrength.value] || 0)
})
const hasPendingConfigChanges = computed(() => {
  return pendingGameMode.value !== gameMode.value
    || pendingAiSide.value !== aiSide.value
    || pendingAiDifficulty.value !== aiDifficulty.value
})
const isReviewing = computed(() => Boolean(reviewState.value))
const displayBoard = computed(() => reviewState.value?.board || board.value)
const displayLastMove = computed(() => reviewState.value?.lastMove || lastMove.value)
const displayCurrentPlayer = computed(() => reviewState.value?.currentPlayer || currentPlayer.value)
const displayWinner = computed(() => reviewState.value?.winner || winner.value)
const displayMoveCount = computed(() => reviewState.value?.stepCount ?? moveRecords.value.length)
const isAiTurn = computed(() => aiEnabled.value && currentPlayer.value === aiSide.value && !winner.value)
const legalMoveKeys = computed(() => new Set(legalMoves.value.map((move) => `${move.toRow}-${move.toCol}`)))
const currentCheck = computed(() => !displayWinner.value && isInCheck(displayBoard.value, displayCurrentPlayer.value))
const turnCount = computed(() => Math.floor((displayMoveCount.value + 1) / 2))
const recentMoves = computed(() => [...moveRecords.value].slice(-12).reverse())
const currentAiDifficultyLabel = computed(() => aiDifficultyOptions.find((item) => item.value === aiDifficulty.value)?.label || '普通')
const audioStateLabel = computed(() => audioContext?.state || 'not-created')
const suggestionButtonLabel = computed(() => suggestionLoading.value ? '计算中...' : '智能推荐一步')
const suggestionButtonDisabledReason = computed(() => {
  if (suggestionLoading.value) {
    return ''
  }

  if (isReviewing.value) {
    return '回看模式下不能推荐，请先返回最新局面。'
  }

  if (isAiTurn.value || aiThinking.value) {
    return `${sideLabels[aiSide.value]}回合进行中，暂不提供人工介入推荐。`
  }

  if (winner.value) {
    return '本局已结束，重开后才能继续推荐。'
  }

  return ''
})
const suggestionButtonTitle = computed(() => {
  if (suggestionLoading.value) {
    return suggestionAbortHint.value ? '再次点击可取消本次推荐' : '本次推荐会在 2 秒内返回一个可用着法'
  }

  if (suggestionButtonDisabledReason.value) {
    return suggestionButtonDisabledReason.value
  }

  return '最多 2 秒内返回一个可用推荐'
})
const winnerOverlayTitle = computed(() => winner.value ? `${sideLabels[winner.value]}胜了` : '')
const winnerOverlayHeadline = computed(() => {
  if (!winner.value) {
    return ''
  }

  return winner.value === 'red' ? '红方胜' : '黑方胜'
})
const winnerOverlaySubtitle = computed(() => {
  if (!winner.value) {
    return ''
  }

  if (aiEnabled.value) {
    return winner.value === aiSide.value ? '这一局 AI 拿下胜势。' : '这一局你拿下胜势。'
  }

  return '本局对弈已分出胜负。'
})
const statusText = computed(() => {
  if (isReviewing.value) {
    return `正在回看第 ${reviewState.value.stepCount} 手`
  }

  if (winner.value) {
    return `${sideLabels[winner.value]}获胜`
  }

  if (aiThinking.value && isAiTurn.value) {
    return `${sideLabels[aiSide.value]}正在思考中`
  }

  if (currentCheck.value) {
    return `${sideLabels[currentPlayer.value]}被将军，请立即应将`
  }

  return `轮到${sideLabels[currentPlayer.value]}行棋`
})

function createPiece(side, type) {
  return { side, type }
}

function createInitialBoard() {
  const nextBoard = Array.from({ length: 10 }, () => Array.from({ length: 9 }, () => null))
  const backRank = ['chariot', 'horse', 'elephant', 'advisor', 'general', 'advisor', 'elephant', 'horse', 'chariot']

  backRank.forEach((type, col) => {
    nextBoard[0][col] = createPiece('black', type)
    nextBoard[9][col] = createPiece('red', type)
  })

  nextBoard[2][1] = createPiece('black', 'cannon')
  nextBoard[2][7] = createPiece('black', 'cannon')
  nextBoard[7][1] = createPiece('red', 'cannon')
  nextBoard[7][7] = createPiece('red', 'cannon')

  ;[0, 2, 4, 6, 8].forEach((col) => {
    nextBoard[3][col] = createPiece('black', 'soldier')
    nextBoard[6][col] = createPiece('red', 'soldier')
  })

  return nextBoard
}

function cloneBoard(sourceBoard) {
  return sourceBoard.map((row) => row.map((piece) => (piece ? { ...piece } : null)))
}

function cloneMoveRecords(records) {
  return records.map((record) => ({
    ...record,
    piece: { ...record.piece },
    capturedPiece: record.capturedPiece ? { ...record.capturedPiece } : null,
  }))
}

function createSnapshot() {
  return {
    board: cloneBoard(board.value),
    currentPlayer: currentPlayer.value,
    winner: winner.value,
    notice: notice.value,
    lastMove: lastMove.value ? { ...lastMove.value } : null,
    moveRecords: cloneMoveRecords(moveRecords.value),
  }
}

function restoreSnapshot(snapshot) {
  board.value = cloneBoard(snapshot.board)
  currentPlayer.value = snapshot.currentPlayer
  winner.value = snapshot.winner
  notice.value = snapshot.notice
  lastMove.value = snapshot.lastMove ? { ...snapshot.lastMove } : null
  moveRecords.value = cloneMoveRecords(snapshot.moveRecords)
  winnerOverlayTransparent.value = false
  clearSelection()
}

function clearSelection() {
  selected.value = null
  legalMoves.value = []
}

function clearFlyingPiece() {
  if (flyingPieceTimer) {
    window.clearTimeout(flyingPieceTimer)
    flyingPieceTimer = null
  }
  flyingPiece.value = null
}

function exitReviewMode(silent = false) {
  reviewState.value = null
  if (!silent) {
    notice.value = '已回到最新局面。'
  }
}

function clearCapturedFlash() {
  if (capturedFlashTimer) {
    window.clearTimeout(capturedFlashTimer)
    capturedFlashTimer = null
  }
  capturedFlash.value = null
}

function invalidateAiSuggestionState(clearSuggestion = false) {
  suggestionTaskId += 1
  suggestionLoading.value = false
  suggestionAbortHint.value = false
  if (suggestionWorker) {
    suggestionWorker.terminate()
    suggestionWorker = null
  }

  if (clearSuggestion) {
    aiSuggestion.value = null
    suggestedMove.value = null
    suggestedIndex.value = 0
  }
}

function resetGame(customNotice = '棋局已重置，红方先行。') {
  ensureAudioReady()
  exitReviewMode(true)
  clearAiTimer()
  invalidateAiSuggestionState(true)
  winnerOverlayTransparent.value = false
  clearFlyingPiece()
  clearCapturedFlash()
  aiPreviewMove.value = null
  aiThinking.value = false
  winnerOverlayTransparent.value = false
  board.value = createInitialBoard()
  currentPlayer.value = 'red'
  winner.value = ''
  moveRecords.value = []
  historyStack.value = []
  lastMove.value = null
  notice.value = customNotice
  clearSelection()
  saveGameState()
}

function toggleWinnerOverlayTransparency() {
  if (!winner.value) {
    return
  }

  winnerOverlayTransparent.value = !winnerOverlayTransparent.value
}

function syncPendingSettingsFromCurrentGame() {
  pendingGameMode.value = gameMode.value
  pendingAiSide.value = aiSide.value
  pendingAiDifficulty.value = aiDifficulty.value
}

function applyPendingSettingsToCurrentGame() {
  gameMode.value = pendingGameMode.value
  aiSide.value = pendingAiSide.value
  aiDifficulty.value = pendingAiDifficulty.value
}

function resetSettingsToDefaults() {
  gameMode.value = defaultGameMode
  aiSide.value = defaultAiSide
  aiDifficulty.value = defaultAiDifficulty
  syncPendingSettingsFromCurrentGame()
}

function startConfiguredGame() {
  applyPendingSettingsToCurrentGame()
  const aiSummary = aiEnabled.value ? `，${sideLabels[aiSide.value]}由 AI 执子。` : '。'
  resetGame(`已按当前配置重新开局${aiSummary}`)
}

function createAudioContext() {
  return new (window.AudioContext || window.webkitAudioContext)()
}

function ensureAudioReady() {
  if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined' && typeof window.webkitAudioContext === 'undefined') {
    audioDebugMessage.value = '当前浏览器不支持 Web Audio'
    return false
  }

  if (!audioContext) {
    audioContext = createAudioContext()
    effectsGainNode = audioContext.createGain()
    effectsGainNode.gain.value = 0.62
    bgmGainNode = audioContext.createGain()
    bgmGainNode.gain.value = 0.18
    effectsGainNode.connect(audioContext.destination)
    bgmGainNode.connect(audioContext.destination)
  }

  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {})
  }

  audioReady.value = audioContext.state !== 'closed'
  audioDebugMessage.value = `音频上下文状态: ${audioContext.state}`

  if (bgmEnabled.value && audioContext.state === 'running' && !bgmTimer) {
    startBackgroundMusic()
  }

  return true
}

function playTone(frequency, duration, options = {}) {
  const {
    volume = 0.05,
    type = 'sine',
    delay = 0,
    requireEffectsEnabled = true,
    attack = 0.02,
    sustain = 0.7,
  } = options

  if (requireEffectsEnabled && !soundEnabled.value) {
    return
  }

  if (!ensureAudioReady()) {
    return
  }

  const destination = options.destination || effectsGainNode
  if (!destination) {
    return
  }

  const startTime = audioContext.currentTime + delay
  const endTime = startTime + duration
  const sustainTime = startTime + duration * sustain
  const oscillator = audioContext.createOscillator()
  const gainNode = audioContext.createGain()

  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, startTime)
  gainNode.gain.setValueAtTime(0.0001, startTime)
  gainNode.gain.exponentialRampToValueAtTime(volume, startTime + attack)
  gainNode.gain.exponentialRampToValueAtTime(Math.max(volume * 0.18, 0.0001), sustainTime)
  gainNode.gain.exponentialRampToValueAtTime(0.0001, endTime)

  oscillator.connect(gainNode)
  gainNode.connect(destination)
  oscillator.start(startTime)
  oscillator.stop(endTime)
}

function playSequence(notes, options = {}) {
  notes.forEach((note, index) => {
    playTone(note.frequency, note.duration, {
      ...options,
      delay: note.delay ?? index * 0.12,
      volume: note.volume ?? options.volume,
      type: note.type ?? options.type,
    })
  })
}

function playMoveSound(kind) {
  if (!soundEnabled.value) {
    return
  }

  const sequences = {
    select: [
      { frequency: 920, duration: 0.03, volume: 0.15, type: 'triangle', attack: 0.003, sustain: 0.2 },
      { frequency: 1180, duration: 0.02, volume: 0.08, type: 'sine', delay: 0.018, attack: 0.002, sustain: 0.18 },
    ],
    move: [
      { frequency: 145, duration: 0.044, volume: 0.68, type: 'square', attack: 0.0016, sustain: 0.12 },
      { frequency: 95, duration: 0.072, volume: 0.32, type: 'triangle', delay: 0.006, attack: 0.0018, sustain: 0.2 },
      { frequency: 760, duration: 0.016, volume: 0.11, type: 'sine', delay: 0.004, attack: 0.0012, sustain: 0.08 },
      { frequency: 210, duration: 0.125, volume: 0.09, type: 'triangle', delay: 0.02, attack: 0.0018, sustain: 0.76 },
    ],
    capture: [
      { frequency: 132, duration: 0.056, type: 'square', volume: 0.74, attack: 0.0016, sustain: 0.11 },
      { frequency: 88, duration: 0.095, type: 'triangle', volume: 0.38, delay: 0.008, attack: 0.0018, sustain: 0.2 },
      { frequency: 62, duration: 0.12, type: 'sawtooth', volume: 0.22, delay: 0.022, attack: 0.0018, sustain: 0.18 },
      { frequency: 170, duration: 0.15, type: 'triangle', volume: 0.12, delay: 0.03, attack: 0.0018, sustain: 0.76 },
    ],
    check: [
      { frequency: 659.25, duration: 0.1, volume: 0.3, type: 'triangle' },
      { frequency: 783.99, duration: 0.1, volume: 0.28, type: 'triangle', delay: 0.1 },
      { frequency: 987.77, duration: 0.18, volume: 0.26, type: 'sawtooth', delay: 0.2 },
    ],
    win: [
      { frequency: 523.25, duration: 0.12, volume: 0.24, type: 'triangle' },
      { frequency: 659.25, duration: 0.12, volume: 0.24, type: 'triangle', delay: 0.12 },
      { frequency: 783.99, duration: 0.14, volume: 0.24, type: 'triangle', delay: 0.24 },
      { frequency: 1046.5, duration: 0.24, volume: 0.22, type: 'sine', delay: 0.38 },
    ],
  }

  playSequence(sequences[kind] || sequences.move)
}

function saveGameState() {
  try {
    localStorage.setItem(
      gameStorageKey,
        JSON.stringify({
          board: board.value,
          currentPlayer: currentPlayer.value,
          winner: winner.value,
          notice: notice.value,
          gameMode: gameMode.value,
          aiSide: aiSide.value,
          aiDifficulty: aiDifficulty.value,
          moveRecords: moveRecords.value,
          historyStack: historyStack.value,
          lastMove: lastMove.value,
      }),
    )
  } catch {
    // ignore local persistence failures
  }
}

function clearStoredGameState() {
  localStorage.removeItem(gameStorageKey)
}

function loadGameState() {
  try {
    const raw = localStorage.getItem(gameStorageKey)
    if (!raw) {
      return false
    }

    const saved = JSON.parse(raw)
    if (!Array.isArray(saved.board) || !saved.currentPlayer) {
      return false
    }

    if (saved.gameMode === 'human-vs-human' || saved.gameMode === 'human-vs-ai') {
      gameMode.value = saved.gameMode
    }
    if (saved.aiSide === 'red' || saved.aiSide === 'black') {
      aiSide.value = saved.aiSide
    }
    if (saved.aiDifficulty in aiDifficultyConfig) {
      aiDifficulty.value = saved.aiDifficulty
    }

    board.value = cloneBoard(saved.board)
    currentPlayer.value = saved.currentPlayer
    winner.value = saved.winner || ''
    notice.value = saved.notice || '已恢复上次棋局。'
    moveRecords.value = cloneMoveRecords(saved.moveRecords || [])
    historyStack.value = Array.isArray(saved.historyStack)
      ? saved.historyStack.map((snapshot) => ({
          ...snapshot,
          board: cloneBoard(snapshot.board),
          moveRecords: cloneMoveRecords(snapshot.moveRecords || []),
          lastMove: snapshot.lastMove ? { ...snapshot.lastMove } : null,
        }))
      : []
    lastMove.value = saved.lastMove ? { ...saved.lastMove } : null
    clearSelection()
    syncPendingSettingsFromCurrentGame()
    return true
  } catch {
    return false
  }
}

function clearAllLocalData() {
  clearStoredGameState()
  localStorage.removeItem(settingsStorageKey)
  resetSettingsToDefaults()
  resetGame('已清空历史棋局与本地设置，重新开始。')
}

function playSoundCheck() {
  audioDebugMessage.value = '正在播放测试音'
  playSequence([
    { frequency: 523.25, duration: 0.12, volume: 0.3, type: 'triangle' },
    { frequency: 659.25, duration: 0.12, volume: 0.3, type: 'triangle', delay: 0.12 },
  ])
}

function runAudioDiagnostics() {
  const ready = ensureAudioReady()
  if (!ready) {
    audioDebugMessage.value = '音频初始化失败'
    return
  }

  if (audioContext?.state !== 'running') {
    audioDebugMessage.value = `音频仍未运行，当前状态: ${audioContext?.state || 'unknown'}`
    return
  }

  playSoundCheck()
}

function startBackgroundMusic() {
  if (!bgmEnabled.value || bgmTimer) {
    return
  }

  if (!audioReady.value && !ensureAudioReady()) {
    return
  }

  const melody = [261.63, 329.63, 392, 329.63, 349.23, 440, 392, 329.63]
  bgmStep = 0
  bgmTimer = window.setInterval(() => {
    const frequency = melody[bgmStep % melody.length]
    playTone(frequency, 0.34, {
      volume: 0.12,
      type: 'triangle',
      destination: bgmGainNode,
      requireEffectsEnabled: false,
    })
    if (bgmStep % 2 === 0) {
      playTone(frequency / 2, 0.3, {
        volume: 0.08,
        type: 'sine',
        destination: bgmGainNode,
        requireEffectsEnabled: false,
      })
    }
    bgmStep += 1
  }, 430)
}

function stopBackgroundMusic() {
  if (bgmTimer) {
    window.clearInterval(bgmTimer)
    bgmTimer = null
  }
}

function syncBackgroundMusic() {
  if (bgmEnabled.value) {
    startBackgroundMusic()
  } else {
    stopBackgroundMusic()
  }
}

function toggleSound() {
  ensureAudioReady()
  soundEnabled.value = !soundEnabled.value
  if (soundEnabled.value) {
    playSoundCheck()
  }
  notice.value = soundEnabled.value ? '音效已开启。' : '音效已关闭。'
}

function toggleBackgroundMusic() {
  ensureAudioReady()
  bgmEnabled.value = !bgmEnabled.value
  syncBackgroundMusic()
  if (bgmEnabled.value) {
    playTone(392, 0.14, {
      volume: 0.16,
      type: 'triangle',
      destination: bgmGainNode,
      requireEffectsEnabled: false,
    })
  }
  notice.value = bgmEnabled.value ? '背景音乐已开启。' : '背景音乐已关闭。'
}

function unlockAudioFromGesture() {
  ensureAudioReady()
}

function buildReplayState(stepCount) {
  let replayBoard = createInitialBoard()
  let replayLastMove = null

  for (let index = 0; index < stepCount; index += 1) {
    const record = moveRecords.value[index]
    if (!record) {
      break
    }

    replayBoard = applyMoveToBoard(replayBoard, record)
    replayLastMove = {
      fromRow: record.fromRow,
      fromCol: record.fromCol,
      toRow: record.toRow,
      toCol: record.toCol,
    }
  }

  return {
    board: replayBoard,
    currentPlayer: stepCount % 2 === 0 ? 'red' : 'black',
    winner: '',
    lastMove: replayLastMove,
    stepCount,
  }
}

function jumpToMove(stepCount) {
  if (isAiTurn.value || aiThinking.value) {
    notice.value = 'AI 回合进行中，暂不能回看棋谱。'
    return
  }

  const nextStepCount = Math.max(0, Math.min(stepCount, moveRecords.value.length))
  clearSelection()
  clearFlyingPiece()
  clearCapturedFlash()
  aiPreviewMove.value = null
  reviewState.value = buildReplayState(nextStepCount)
  notice.value = `正在回看第 ${nextStepCount} 手。`
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(settingsStorageKey)
    if (!raw) {
      return
    }

    const saved = JSON.parse(raw)
    if (saved.aiDifficulty in aiDifficultyConfig) {
      pendingAiDifficulty.value = saved.aiDifficulty
    }
    if (saved.suggestionStrength in suggestionStrengthDepthBonus) {
      suggestionStrength.value = saved.suggestionStrength
    }
    if (saved.suggestionStyle === 'balanced' || saved.suggestionStyle === 'aggressive' || saved.suggestionStyle === 'solid') {
      suggestionStyle.value = saved.suggestionStyle
    }
    if (saved.aiSide === 'red' || saved.aiSide === 'black') {
      pendingAiSide.value = saved.aiSide
    }
    if (saved.gameMode === 'human-vs-human' || saved.gameMode === 'human-vs-ai') {
      pendingGameMode.value = saved.gameMode
    }
    if (typeof saved.soundEnabled === 'boolean') {
      soundEnabled.value = saved.soundEnabled
    }
    if (typeof saved.bgmEnabled === 'boolean') {
      bgmEnabled.value = saved.bgmEnabled
    }
  } catch {
    // ignore invalid local settings
  }
}

function saveSettings() {
  localStorage.setItem(
    settingsStorageKey,
    JSON.stringify({
      gameMode: pendingGameMode.value,
      aiSide: pendingAiSide.value,
      aiDifficulty: pendingAiDifficulty.value,
      suggestionStrength: suggestionStrength.value,
      suggestionStyle: suggestionStyle.value,
      soundEnabled: soundEnabled.value,
      bgmEnabled: bgmEnabled.value,
    }),
  )
}

function setCellRef(row, col, element) {
  const key = `${row}-${col}`
  if (element) {
    cellElements.set(key, element)
  } else {
    cellElements.delete(key)
  }
}

function launchFlyingPiece(move, piece) {
  const fromElement = cellElements.get(`${move.fromRow}-${move.fromCol}`)
  const toElement = cellElements.get(`${move.toRow}-${move.toCol}`)
  const boardElement = boardWrapRef.value

  if (!fromElement || !toElement || !boardElement) {
    clearFlyingPiece()
    return
  }

  const boardRect = boardElement.getBoundingClientRect()
  const fromRect = fromElement.getBoundingClientRect()
  const toRect = toElement.getBoundingClientRect()
  const pieceSize = Math.min(fromRect.width, fromRect.height) * 0.74
  const startX = fromRect.left - boardRect.left + fromRect.width / 2 - pieceSize / 2
  const startY = fromRect.top - boardRect.top + fromRect.height / 2 - pieceSize / 2
  const endX = toRect.left - boardRect.left + toRect.width / 2 - pieceSize / 2
  const endY = toRect.top - boardRect.top + toRect.height / 2 - pieceSize / 2

  clearFlyingPiece()
  flyingPiece.value = {
    key: `${Date.now()}-${move.fromRow}-${move.fromCol}-${move.toRow}-${move.toCol}`,
    label: pieceText(piece),
    side: piece.side,
    startX,
    startY,
    endX,
    endY,
    size: pieceSize,
    active: false,
    capture: Boolean(move.capturedPiece),
  }

  requestAnimationFrame(() => {
    if (!flyingPiece.value) {
      return
    }

    flyingPiece.value = {
      ...flyingPiece.value,
      active: true,
    }
  })

  flyingPieceTimer = window.setTimeout(() => {
    clearFlyingPiece()
  }, 420)
}

function triggerCapturedFlash(move) {
  if (!move.capturedPiece) {
    clearCapturedFlash()
    return
  }

  clearCapturedFlash()
  capturedFlash.value = {
    row: move.toRow,
    col: move.toCol,
  }

  capturedFlashTimer = window.setTimeout(() => {
    clearCapturedFlash()
  }, 240)
}

function oppositeSide(side) {
  return side === 'red' ? 'black' : 'red'
}

function isInsideBoard(row, col) {
  return row >= 0 && row < 10 && col >= 0 && col < 9
}

function getCell(sourceBoard, row, col) {
  return isInsideBoard(row, col) ? sourceBoard[row][col] : null
}

function isInsidePalace(side, row, col) {
  const palaceRows = side === 'red' ? [7, 9] : [0, 2]
  return row >= palaceRows[0] && row <= palaceRows[1] && col >= 3 && col <= 5
}

function hasCrossedRiver(side, row) {
  return side === 'red' ? row <= 4 : row >= 5
}

function countPiecesBetween(sourceBoard, fromRow, fromCol, toRow, toCol) {
  let count = 0

  if (fromRow === toRow) {
    const step = fromCol < toCol ? 1 : -1
    for (let col = fromCol + step; col !== toCol; col += step) {
      if (sourceBoard[fromRow][col]) {
        count += 1
      }
    }
  } else if (fromCol === toCol) {
    const step = fromRow < toRow ? 1 : -1
    for (let row = fromRow + step; row !== toRow; row += step) {
      if (sourceBoard[row][fromCol]) {
        count += 1
      }
    }
  }

  return count
}

function locateGeneral(sourceBoard, side) {
  for (let row = 0; row < sourceBoard.length; row += 1) {
    for (let col = 0; col < sourceBoard[row].length; col += 1) {
      const piece = sourceBoard[row][col]
      if (piece?.side === side && piece.type === 'general') {
        return { row, col }
      }
    }
  }

  return null
}

function locateDangerGeneral(side) {
  if (!currentCheck.value) {
    return null
  }

  return locateGeneral(board.value, side)
}

function canAttackSquare(sourceBoard, fromRow, fromCol, piece, targetRow, targetCol) {
  const rowDelta = targetRow - fromRow
  const colDelta = targetCol - fromCol
  const absRowDelta = Math.abs(rowDelta)
  const absColDelta = Math.abs(colDelta)

  switch (piece.type) {
    case 'general':
      if (fromCol === targetCol && countPiecesBetween(sourceBoard, fromRow, fromCol, targetRow, targetCol) === 0) {
        return true
      }
      return absRowDelta + absColDelta === 1 && isInsidePalace(piece.side, targetRow, targetCol)
    case 'advisor':
      return absRowDelta === 1 && absColDelta === 1 && isInsidePalace(piece.side, targetRow, targetCol)
    case 'elephant':
      if (absRowDelta !== 2 || absColDelta !== 2) {
        return false
      }
      if (piece.side === 'red' && targetRow < 5) {
        return false
      }
      if (piece.side === 'black' && targetRow > 4) {
        return false
      }
      return !sourceBoard[fromRow + rowDelta / 2][fromCol + colDelta / 2]
    case 'horse': {
      const horseMoves = [
        { row: -2, col: -1, block: [-1, 0] },
        { row: -2, col: 1, block: [-1, 0] },
        { row: 2, col: -1, block: [1, 0] },
        { row: 2, col: 1, block: [1, 0] },
        { row: -1, col: -2, block: [0, -1] },
        { row: 1, col: -2, block: [0, -1] },
        { row: -1, col: 2, block: [0, 1] },
        { row: 1, col: 2, block: [0, 1] },
      ]

      return horseMoves.some((move) => {
        if (move.row !== rowDelta || move.col !== colDelta) {
          return false
        }
        return !getCell(sourceBoard, fromRow + move.block[0], fromCol + move.block[1])
      })
    }
    case 'chariot':
      return (fromRow === targetRow || fromCol === targetCol) && countPiecesBetween(sourceBoard, fromRow, fromCol, targetRow, targetCol) === 0
    case 'cannon':
      return (fromRow === targetRow || fromCol === targetCol) && countPiecesBetween(sourceBoard, fromRow, fromCol, targetRow, targetCol) === 1
    case 'soldier': {
      const forward = piece.side === 'red' ? -1 : 1
      if (rowDelta === forward && colDelta === 0) {
        return true
      }
      return hasCrossedRiver(piece.side, fromRow) && rowDelta === 0 && absColDelta === 1
    }
    default:
      return false
  }
}

function isInCheck(sourceBoard, side) {
  const general = locateGeneral(sourceBoard, side)
  if (!general) {
    return true
  }

  const enemySide = oppositeSide(side)
  for (let row = 0; row < sourceBoard.length; row += 1) {
    for (let col = 0; col < sourceBoard[row].length; col += 1) {
      const piece = sourceBoard[row][col]
      if (piece?.side === enemySide && canAttackSquare(sourceBoard, row, col, piece, general.row, general.col)) {
        return true
      }
    }
  }

  return false
}

function pushMoveIfAvailable(moves, sourceBoard, piece, row, col) {
  if (!isInsideBoard(row, col)) {
    return
  }

  const target = sourceBoard[row][col]
  if (!target || target.side !== piece.side) {
    moves.push({ row, col })
  }
}

function getCandidateMoves(sourceBoard, row, col) {
  const piece = sourceBoard[row][col]
  if (!piece) {
    return []
  }

  const moves = []

  switch (piece.type) {
    case 'general':
      ;[
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ].forEach(([rowOffset, colOffset]) => {
        const nextRow = row + rowOffset
        const nextCol = col + colOffset
        if (isInsidePalace(piece.side, nextRow, nextCol)) {
          pushMoveIfAvailable(moves, sourceBoard, piece, nextRow, nextCol)
        }
      })

      const enemyGeneral = locateGeneral(sourceBoard, oppositeSide(piece.side))
      if (enemyGeneral && enemyGeneral.col === col && countPiecesBetween(sourceBoard, row, col, enemyGeneral.row, enemyGeneral.col) === 0) {
        moves.push({ row: enemyGeneral.row, col: enemyGeneral.col })
      }
      break
    case 'advisor':
      ;[
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
      ].forEach(([rowOffset, colOffset]) => {
        const nextRow = row + rowOffset
        const nextCol = col + colOffset
        if (isInsidePalace(piece.side, nextRow, nextCol)) {
          pushMoveIfAvailable(moves, sourceBoard, piece, nextRow, nextCol)
        }
      })
      break
    case 'elephant':
      ;[
        [-2, -2],
        [-2, 2],
        [2, -2],
        [2, 2],
      ].forEach(([rowOffset, colOffset]) => {
        const nextRow = row + rowOffset
        const nextCol = col + colOffset
        const midRow = row + rowOffset / 2
        const midCol = col + colOffset / 2

        if (!isInsideBoard(nextRow, nextCol) || sourceBoard[midRow][midCol]) {
          return
        }

        if ((piece.side === 'red' && nextRow < 5) || (piece.side === 'black' && nextRow > 4)) {
          return
        }

        pushMoveIfAvailable(moves, sourceBoard, piece, nextRow, nextCol)
      })
      break
    case 'horse': {
      const horseMoves = [
        { row: -2, col: -1, block: [-1, 0] },
        { row: -2, col: 1, block: [-1, 0] },
        { row: 2, col: -1, block: [1, 0] },
        { row: 2, col: 1, block: [1, 0] },
        { row: -1, col: -2, block: [0, -1] },
        { row: 1, col: -2, block: [0, -1] },
        { row: -1, col: 2, block: [0, 1] },
        { row: 1, col: 2, block: [0, 1] },
      ]

      horseMoves.forEach((move) => {
        if (getCell(sourceBoard, row + move.block[0], col + move.block[1])) {
          return
        }
        pushMoveIfAvailable(moves, sourceBoard, piece, row + move.row, col + move.col)
      })
      break
    }
    case 'chariot':
      ;[
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ].forEach(([rowStep, colStep]) => {
        let nextRow = row + rowStep
        let nextCol = col + colStep
        while (isInsideBoard(nextRow, nextCol)) {
          const target = sourceBoard[nextRow][nextCol]
          if (!target) {
            moves.push({ row: nextRow, col: nextCol })
          } else {
            if (target.side !== piece.side) {
              moves.push({ row: nextRow, col: nextCol })
            }
            break
          }
          nextRow += rowStep
          nextCol += colStep
        }
      })
      break
    case 'cannon':
      ;[
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ].forEach(([rowStep, colStep]) => {
        let nextRow = row + rowStep
        let nextCol = col + colStep
        let jumped = false

        while (isInsideBoard(nextRow, nextCol)) {
          const target = sourceBoard[nextRow][nextCol]
          if (!jumped) {
            if (!target) {
              moves.push({ row: nextRow, col: nextCol })
            } else {
              jumped = true
            }
          } else if (target) {
            if (target.side !== piece.side) {
              moves.push({ row: nextRow, col: nextCol })
            }
            break
          }

          nextRow += rowStep
          nextCol += colStep
        }
      })
      break
    case 'soldier': {
      const forward = piece.side === 'red' ? -1 : 1
      pushMoveIfAvailable(moves, sourceBoard, piece, row + forward, col)
      if (hasCrossedRiver(piece.side, row)) {
        pushMoveIfAvailable(moves, sourceBoard, piece, row, col - 1)
        pushMoveIfAvailable(moves, sourceBoard, piece, row, col + 1)
      }
      break
    }
    default:
      break
  }

  return moves
}

function applyMoveToBoard(sourceBoard, move) {
  const nextBoard = cloneBoard(sourceBoard)
  nextBoard[move.toRow][move.toCol] = { ...sourceBoard[move.fromRow][move.fromCol] }
  nextBoard[move.fromRow][move.fromCol] = null
  return nextBoard
}

function getLegalMoves(sourceBoard, row, col) {
  const piece = sourceBoard[row][col]
  if (!piece) {
    return []
  }

  return getCandidateMoves(sourceBoard, row, col)
    .map((move) => ({
      fromRow: row,
      fromCol: col,
      toRow: move.row,
      toCol: move.col,
      piece,
      capturedPiece: sourceBoard[move.row][move.col],
    }))
    .filter((move) => !isInCheck(applyMoveToBoard(sourceBoard, move), piece.side))
}

function getAvailableMoves(sourceBoard, row, col) {
  const piece = sourceBoard[row][col]
  if (!piece) {
    return []
  }

  return getCandidateMoves(sourceBoard, row, col).map((move) => ({
    fromRow: row,
    fromCol: col,
    toRow: move.row,
    toCol: move.col,
    piece,
    capturedPiece: sourceBoard[move.row][move.col],
  }))
}

function getAllAvailableMoves(sourceBoard, side) {
  const moves = []

  for (let row = 0; row < sourceBoard.length; row += 1) {
    for (let col = 0; col < sourceBoard[row].length; col += 1) {
      const piece = sourceBoard[row][col]
      if (piece?.side === side) {
        moves.push(...getAvailableMoves(sourceBoard, row, col))
      }
    }
  }

  return moves
}

function getAllLegalMoves(sourceBoard, side) {
  const moves = []

  for (let row = 0; row < sourceBoard.length; row += 1) {
    for (let col = 0; col < sourceBoard[row].length; col += 1) {
      const piece = sourceBoard[row][col]
      if (piece?.side === side) {
        moves.push(...getLegalMoves(sourceBoard, row, col))
      }
    }
  }

  return moves
}

function getPieceScore(piece, row, col) {
  let score = pieceValues[piece.type]

  if (piece.type === 'soldier') {
    score += hasCrossedRiver(piece.side, row) ? 45 : 0
    score += piece.side === 'red' ? (9 - row) * 4 : row * 4
    score += 6 - Math.abs(col - 4)
  }

  if (piece.type === 'horse' || piece.type === 'cannon') {
    score += 10 - Math.abs(col - 4) * 2
  }

  if (piece.type === 'chariot') {
    score += 12 - Math.abs(col - 4) * 2
  }

  return score
}

function evaluateBoard(sourceBoard, perspectiveSide) {
  const ownGeneral = locateGeneral(sourceBoard, perspectiveSide)
  const enemySide = oppositeSide(perspectiveSide)
  const enemyGeneral = locateGeneral(sourceBoard, enemySide)

  if (!ownGeneral) {
    return -999999
  }

  if (!enemyGeneral) {
    return 999999
  }

  let score = 0

  for (let row = 0; row < sourceBoard.length; row += 1) {
    for (let col = 0; col < sourceBoard[row].length; col += 1) {
      const piece = sourceBoard[row][col]
      if (!piece) {
        continue
      }

      const pieceScore = getPieceScore(piece, row, col)
      score += piece.side === perspectiveSide ? pieceScore : -pieceScore
    }
  }

  if (isInCheck(sourceBoard, enemySide)) {
    score += 55
  }

  if (isInCheck(sourceBoard, perspectiveSide)) {
    score -= 65
  }

  return score
}

function compareMoves(left, right) {
  const leftScore = left.capturedPiece ? pieceValues[left.capturedPiece.type] : 0
  const rightScore = right.capturedPiece ? pieceValues[right.capturedPiece.type] : 0
  return rightScore - leftScore
}

function applySuggestionStyleScore(move, side, nextBoard, baseScore) {
  let score = baseScore

  if (suggestionStyle.value === 'aggressive') {
    if (move.capturedPiece) {
      score += 35
    }
    if (isInCheck(nextBoard, oppositeSide(side))) {
      score += 50
    }
  }

  if (suggestionStyle.value === 'solid') {
    if (isInCheck(nextBoard, side)) {
      score -= 80
    }
    if (!move.capturedPiece) {
      score += 12
    }
  }

  return score
}

function getQuickSuggestionScore(move, side, nextBoard) {
  let score = evaluateBoard(nextBoard, side)

  if (move.capturedPiece) {
    score += pieceValues[move.capturedPiece.type] * 0.55
  }

  if (isInCheck(nextBoard, oppositeSide(side))) {
    score += 28
  }

  if (move.piece.type === 'soldier' && hasCrossedRiver(side, move.toRow)) {
    score += 12
  }

  return applySuggestionStyleScore(move, side, nextBoard, score)
}

function getQuickSuggestionEntries(sourceBoard, side, limit = 3) {
  return prioritizeGeneralCaptureMoves(getAllLegalMoves(sourceBoard, side), sourceBoard, side)
    .sort(compareMoves)
    .map((move) => {
      const nextBoard = applyMoveToBoard(sourceBoard, move)
      return {
        move,
        nextBoard,
        score: getQuickSuggestionScore(move, side, nextBoard),
      }
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
}

function prioritizeGeneralCaptureMoves(moves, sourceBoard, side) {
  const forcedCapture = moves.find((move) => !locateGeneral(applyMoveToBoard(sourceBoard, move), oppositeSide(side)))
  return forcedCapture ? [forcedCapture] : moves
}

function findGeneralCaptureMove(sourceBoard, side) {
  return getAllAvailableMoves(sourceBoard, side).find((move) => !locateGeneral(applyMoveToBoard(sourceBoard, move), oppositeSide(side))) || null
}

function chooseAiMove(sourceBoard, side) {
  const availableMoves = getAllAvailableMoves(sourceBoard, side)
  const forcedCaptureMove = findGeneralCaptureMove(sourceBoard, side)
  const forcedMoves = forcedCaptureMove ? [forcedCaptureMove] : prioritizeGeneralCaptureMoves(availableMoves, sourceBoard, side)
  const legalMoves = getAllLegalMoves(sourceBoard, side)
  const movePool = forcedCaptureMove
    ? forcedMoves
    : (legalMoves.length ? legalMoves : availableMoves)
  const legal = movePool.sort(compareMoves)
  const scoredMoves = []

  for (const move of legal) {
    const nextBoard = applyMoveToBoard(sourceBoard, move)
    const score = evaluateBoard(nextBoard, side)
    scoredMoves.push({ move, score })
  }

  scoredMoves.sort((left, right) => right.score - left.score)

  if (!scoredMoves.length) {
    return null
  }

  const candidateCount = Math.min(currentAiConfig.value.topMoves, scoredMoves.length)
  const candidateIndex = candidateCount === 1 ? 0 : Math.floor(Math.random() * candidateCount)
  return scoredMoves[candidateIndex].move
}


function describeMoveAdvantage(bestEntry, alternativeEntry) {
  const reasons = []
  if (bestEntry.move.capturedPiece) {
    reasons.push(`可以直接吃掉${pieceLabels[bestEntry.move.capturedPiece.type][bestEntry.move.capturedPiece.side]}`)
  }

  if (currentCheck.value) {
    reasons.push('这步优先帮你解将')
  }

  const nextBoard = applyMoveToBoard(board.value, bestEntry.move)
  if (isInCheck(nextBoard, oppositeSide(bestEntry.move.piece.side))) {
    reasons.push('能顺手形成将军压力')
  }

  const scoreGap = alternativeEntry ? bestEntry.score - alternativeEntry.score : bestEntry.score
  if (scoreGap >= 120) {
    reasons.push('相比其他着法，局面收益更明显')
  } else if (scoreGap >= 40) {
    reasons.push('比常见备选更稳')
  } else {
    reasons.push('能稳住当前局面')
  }

  return reasons.slice(0, 2).join('，')
}

function getMoveTags(entry, side) {
  const tags = []
  const nextBoard = entry.nextBoard || applyMoveToBoard(board.value, entry.move)
  const enemySide = oppositeSide(side)

  if (currentCheck.value) {
    tags.push('解将')
  }

  if (entry.move.capturedPiece) {
    tags.push('吃子')
  }

  if (isInCheck(nextBoard, enemySide)) {
    tags.push('进攻')
  }

  if (entry.score >= 80) {
    tags.push('抢先手')
  }

  if (!entry.move.capturedPiece && !isInCheck(nextBoard, enemySide) && entry.score >= 25) {
    tags.push('保子')
  }

  if (!tags.length) {
    tags.push(entry.score >= 40 ? '稳健' : '过渡')
  }

  return [...new Set(tags)].slice(0, 3)
}

async function requestAiSuggestion() {
  if (suggestionLoading.value) {
    cancelAiSuggestion()
    return
  }

  if (isReviewing.value) {
    notice.value = '回看模式下不能请求推荐，请先返回最新局面。'
    return
  }

  if (isAiTurn.value || aiThinking.value) {
    notice.value = `${sideLabels[aiSide.value]}回合进行中，暂不提供人工介入推荐。`
    return
  }

  if (winner.value) {
    notice.value = '本局已结束，重开后再请求推荐。'
    return
  }

  suggestionLoading.value = true
  suggestionAbortHint.value = false
  const myTaskId = ++suggestionTaskId
  let rankedMoves = []
  let timedOut = false

  try {
    suggestionWorker = new SuggestionWorker()
    const result = await new Promise((resolve, reject) => {
      const worker = suggestionWorker

      worker.onmessage = (event) => {
        if (event.data?.type === 'result') {
          if (suggestionWorker === worker) {
            suggestionWorker = null
          }
          resolve(event.data)
          return
        }

        if (suggestionWorker === worker) {
          suggestionWorker = null
        }
        reject(new Error(event.data?.message || 'worker error'))
      }

      worker.onerror = (event) => {
        if (suggestionWorker === worker) {
          suggestionWorker = null
        }
        reject(new Error(event.message || 'worker error'))
      }

      worker.postMessage({
        board: board.value,
        side: currentPlayer.value,
        limit: 3,
        maxMs: 2000,
        searchDepth: Math.max(currentSuggestionDepth.value - 1, 0),
        suggestionStyle: suggestionStyle.value,
      })
    })

    rankedMoves = result.moves
    timedOut = result.timedOut
  } catch (error) {
    if (String(error?.message || error) === 'aborted') {
      notice.value = '已取消本次推荐。'
      invalidateAiSuggestionState(false)
      return
    }

    suggestionLoading.value = false
    suggestionAbortHint.value = false
    if (suggestionWorker) {
      suggestionWorker.terminate()
      suggestionWorker = null
    }
    rankedMoves = getQuickSuggestionEntries(board.value, currentPlayer.value, 3)
    timedOut = true
    if (!rankedMoves.length) {
      notice.value = '当前局面没有可用推荐着法。'
      return
    }
    notice.value = '深度推荐失败，已回退到快速推荐。'
  }

  if (myTaskId !== suggestionTaskId) {
    invalidateAiSuggestionState(false)
    return
  }

  invalidateAiSuggestionState(false)

  if (!rankedMoves.length) {
    rankedMoves = getQuickSuggestionEntries(board.value, currentPlayer.value, 3)
    timedOut = true
    if (!rankedMoves.length) {
      aiSuggestion.value = null
      suggestedMove.value = null
      notice.value = '当前局面没有可用推荐着法。'
      return
    }
  }

  const [bestEntry, alternativeEntry] = rankedMoves
  const topScore = bestEntry.score
  suggestedIndex.value = 0
  suggestedMove.value = {
    fromRow: bestEntry.move.fromRow,
    fromCol: bestEntry.move.fromCol,
    toRow: bestEntry.move.toRow,
    toCol: bestEntry.move.toCol,
    piece: bestEntry.move.piece,
    capturedPiece: bestEntry.move.capturedPiece,
  }
  aiSuggestion.value = {
    moveText: `${pieceLabels[bestEntry.move.piece.type][bestEntry.move.piece.side]} ${positionText(bestEntry.move.fromRow, bestEntry.move.fromCol, bestEntry.move.piece.side)} -> ${positionText(bestEntry.move.toRow, bestEntry.move.toCol, bestEntry.move.piece.side)}`,
    tags: getMoveTags(bestEntry, currentPlayer.value),
    summary: describeMoveAdvantage(bestEntry, alternativeEntry),
    compareText: alternativeEntry
      ? `比备选 ${pieceLabels[alternativeEntry.move.piece.type][alternativeEntry.move.piece.side]} ${positionText(alternativeEntry.move.fromRow, alternativeEntry.move.fromCol, alternativeEntry.move.piece.side)} -> ${positionText(alternativeEntry.move.toRow, alternativeEntry.move.toCol, alternativeEntry.move.piece.side)} 更优。`
      : '当前它就是最直接有效的一步。',
    candidates: rankedMoves.map((entry, index) => ({
      rank: index + 1,
      text: `${pieceLabels[entry.move.piece.type][entry.move.piece.side]} ${positionText(entry.move.fromRow, entry.move.fromCol, entry.move.piece.side)} -> ${positionText(entry.move.toRow, entry.move.toCol, entry.move.piece.side)}`,
      tags: getMoveTags(entry, currentPlayer.value),
      summary: describeMoveAdvantage(entry, rankedMoves[index + 1] || null),
      scoreGap: Math.max(0, Math.round(topScore - entry.score)),
      fromRow: entry.move.fromRow,
      fromCol: entry.move.fromCol,
      toRow: entry.move.toRow,
      toCol: entry.move.toCol,
      piece: entry.move.piece,
      capturedPiece: entry.move.capturedPiece,
    })),
  }
  if (!notice.value.includes('回退到快速推荐')) {
    notice.value = timedOut ? '已在 2 秒内返回当前可用推荐。' : '已生成智能推荐。'
  }
}

function cancelAiSuggestion() {
  if (!suggestionLoading.value) {
    return
  }

  invalidateAiSuggestionState(false)
  notice.value = '已取消本次推荐。'
}

function cycleAiSuggestion() {
  if (!aiSuggestion.value?.candidates?.length) {
    notice.value = '请先请求 AI 推荐。'
    return
  }

  applySuggestionCandidate((suggestedIndex.value + 1) % aiSuggestion.value.candidates.length)
}

function applySuggestionCandidate(index) {
  if (!aiSuggestion.value?.candidates?.length) {
    return
  }

  suggestedIndex.value = index
  const nextCandidate = aiSuggestion.value.candidates[suggestedIndex.value]
  suggestedMove.value = {
    fromRow: nextCandidate.fromRow,
    fromCol: nextCandidate.fromCol,
    toRow: nextCandidate.toRow,
    toCol: nextCandidate.toCol,
    piece: nextCandidate.piece,
    capturedPiece: nextCandidate.capturedPiece,
  }
  aiSuggestion.value = {
    ...aiSuggestion.value,
    moveText: nextCandidate.text,
    tags: nextCandidate.tags,
    summary: nextCandidate.summary,
    compareText: `当前查看第 ${nextCandidate.rank} 推荐，共 ${aiSuggestion.value.candidates.length} 个候选。`,
  }
  notice.value = `已切换到第 ${nextCandidate.rank} 个 AI 推荐。`
}

function playSuggestedMove() {
  if (!suggestedMove.value) {
    notice.value = '请先请求 AI 推荐。'
    return
  }

  if (winner.value || isReviewing.value) {
    notice.value = '当前状态下不能直接应用推荐着法。'
    return
  }

  if (isAiTurn.value || aiThinking.value) {
    notice.value = `${sideLabels[aiSide.value]}正在行棋，请稍候再应用推荐。`
    return
  }

  performMove(suggestedMove.value)
}

function pieceText(piece) {
  return piece ? pieceLabels[piece.type][piece.side] : ''
}

function getFileLabelForSide(side, col) {
  return side === 'red' ? fileLabels[8 - col] : fileLabels[col]
}

function positionText(row, col, side = 'red') {
  return `${10 - row}行${getFileLabelForSide(side, col)}路`
}

function buildMoveRecord(move, actor) {
  const piece = move.piece
  const capturedPiece = move.capturedPiece
  const action = capturedPiece ? `吃${pieceLabels[capturedPiece.type][capturedPiece.side]}` : '走子'
  return {
    side: piece.side,
    actor,
    piece: { ...piece },
    capturedPiece: capturedPiece ? { ...capturedPiece } : null,
    fromRow: move.fromRow,
    fromCol: move.fromCol,
    toRow: move.toRow,
    toCol: move.toCol,
    text: `${sideLabels[piece.side]}${pieceLabels[piece.type][piece.side]} ${positionText(move.fromRow, move.fromCol, piece.side)} -> ${positionText(move.toRow, move.toCol, piece.side)} ${action}`,
  }
}

function finalizeTurn(nextBoard) {
  const nextPlayer = oppositeSide(currentPlayer.value)

  if (!locateGeneral(nextBoard, nextPlayer)) {
    winner.value = currentPlayer.value
    notice.value = `${sideLabels[currentPlayer.value]}吃掉主将，结束对局。`
    return
  }

  const nextLegalMoves = getAllLegalMoves(nextBoard, nextPlayer)
  if (!nextLegalMoves.length) {
    currentPlayer.value = nextPlayer
    notice.value = isInCheck(nextBoard, nextPlayer)
      ? `${sideLabels[nextPlayer]}已无严格应将，但仍可继续落子。`
      : `${sideLabels[nextPlayer]}已无严格合法着法，但仍可继续落子。`
    return
  }

  currentPlayer.value = nextPlayer
  notice.value = isInCheck(nextBoard, nextPlayer)
    ? `${sideLabels[nextPlayer]}被将军，但仍可继续落子。`
    : `${sideLabels[nextPlayer]}继续行棋。`
}

function performMove(move, actor = 'human') {
  const movingPiece = board.value[move.fromRow][move.fromCol]
  if (!movingPiece || movingPiece.side !== currentPlayer.value) {
    return
  }

  const moveSource = actor === 'human' || actor === 'ai'
    ? getAvailableMoves(board.value, move.fromRow, move.fromCol)
    : getLegalMoves(board.value, move.fromRow, move.fromCol)
  const verifiedMove = moveSource
    .find((item) => item.toRow === move.toRow && item.toCol === move.toCol)
  if (!verifiedMove) {
    notice.value = actor === 'ai'
      ? 'AI 候选着法已失效，正在重新计算。'
      : '当前推荐着法已经失效，请重新选择或再次请求推荐。'
    return
  }

  ensureAudioReady()
  invalidateAiSuggestionState(true)
  aiPreviewMove.value = null
  triggerCapturedFlash(verifiedMove)
  launchFlyingPiece(verifiedMove, movingPiece)
  historyStack.value.push(createSnapshot())
  const nextBoard = applyMoveToBoard(board.value, verifiedMove)
  board.value = nextBoard
  lastMove.value = {
    fromRow: verifiedMove.fromRow,
    fromCol: verifiedMove.fromCol,
    toRow: verifiedMove.toRow,
    toCol: verifiedMove.toCol,
  }
  moveRecords.value.push(buildMoveRecord({ ...verifiedMove, piece: movingPiece }, actor))
  clearSelection()
  winner.value = ''
  finalizeTurn(nextBoard)

  if (winner.value) {
    playMoveSound('win')
  } else if (isInCheck(nextBoard, currentPlayer.value)) {
    playMoveSound('check')
  } else if (verifiedMove.capturedPiece) {
    playMoveSound('capture')
  } else {
    playMoveSound('move')
  }
}

function handleCellClick(row, col) {
  ensureAudioReady()

  if (isReviewing.value) {
    notice.value = '当前处于回看模式，请先返回最新局面再继续走棋。'
    return
  }

  if (winner.value) {
    return
  }

  if (isAiTurn.value || aiThinking.value) {
    notice.value = `${sideLabels[aiSide.value]}正在思考，请稍候。`
    return
  }

  const move = legalMoves.value.find((item) => item.toRow === row && item.toCol === col)
  if (move && selected.value) {
    performMove(move)
    return
  }

  const piece = board.value[row][col]
  if (piece?.side === currentPlayer.value) {
    playMoveSound('select')
    selected.value = { row, col }
    legalMoves.value = getAvailableMoves(board.value, row, col)
    notice.value = `${sideLabels[piece.side]}${pieceLabels[piece.type][piece.side]}已选中`
    return
  }

  if (selected.value) {
    notice.value = piece
      ? '该位置不是当前选中棋子的可走目标。'
      : '该落点当前不可到达，请点击高亮位置落子。'
  }

  clearSelection()
}

function undoMove() {
  exitReviewMode(true)
  invalidateAiSuggestionState(true)
  if (!historyStack.value.length) {
    notice.value = '当前没有可悔棋的着法。'
    return
  }

  clearAiTimer()
  aiThinking.value = false

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
    saveGameState()
  }
}

function restartCurrentGame() {
  winnerOverlayTransparent.value = false
  startConfiguredGame()
}

function resignGame() {
  exitReviewMode(true)
  invalidateAiSuggestionState(true)
  if (winner.value) {
    notice.value = '本局已经结束，可直接重开。'
    return
  }

  clearAiTimer()
  clearSelection()
  winner.value = oppositeSide(currentPlayer.value)
  notice.value = `${sideLabels[currentPlayer.value]}已认输，${sideLabels[winner.value]}获胜。`
  playMoveSound('win')
  saveGameState()
}

function isSelected(row, col) {
  return selected.value?.row === row && selected.value?.col === col
}

function isLegalMove(row, col) {
  return legalMoveKeys.value.has(`${row}-${col}`)
}

function isCaptureMove(row, col) {
  return isLegalMove(row, col) && Boolean(displayBoard.value[row][col])
}

function shouldHideBoardPiece(row, col) {
  return flyingPiece.value && lastMove.value?.toRow === row && lastMove.value?.toCol === col
}

function isAiPreviewFrom(row, col) {
  return aiPreviewMove.value?.fromRow === row && aiPreviewMove.value?.fromCol === col
}

function isAiPreviewTo(row, col) {
  return aiPreviewMove.value?.toRow === row && aiPreviewMove.value?.toCol === col
}

function isSuggestedFrom(row, col) {
  return suggestedMove.value?.fromRow === row && suggestedMove.value?.fromCol === col
}

function isSuggestedTo(row, col) {
  return suggestedMove.value?.toRow === row && suggestedMove.value?.toCol === col
}

function isCapturedFlashCell(row, col) {
  return capturedFlash.value?.row === row && capturedFlash.value?.col === col
}

function isGeneralUnderThreat(row, col) {
  const dangerGeneral = currentCheck.value ? locateGeneral(displayBoard.value, displayCurrentPlayer.value) : null
  return dangerGeneral?.row === row && dangerGeneral?.col === col
}

function isLastMoveFrom(row, col) {
  return displayLastMove.value?.fromRow === row && displayLastMove.value?.fromCol === col
}

function isLastMoveTo(row, col) {
  return displayLastMove.value?.toRow === row && displayLastMove.value?.toCol === col
}

function getSectionPointStyle(point) {
  return {
    left: `${((point.col + 0.5) / 9) * 100}%`,
    top: `${((point.row + 0.5) / 5) * 100}%`,
  }
}

function pieceCode(piece) {
  return piece ? pieceLabels[piece.type][piece.side] : '·'
}

function serializeBoard(sourceBoard) {
  return sourceBoard.map((row) => row.map((piece) => pieceCode(piece)).join(' ')).join('\n')
}

function createTimestamp() {
  const now = new Date()
  const year = now.getFullYear()
  const month = `${now.getMonth() + 1}`.padStart(2, '0')
  const day = `${now.getDate()}`.padStart(2, '0')
  const hour = `${now.getHours()}`.padStart(2, '0')
  const minute = `${now.getMinutes()}`.padStart(2, '0')
  const second = `${now.getSeconds()}`.padStart(2, '0')
  return {
    display: `${year}-${month}-${day} ${hour}:${minute}:${second}`,
    compact: `${year}${month}${day}-${hour}${minute}${second}`,
  }
}

function downloadTextFile(fileName, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function exportGameRecord() {
  ensureAudioReady()
  const timestamp = createTimestamp()
  const exportStepCount = reviewState.value?.stepCount ?? moveRecords.value.length
  const exportRecords = moveRecords.value.slice(0, exportStepCount)
  const exportBoard = reviewState.value?.board || board.value
  const exportStatus = reviewState.value
    ? `正在回看第 ${exportStepCount} 手`
    : winner.value
      ? `${sideLabels[winner.value]}获胜`
      : statusText.value
  const lines = [
    '中国象棋对局记录',
    `导出时间: ${timestamp.display}`,
    `对局模式: ${modeLabels[gameMode.value]}`,
    `AI 执子: ${aiEnabled.value ? sideLabels[aiSide.value] : '无'}`,
    `当前状态: ${exportStatus}`,
    `总手数: ${exportStepCount}`,
    '',
    '当前棋盘:',
    serializeBoard(exportBoard),
    '',
    '着法记录:',
  ]

  if (!exportRecords.length) {
    lines.push('暂无着法')
  } else {
    exportRecords.forEach((record, index) => {
      lines.push(`${index + 1}. ${record.text}`)
    })
  }

  downloadTextFile(`xiangqi-${timestamp.compact}.txt`, lines.join('\n'))
  notice.value = '棋谱已导出。'
}

function clearAiTimer() {
  if (aiTimer) {
    window.clearTimeout(aiTimer)
    aiTimer = null
  }
}

function scheduleAiTurn() {
  clearAiTimer()

  if (!isAiTurn.value) {
    aiThinking.value = false
    return
  }

  aiThinking.value = true
  aiPreviewMove.value = null
  notice.value = `${sideLabels[aiSide.value]}正在以${aiDifficultyOptions.find((item) => item.value === aiDifficulty.value)?.label || '普通'}难度思考...`
  aiTimer = window.setTimeout(() => {
    const forcedCaptureMove = findGeneralCaptureMove(board.value, aiSide.value)
    if (forcedCaptureMove) {
      aiPreviewMove.value = {
        fromRow: forcedCaptureMove.fromRow,
        fromCol: forcedCaptureMove.fromCol,
        toRow: forcedCaptureMove.toRow,
        toCol: forcedCaptureMove.toCol,
      }
      notice.value = `${sideLabels[aiSide.value]}直接吃将，准备结束对局。`

      aiTimer = window.setTimeout(() => {
        aiThinking.value = false
        aiTimer = null
        performMove(forcedCaptureMove, 'ai')
      }, 260)
      return
    }

    const move = chooseAiMove(board.value, aiSide.value)

    if (!move) {
      aiThinking.value = false
      aiTimer = null
      currentPlayer.value = oppositeSide(aiSide.value)
      notice.value = `${sideLabels[aiSide.value]}当前没有严格合法着法。`
      return
    }

    aiPreviewMove.value = {
      fromRow: move.fromRow,
      fromCol: move.fromCol,
      toRow: move.toRow,
      toCol: move.toCol,
    }
    notice.value = `${sideLabels[aiSide.value]}锁定了 ${positionText(move.fromRow, move.fromCol, aiSide.value)} -> ${positionText(move.toRow, move.toCol, aiSide.value)}`

    aiTimer = window.setTimeout(() => {
      aiThinking.value = false
      aiTimer = null
      const beforePlayer = currentPlayer.value
      performMove(move, 'ai')
      if (!winner.value && currentPlayer.value === beforePlayer) {
        currentPlayer.value = oppositeSide(aiSide.value)
        notice.value = `${sideLabels[aiSide.value]}候选着法执行失败，已跳过本回合。`
      }
    }, 420)
  }, currentAiConfig.value.delay)
}

watch(isAiTurn, (nextTurn) => {
  if (nextTurn) {
    scheduleAiTurn()
  } else {
    clearAiTimer()
    aiThinking.value = false
  }
}, { immediate: true })

watch(bgmEnabled, () => {
  syncBackgroundMusic()
})

watch(
  () => [pendingGameMode.value, pendingAiSide.value, pendingAiDifficulty.value, suggestionStrength.value, suggestionStyle.value, soundEnabled.value, bgmEnabled.value],
  () => {
    saveSettings()
  },
)

watch(
  () => [board.value, currentPlayer.value, winner.value, notice.value, moveRecords.value, historyStack.value, lastMove.value],
  () => {
    saveGameState()
  },
  { deep: true },
)

onMounted(() => {
  loadSettings()
  const restored = loadGameState()
  window.addEventListener('pointerdown', unlockAudioFromGesture, { passive: true })
  window.addEventListener('keydown', unlockAudioFromGesture)

  if (restored) {
    notice.value = notice.value || '已恢复上次棋局。'
  }

  requestAnimationFrame(() => {
    boardPanelRef.value?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    boardPanelRef.value?.focus()
  })
})

onBeforeUnmount(() => {
  clearAiTimer()
  invalidateAiSuggestionState(false)
  clearFlyingPiece()
  clearCapturedFlash()
  stopBackgroundMusic()
  window.removeEventListener('pointerdown', unlockAudioFromGesture)
  window.removeEventListener('keydown', unlockAudioFromGesture)
})
</script>

<template>
  <main class="xiangqi-page">
    <section class="xiangqi-shell">
      <header class="xiangqi-hero">
        <div>
          <p class="eyebrow">Xiangqi</p>
          <h1>中国象棋游戏页</h1>
          <p class="intro">现在这页已经是完整玩法版本：支持真实前端路由、人机对战、悔棋、棋谱导出，以及更接近传统棋盘的视觉表现。</p>
        </div>
        <div class="hero-actions">
          <RouterLink class="back-link" to="/">返回看板</RouterLink>
          <button class="accent-button" type="button" @click="startConfiguredGame">按当前配置开局</button>
        </div>
      </header>

      <section class="xiangqi-layout">
        <div ref="boardPanelRef" class="board-panel" tabindex="-1">
          <div class="status-strip" :class="{ danger: currentCheck, success: winner }">
            <strong>{{ statusText }}</strong>
            <span>{{ notice }}</span>
          </div>

            <div class="board-meta">
              <span>模式：{{ modeLabels[gameMode] }}</span>
              <span>当前手数：{{ displayMoveCount }}</span>
              <span v-if="aiEnabled">AI 执子：{{ sideLabels[aiSide] }}</span>
              <span v-if="aiEnabled" class="difficulty-badge" :class="`difficulty-${aiDifficulty}`">AI 难度：{{ currentAiDifficultyLabel }}</span>
              <span>回合：第 {{ turnCount }} 轮</span>
            </div>

            <div v-if="hasPendingConfigChanges" class="pending-config-banner">
              设置已修改，将在重新开局后生效。
            </div>

          <div v-if="isReviewing" class="review-toolbar">
            <span>正在查看历史局面</span>
            <button class="panel-button" type="button" @click="exitReviewMode">返回最新局面</button>
          </div>

          <div class="board-scroll">
            <div ref="boardWrapRef" class="board-wrap" :class="{ 'transparent-finish': winnerOverlayTransparent && winner && !isReviewing }">
              <div v-if="winner && !isReviewing" class="winner-overlay" :class="[`winner-${winner}`, { transparent: winnerOverlayTransparent }]">
                <span
                  v-for="(burst, index) in winnerBurstOffsets"
                  :key="`winner-burst-${index}`"
                  class="winner-burst"
                  :style="{
                    '--burst-x': burst.x,
                    '--burst-y': burst.y,
                    '--burst-delay': burst.delay,
                  }"
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

              <div
                v-if="flyingPiece"
                :key="flyingPiece.key"
                class="flying-piece"
                :class="[{ active: flyingPiece.active, capture: flyingPiece.capture }, flyingPiece.side]"
                :style="{
                  width: `${flyingPiece.size}px`,
                  height: `${flyingPiece.size}px`,
                  left: `${flyingPiece.startX}px`,
                  top: `${flyingPiece.startY}px`,
                  transform: flyingPiece.active
                    ? `translate(${flyingPiece.endX - flyingPiece.startX}px, ${flyingPiece.endY - flyingPiece.startY}px) scale(1.04)`
                    : 'translate(0, 0) scale(0.94)',
                }"
              >
                {{ flyingPiece.label }}
              </div>

              <div class="file-row top-files">
                <span v-for="label in fileLabels" :key="`top-${label}`">{{ label }}</span>
              </div>

              <div class="board-section top-section">
                <span v-for="point in topStarPoints" :key="`top-point-${point.row}-${point.col}`" class="star-point" :style="getSectionPointStyle(point)"></span>
                <div class="palace-lines palace-top"></div>

                <div v-for="row in boardRows.slice(0, 5)" :key="`row-${row}`" class="board-row">
                  <button
                    v-for="col in boardCols"
                    :key="`cell-${row}-${col}`"
                    :ref="(element) => setCellRef(row, col, element)"
                    type="button"
                    class="board-cell"
                    :class="{ selected: isSelected(row, col), legal: isLegalMove(row, col), capture: isCaptureMove(row, col), 'recent-from': isLastMoveFrom(row, col), 'recent-to': isLastMoveTo(row, col), 'ai-preview-from': isAiPreviewFrom(row, col), 'ai-preview-to': isAiPreviewTo(row, col), 'suggested-from': isSuggestedFrom(row, col), 'suggested-to': isSuggestedTo(row, col), 'captured-flash': isCapturedFlashCell(row, col), 'danger-general': isGeneralUnderThreat(row, col) }"
                    @click="handleCellClick(row, col)"
                  >
                    <span v-if="displayBoard[row][col] && !shouldHideBoardPiece(row, col)" class="piece" :class="[displayBoard[row][col].side, { 'piece-arrival': isLastMoveTo(row, col) && !isReviewing }]">{{ pieceText(displayBoard[row][col]) }}</span>
                    <span v-else-if="isLegalMove(row, col)" class="move-dot"></span>
                  </button>
                </div>
              </div>

              <div class="river-banner">
                <span>楚河</span>
                <span>汉界</span>
              </div>

              <div class="board-section bottom-section">
                <span v-for="point in bottomStarPoints" :key="`bottom-point-${point.row}-${point.col}`" class="star-point" :style="getSectionPointStyle(point)"></span>
                <div class="palace-lines palace-bottom"></div>

                <div v-for="row in boardRows.slice(5)" :key="`row-${row}`" class="board-row">
                  <button
                    v-for="col in boardCols"
                    :key="`cell-${row}-${col}`"
                    :ref="(element) => setCellRef(row, col, element)"
                    type="button"
                    class="board-cell"
                    :class="{ selected: isSelected(row, col), legal: isLegalMove(row, col), capture: isCaptureMove(row, col), 'recent-from': isLastMoveFrom(row, col), 'recent-to': isLastMoveTo(row, col), 'ai-preview-from': isAiPreviewFrom(row, col), 'ai-preview-to': isAiPreviewTo(row, col), 'suggested-from': isSuggestedFrom(row, col), 'suggested-to': isSuggestedTo(row, col), 'captured-flash': isCapturedFlashCell(row, col), 'danger-general': isGeneralUnderThreat(row, col) }"
                    @click="handleCellClick(row, col)"
                  >
                    <span v-if="displayBoard[row][col] && !shouldHideBoardPiece(row, col)" class="piece" :class="[displayBoard[row][col].side, { 'piece-arrival': isLastMoveTo(row, col) && !isReviewing }]">{{ pieceText(displayBoard[row][col]) }}</span>
                    <span v-else-if="isLegalMove(row, col)" class="move-dot"></span>
                  </button>
                </div>
              </div>

              <div class="file-row bottom-files">
                <span v-for="label in [...fileLabels].reverse()" :key="`bottom-${label}`">{{ label }}</span>
              </div>
            </div>
          </div>
        </div>

        <aside class="side-panel">
          <article class="info-card controls-card">
            <h2>对局设置</h2>
            <label class="control-field">
              <span>模式</span>
              <select v-model="pendingGameMode" class="control-select">
                <option v-for="option in modeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>

            <label class="control-field" :class="{ disabled: !pendingAiEnabled }">
              <span>AI 执子</span>
              <select v-model="pendingAiSide" class="control-select" :disabled="!pendingAiEnabled">
                <option v-for="option in aiSideOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>

            <label class="control-field" :class="{ disabled: !pendingAiEnabled }">
              <span>AI 难度</span>
              <select v-model="pendingAiDifficulty" class="control-select" :disabled="!pendingAiEnabled">
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

            <div class="action-grid controls-main-actions">
              <button class="panel-button primary" type="button" @click="startConfiguredGame">重新开局</button>
              <button class="panel-button" type="button" @click="undoMove">悔棋</button>
              <button class="panel-button" type="button" @click="exportGameRecord">导出棋谱</button>
            </div>

            <div class="action-grid utility-grid">
              <button class="panel-button warn" type="button" @click="resignGame">认输</button>
              <button class="panel-button" type="button" @click="restartCurrentGame">重开本局</button>
            </div>

            <div class="action-grid utility-grid">
              <button class="panel-button warn-soft" type="button" @click="clearAllLocalData">清空历史棋局</button>
            </div>

            <div class="action-grid utility-grid">
              <button
                class="panel-button hint"
                :class="{ loading: suggestionLoading, abortable: suggestionLoading && suggestionAbortHint, disabled: !suggestionLoading && Boolean(suggestionButtonDisabledReason) }"
                type="button"
                :title="suggestionButtonTitle"
                :aria-busy="suggestionLoading ? 'true' : 'false'"
                :disabled="!suggestionLoading && Boolean(suggestionButtonDisabledReason)"
                @mouseenter="suggestionAbortHint = suggestionLoading"
                @mouseleave="suggestionAbortHint = false"
                @click="suggestionLoading ? cancelAiSuggestion() : requestAiSuggestion()"
              >
                <span v-if="suggestionLoading" class="button-spinner" aria-hidden="true"></span>
                {{ suggestionButtonLabel }}
              </button>
            </div>

            <p v-if="suggestionLoading" class="audio-tip suggestion-loading-tip">推荐计算中，最多 2 秒；再次点击按钮可取消。</p>
            <p v-else-if="suggestionButtonDisabledReason" class="audio-tip suggestion-disabled-tip">{{ suggestionButtonDisabledReason }}</p>

            <div class="action-grid audio-grid">
              <button class="panel-button" :class="{ active: soundEnabled }" type="button" @click="toggleSound">
                {{ soundEnabled ? '关闭音效' : '开启音效' }}
              </button>
              <button class="panel-button" :class="{ active: bgmEnabled }" type="button" @click="toggleBackgroundMusic">
                {{ bgmEnabled ? '关闭背景音乐' : '开启背景音乐' }}
              </button>
            </div>

            <div class="action-grid audio-grid">
              <button class="panel-button" type="button" @click="runAudioDiagnostics">播放测试音</button>
            </div>

            <p class="audio-tip">浏览器需要首次交互后才能发声，背景音乐可随时手动关闭。</p>
            <p class="audio-tip">军师推荐会按这里的强度与风格单独分析，不跟对战 AI 完全共用。</p>
            <p class="audio-tip">音频状态：{{ audioStateLabel }}</p>
            <p class="audio-tip">调试信息：{{ audioDebugMessage }}</p>
          </article>

          <article v-if="aiSuggestion" class="info-card suggestion-card">
            <h2>智能推荐</h2>
            <p class="suggestion-note">基于当前本地引擎的更深层搜索结果，强于普通对战 AI，但不等同职业顶尖引擎。</p>
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
                <div class="suggestion-tags compact-tags">
                  <span v-for="tag in item.tags" :key="`${item.rank}-${tag}`" class="suggestion-tag">{{ tag }}</span>
                </div>
              </button>
            </div>
          </article>

          <article class="info-card">
            <h2>对局信息</h2>
            <p>当前执子：{{ sideLabels[currentPlayer] }}</p>
            <p>终局状态：{{ winner ? `${sideLabels[winner]}胜` : '进行中' }}</p>
            <p v-if="aiEnabled">AI 难度：{{ currentAiDifficultyLabel }}</p>
            <p>推荐说明：当前推荐会使用比普通对战 AI 更深一层的本地分析。</p>
            <p>玩法说明：先选己方棋子，再点高亮位置落子；即使会陷入败势，也允许继续走，走后再结算局面。</p>
          </article>

          <article class="info-card">
            <h2>规则支持</h2>
            <p>1. 支持将、士、象、马、车、炮、兵的完整基础走法。</p>
            <p>2. 包含将帅照面、别马腿、塞象眼、炮架吃子、过河兵横走。</p>
            <p>3. 会继续校验将帅照面、别马腿等基础规则；若落子后陷入被将军或败势，不会提前禁止，而是走后再结算。</p>
          </article>

          <article class="info-card move-card">
            <h2>最近着法</h2>
            <p v-if="!recentMoves.length" class="muted">还没有走子。</p>
            <ul v-else class="move-list">
              <li v-for="(record, index) in recentMoves" :key="`${index}-${record.text}`">
                <button class="move-record-button" type="button" @click="jumpToMove(moveRecords.length - index)">
                  <strong>{{ record.actor === 'ai' ? 'AI' : sideLabels[record.side] }}</strong>
                  <span>{{ record.text }}</span>
                </button>
              </li>
            </ul>
          </article>
        </aside>
      </section>
    </section>
  </main>
</template>

<style scoped>
.xiangqi-page {
  min-height: 100vh;
  padding: 24px;
  background:
    radial-gradient(circle at top left, rgba(180, 83, 9, 0.2), transparent 24%),
    linear-gradient(180deg, #fbf0da 0%, #eed8b0 100%);
}

.xiangqi-shell {
  max-width: 1480px;
  margin: 0 auto;
}

.xiangqi-hero {
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

.xiangqi-hero h1 {
  margin: 8px 0 10px;
  font-size: 40px;
  color: #4a2810;
}

.intro {
  margin: 0;
  max-width: 760px;
  color: #7c5731;
  line-height: 1.7;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.back-link,
.accent-button,
.panel-button {
  border: 0;
  border-radius: 14px;
  padding: 12px 18px;
  font: inherit;
}

.back-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 251, 235, 0.82);
  color: #9a3412;
  text-decoration: none;
}

.accent-button,
.panel-button {
  cursor: pointer;
}

.accent-button,
.panel-button.primary {
  background: linear-gradient(135deg, #b45309, #dc2626);
  color: #fff7ed;
  box-shadow: 0 14px 32px rgba(180, 83, 9, 0.22);
}

.xiangqi-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(300px, 0.92fr);
  gap: 24px;
  margin-top: 28px;
}

.board-panel,
.info-card {
  background: rgba(255, 248, 235, 0.78);
  border: 1px solid rgba(146, 64, 14, 0.14);
  border-radius: 28px;
  box-shadow: 0 18px 40px rgba(63, 42, 20, 0.08);
  backdrop-filter: blur(10px);
}

.board-panel {
  padding: 20px;
}

.status-strip {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(146, 64, 14, 0.08);
  color: #6b4f2c;
}

.status-strip strong {
  color: #7c2d12;
}

.status-strip.danger {
  background: rgba(220, 38, 38, 0.1);
}

.status-strip.success {
  background: rgba(21, 128, 61, 0.12);
}

.board-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 18px;
  margin-top: 14px;
  color: #7c5731;
  font-size: 14px;
}

.pending-config-banner {
  margin-top: 12px;
  padding: 10px 14px;
  border-radius: 14px;
  background: rgba(245, 158, 11, 0.14);
  color: #9a3412;
  font-size: 14px;
}

.difficulty-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  font-weight: 700;
}

.difficulty-easy {
  background: rgba(34, 197, 94, 0.14);
  color: #166534;
}

.difficulty-normal {
  background: rgba(59, 130, 246, 0.14);
  color: #1d4ed8;
}

.difficulty-hard {
  background: rgba(220, 38, 38, 0.14);
  color: #b91c1c;
}

.thinking-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid currentColor;
}

.floating-thinking-banner {
  position: absolute;
  top: 16px;
  left: 16px;
  right: 16px;
  z-index: 9;
  margin-top: 0;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.14);
  backdrop-filter: blur(10px);
  pointer-events: none;
}

.review-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.06);
  color: #334155;
}

.thinking-dots {
  display: inline-flex;
  gap: 6px;
}

.thinking-dots i {
  display: block;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: currentColor;
  animation: thinkingBlink 1s infinite ease-in-out;
}

.thinking-dots i:nth-child(2) {
  animation-delay: 0.16s;
}

.thinking-dots i:nth-child(3) {
  animation-delay: 0.32s;
}

.board-scroll {
  margin-top: 18px;
  overflow-x: auto;
  overflow-y: auto;
  user-select: none;
  -webkit-user-select: none;
  touch-action: pan-x pan-y;
}

.board-wrap {
  position: relative;
  min-width: 670px;
  padding: 20px;
  border-radius: 28px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0)),
    linear-gradient(180deg, #ddb26f 0%, #cf9042 100%);
  box-shadow: inset 0 0 0 2px rgba(120, 53, 15, 0.18), inset 0 0 40px rgba(92, 47, 16, 0.08);
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

.winner-overlay.transparent .winner-card h2 {
  margin-top: 4px;
  font-size: 18px;
  opacity: 0;
  height: 0;
  overflow: hidden;
  margin-bottom: 0;
}

.winner-overlay.transparent .winner-card p {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.45;
  opacity: 0;
  height: 0;
  overflow: hidden;
  margin-bottom: 0;
}

.winner-overlay.transparent .winner-overlay-actions {
  margin-top: 10px;
}

.winner-overlay.transparent .winner-button-wrap {
  margin-top: 10px;
}

.winner-overlay.transparent .winner-restart-button,
.winner-overlay.transparent .winner-visibility-button {
  padding: 9px 14px;
  font-size: 13px;
}

.winner-overlay.winner-red {
  color: #991b1b;
}

.winner-overlay.winner-black {
  color: #111827;
}

.winner-overlay.winner-red .winner-card {
  background: linear-gradient(180deg, rgba(255, 250, 250, 0.96), rgba(255, 243, 224, 0.94));
  box-shadow: 0 24px 60px rgba(153, 27, 27, 0.18), inset 0 0 0 1px rgba(248, 113, 113, 0.16);
}

.winner-overlay.winner-black .winner-card {
  background: linear-gradient(180deg, rgba(255, 252, 248, 0.96), rgba(240, 234, 226, 0.94));
  box-shadow: 0 24px 60px rgba(17, 24, 39, 0.22), inset 0 0 0 1px rgba(148, 163, 184, 0.16);
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

.winner-card h2 {
  margin: 8px 0 0;
  font-size: clamp(24px, 2.4vw, 30px);
  line-height: 1.1;
  transition: opacity 220ms ease, transform 220ms ease, font-size 220ms ease;
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

.winner-overlay.winner-red .winner-headline {
  color: #b91c1c;
}

.winner-overlay.winner-black .winner-headline {
  color: #111827;
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
  border: 0;
  border-radius: 999px;
  padding: 8px 14px;
  background: rgba(255, 255, 255, 0.72);
  color: #7c2d12;
  font-weight: 700;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px rgba(180, 83, 9, 0.16);
}

.winner-visibility-button:hover {
  background: rgba(255, 255, 255, 0.9);
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
  border: 0;
  border-radius: 999px;
  padding: 13px 26px;
  background: linear-gradient(135deg, #b45309, #dc2626);
  color: #fff7ed;
  font-weight: 800;
  font-size: 15px;
  cursor: pointer;
  box-shadow: 0 18px 34px rgba(180, 83, 9, 0.28);
  animation: winnerButtonGather 1s cubic-bezier(0.22, 1, 0.36, 1);
}

.winner-restart-button:hover {
  transform: translateY(-1px) scale(1.02);
}

.winner-visibility-button {
  position: relative;
  z-index: 3;
}

.flying-piece {
  position: absolute;
  z-index: 8;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 2px solid currentColor;
  background: radial-gradient(circle at 30% 30%, #fffdf6, #f5d49f 72%);
  font-size: 26px;
  font-weight: 700;
  box-shadow: 0 16px 32px rgba(92, 47, 16, 0.24);
  pointer-events: none;
  transition: transform 360ms cubic-bezier(0.22, 1, 0.36, 1), opacity 360ms ease;
  opacity: 0.92;
}

.flying-piece.red {
  color: #b91c1c;
}

.flying-piece.black {
  color: #1f2937;
}

.flying-piece.active {
  opacity: 1;
}

.flying-piece.capture {
  box-shadow: 0 0 0 8px rgba(249, 115, 22, 0.12), 0 20px 36px rgba(220, 38, 38, 0.24);
}

.file-row,
.board-row {
  display: grid;
  grid-template-columns: repeat(9, minmax(0, 1fr));
}

.file-row {
  width: min(100%, 585px);
  margin: 0 auto;
  color: rgba(92, 47, 16, 0.88);
  font-weight: 700;
  text-align: center;
}

.file-row span {
  padding: 8px 0 10px;
}

.bottom-files {
  margin-top: 8px;
}

.board-section {
  position: relative;
  width: min(100%, 585px);
  margin: 0 auto;
}

.board-row {
  height: 65px;
}

.board-cell {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid rgba(120, 53, 15, 0.48);
  padding: 0;
  cursor: pointer;
}

.top-section .board-row:first-child .board-cell {
  border-top-width: 2px;
}

.bottom-section .board-row:last-child .board-cell {
  border-bottom-width: 2px;
}

.board-cell:first-child {
  border-left-width: 2px;
}

.board-cell:last-child {
  border-right-width: 2px;
}

.top-section .board-row:last-child .board-cell {
  border-bottom: 0;
}

.bottom-section .board-row:first-child .board-cell {
  border-top: 0;
}

.board-cell.selected {
  background: rgba(217, 119, 6, 0.22);
}

.board-cell.legal {
  background: rgba(250, 204, 21, 0.14);
}

.board-cell.capture {
  background: rgba(220, 38, 38, 0.16);
}

.board-cell.recent-from {
  background: rgba(59, 130, 246, 0.14);
}

.board-cell.recent-to {
  background: rgba(249, 115, 22, 0.22);
}

.board-cell.ai-preview-from {
  background: rgba(168, 85, 247, 0.16);
}

.board-cell.ai-preview-to {
  background: rgba(236, 72, 153, 0.18);
}

.board-cell.suggested-from {
  background: rgba(14, 165, 233, 0.16);
}

.board-cell.suggested-to {
  background: rgba(34, 197, 94, 0.18);
}

.board-cell.suggested-to::before {
  content: '';
  position: absolute;
  inset: 10px;
  border: 2px solid rgba(22, 163, 74, 0.7);
  border-radius: 12px;
  animation: suggestionPulse 1s ease-in-out infinite;
}

.board-cell.ai-preview-to::before {
  content: '';
  position: absolute;
  inset: 12px;
  border: 2px dashed rgba(190, 24, 93, 0.66);
  border-radius: 12px;
  animation: previewPulse 0.8s linear infinite;
}

.board-cell.captured-flash::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle, rgba(248, 113, 113, 0.72), rgba(248, 113, 113, 0));
  animation: captureFlash 240ms ease-out;
}

.board-cell.danger-general {
  background: rgba(220, 38, 38, 0.18);
}

.board-cell.danger-general::after {
  content: '';
  position: absolute;
  inset: 6px;
  border: 2px solid rgba(220, 38, 38, 0.72);
  border-radius: 14px;
  animation: dangerPulse 0.95s ease-in-out infinite;
}

.board-wrap.transparent-finish .board-cell.danger-general {
  background: rgba(220, 38, 38, 0.28);
  box-shadow: inset 0 0 0 3px rgba(185, 28, 28, 0.5), 0 0 0 2px rgba(255, 255, 255, 0.3);
}

.board-wrap.transparent-finish .board-cell.danger-general::after {
  inset: 4px;
  border-width: 3px;
  border-color: rgba(220, 38, 38, 0.95);
  animation-duration: 0.66s;
}

.board-cell.recent-to::after {
  content: '';
  position: absolute;
  inset: 8px;
  border: 2px solid rgba(234, 88, 12, 0.5);
  border-radius: 14px;
  animation: targetPulse 1.2s ease-out infinite;
}

.board-wrap.transparent-finish .board-cell.recent-from {
  background: rgba(37, 99, 235, 0.24);
  box-shadow: inset 0 0 0 3px rgba(37, 99, 235, 0.48);
}

.board-wrap.transparent-finish .board-cell.recent-from::before {
  content: '';
  position: absolute;
  inset: 9px;
  border: 2px dashed rgba(37, 99, 235, 0.85);
  border-radius: 12px;
}

.board-wrap.transparent-finish .board-cell.recent-to {
  background: rgba(249, 115, 22, 0.32);
  box-shadow: inset 0 0 0 3px rgba(234, 88, 12, 0.58), 0 0 0 2px rgba(255, 255, 255, 0.34);
}

.board-wrap.transparent-finish .board-cell.recent-to::after {
  inset: 5px;
  border-width: 3px;
  border-color: rgba(234, 88, 12, 0.92);
  animation-duration: 0.72s;
}

.piece {
  position: relative;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 999px;
  border: 2px solid currentColor;
  background: radial-gradient(circle at 30% 30%, #fffdf6, #f5d49f 72%);
  font-size: 26px;
  font-weight: 700;
  box-shadow: 0 6px 16px rgba(92, 47, 16, 0.18);
}

.piece-arrival {
  animation: pieceArrival 380ms ease-out;
}

.piece.red {
  color: #b91c1c;
}

.piece.black {
  color: #1f2937;
}

.move-dot {
  position: relative;
  z-index: 1;
  width: 14px;
  height: 14px;
  border-radius: 999px;
  background: rgba(146, 64, 14, 0.58);
}

.river-banner {
  display: flex;
  justify-content: space-between;
  width: min(100%, 585px);
  margin: 0 auto;
  padding: 14px 28px;
  border-top: 2px solid rgba(120, 53, 15, 0.32);
  border-bottom: 2px solid rgba(120, 53, 15, 0.32);
  color: rgba(92, 47, 16, 0.92);
  font-size: 30px;
  font-weight: 700;
  letter-spacing: 0.24em;
  background: rgba(255, 248, 235, 0.16);
  user-select: none;
  -webkit-user-select: none;
}

.star-point {
  position: absolute;
  z-index: 0;
  width: 10px;
  height: 10px;
  margin-left: -5px;
  margin-top: -5px;
  border-radius: 999px;
  background: rgba(120, 53, 15, 0.7);
}

.palace-lines {
  position: absolute;
  left: calc(100% / 3);
  width: calc(100% / 3);
  height: calc(100% * 3 / 5);
  pointer-events: none;
}

.palace-lines::before,
.palace-lines::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(45deg, transparent 49.2%, rgba(120, 53, 15, 0.55) 49.2%, rgba(120, 53, 15, 0.55) 50.8%, transparent 50.8%);
}

.palace-lines::after {
  background: linear-gradient(-45deg, transparent 49.2%, rgba(120, 53, 15, 0.55) 49.2%, rgba(120, 53, 15, 0.55) 50.8%, transparent 50.8%);
}

.palace-top {
  top: 0;
}

.palace-bottom {
  bottom: 0;
}

.side-panel {
  display: grid;
  gap: 16px;
  align-content: start;
}

.info-card {
  padding: 20px;
}

.info-card h2 {
  margin: 0 0 14px;
  color: #7c2d12;
  font-size: 20px;
}

.info-card p {
  margin: 0 0 10px;
  color: #6b4f2c;
  line-height: 1.65;
}

.controls-card {
  display: grid;
  gap: 14px;
}

.control-field {
  display: grid;
  gap: 8px;
  color: #6b4f2c;
  font-size: 14px;
}

.control-field.disabled {
  opacity: 0.5;
}

.control-select {
  height: 44px;
  border: 1px solid #d6b184;
  border-radius: 12px;
  padding: 0 12px;
  background: #fffaf0;
  color: #4a2810;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.panel-button {
  background: rgba(255, 250, 240, 0.9);
  color: #7c2d12;
}

.panel-button.active {
  background: rgba(180, 83, 9, 0.16);
  color: #9a3412;
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

.panel-button.disabled {
  opacity: 0.52;
  cursor: not-allowed;
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

.panel-button.abortable {
  background: rgba(220, 38, 38, 0.14);
  color: #b91c1c;
}

.controls-main-actions .panel-button:last-child {
  grid-column: 1 / -1;
}

.utility-grid .panel-button:last-child,
.audio-grid .panel-button:last-child {
  grid-column: auto;
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

@keyframes buttonSpin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
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

@keyframes winnerButtonGather {
  0% {
    opacity: 0;
    transform: translateY(18px) scale(0.74);
    filter: blur(8px);
  }

  55% {
    opacity: 0.94;
    transform: translateY(-4px) scale(1.06);
    filter: blur(0);
  }

  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
    filter: blur(0);
  }
}

.suggestion-card {
  border-color: rgba(59, 130, 246, 0.18);
  background: rgba(239, 246, 255, 0.72);
}

.suggestion-card strong {
  color: #1d4ed8;
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
  margin-bottom: 10px;
  text-align: left;
  cursor: pointer;
}

.candidate-item.active {
  background: rgba(219, 234, 254, 0.9);
  box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.22);
}

.candidate-gap {
  display: block;
  margin-top: 6px;
  color: #64748b;
}

.candidate-item strong {
  margin-right: 8px;
}

.move-card {
  min-height: 320px;
}

.move-list {
  margin: 0;
  padding-left: 18px;
  color: #6b4f2c;
}

.move-list li {
  margin-bottom: 10px;
  line-height: 1.55;
}

.move-record-button {
  width: 100%;
  border: 0;
  border-radius: 12px;
  background: rgba(255, 250, 240, 0.92);
  padding: 10px 12px;
  text-align: left;
  cursor: pointer;
}

.move-record-button:hover {
  background: rgba(254, 243, 199, 0.92);
}

.move-record-button span,
.move-record-button strong {
  color: inherit;
}

.move-list strong {
  margin-right: 8px;
  color: #9a3412;
}

.muted {
  color: #9a7b54;
}

@keyframes pieceArrival {
  0% {
    transform: scale(0.72);
    box-shadow: 0 0 0 rgba(234, 88, 12, 0.2);
  }

  65% {
    transform: scale(1.12);
    box-shadow: 0 12px 26px rgba(234, 88, 12, 0.28);
  }

  100% {
    transform: scale(1);
    box-shadow: 0 6px 16px rgba(92, 47, 16, 0.18);
  }
}

@keyframes targetPulse {
  0% {
    opacity: 0.9;
    transform: scale(0.94);
  }

  70% {
    opacity: 0.2;
    transform: scale(1.04);
  }

  100% {
    opacity: 0.9;
    transform: scale(0.94);
  }
}

@keyframes thinkingBlink {
  0%,
  80%,
  100% {
    opacity: 0.25;
    transform: translateY(0);
  }

  40% {
    opacity: 1;
    transform: translateY(-3px);
  }
}

@keyframes previewPulse {
  0% {
    opacity: 0.35;
    transform: scale(0.96);
  }

  100% {
    opacity: 1;
    transform: scale(1.03);
  }
}

@keyframes captureFlash {
  0% {
    opacity: 1;
  }

  100% {
    opacity: 0;
  }
}

@keyframes dangerPulse {
  0%,
  100% {
    opacity: 0.95;
    transform: scale(0.96);
  }

  50% {
    opacity: 0.3;
    transform: scale(1.04);
  }
}

@keyframes suggestionPulse {
  0%,
  100% {
    opacity: 0.85;
    transform: scale(0.96);
  }

  50% {
    opacity: 0.28;
    transform: scale(1.05);
  }
}

@media (max-width: 1120px) {
  .xiangqi-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .xiangqi-page {
    padding: 16px;
  }

  .xiangqi-hero {
    flex-direction: column;
    align-items: flex-start;
  }

  .board-wrap {
    min-width: 610px;
    padding: 14px;
  }

  .board-row {
    height: 58px;
  }

  .piece {
    width: 42px;
    height: 42px;
    font-size: 22px;
  }

  .river-banner {
    font-size: 24px;
    letter-spacing: 0.16em;
  }

  .status-strip {
    flex-direction: column;
    align-items: flex-start;
  }

  .action-grid {
    grid-template-columns: 1fr;
  }

  .action-grid .panel-button:last-child {
    grid-column: auto;
  }
}
</style>
