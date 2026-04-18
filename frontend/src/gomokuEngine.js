const boardSize = 15
const directions = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
]
const openThreePatterns = ['0011100', '011100', '001110', '010110', '011010', '0010110', '0110100']
const openFourPatterns = ['011110']
const fourThreatPatterns = ['011110', '211110', '011112', '0101110', '0110110', '0111010', '10111', '11011', '11101', '01111', '11110']
const maxSearchCacheSize = 18000

function cloneBoard(sourceBoard) {
  return sourceBoard.map((row) => [...row])
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

function getNow() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
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

function getDirectionCells(sourceBoard, row, col, rowStep, colStep, side) {
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

  return cells
}

function buildDirectionString(sourceBoard, row, col, rowStep, colStep, side, distance = 4) {
  let output = ''
  for (let offset = -distance; offset <= distance; offset += 1) {
    const nextRow = row + rowStep * offset
    const nextCol = col + colStep * offset
    if (!isInsideBoard(nextRow, nextCol)) {
      output += '2'
      continue
    }
    const cell = sourceBoard[nextRow][nextCol]
    if (!cell) {
      output += '0'
    } else if (cell === side) {
      output += '1'
    } else {
      output += '2'
    }
  }
  return output
}

function countPatternHits(line, patterns) {
  return patterns.reduce((total, pattern) => total + (line.includes(pattern) ? 1 : 0), 0)
}

function analyzeMovePatterns(sourceBoard, row, col, side) {
  const analysis = {
    maxLine: 0,
    overline: false,
    openFourCount: 0,
    fourThreatCount: 0,
    openThreeCount: 0,
  }

  for (const [rowStep, colStep] of directions) {
    const cells = getDirectionCells(sourceBoard, row, col, rowStep, colStep, side)
    analysis.maxLine = Math.max(analysis.maxLine, cells.length)
    if (cells.length > 5) {
      analysis.overline = true
    }
    const line = buildDirectionString(sourceBoard, row, col, rowStep, colStep, side)
    analysis.openFourCount += countPatternHits(line, openFourPatterns)
    analysis.fourThreatCount += countPatternHits(line, fourThreatPatterns)
    analysis.openThreeCount += countPatternHits(line, openThreePatterns)
  }

  return analysis
}

function getForbiddenReason(sourceBoard, move, side, forbiddenRulesActive) {
  if (!forbiddenRulesActive || side !== 'black') {
    return ''
  }
  if (sourceBoard[move.row][move.col]) {
    return '已有棋子'
  }

  const nextBoard = cloneBoard(sourceBoard)
  nextBoard[move.row][move.col] = side
  const analysis = analyzeMovePatterns(nextBoard, move.row, move.col, side)
  if (analysis.maxLine === 5) {
    return ''
  }
  if (analysis.overline) {
    return '长连禁手'
  }
  if (analysis.openFourCount >= 2 || analysis.fourThreatCount >= 2) {
    return '双四禁手'
  }
  if (analysis.openThreeCount >= 2) {
    return '双三禁手'
  }
  return ''
}

function isLegalMove(sourceBoard, move, side, forbiddenRulesActive) {
  return !getForbiddenReason(sourceBoard, move, side, forbiddenRulesActive)
}

function hasFiveInRow(sourceBoard, row, col, side) {
  return directions.some(([rowStep, colStep]) => getDirectionCells(sourceBoard, row, col, rowStep, colStep, side).length >= 5)
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

function getBlockedEnemyWinCount(sourceBoard, move, side, forbiddenRulesActive) {
  const enemySide = oppositeSide(side)
  let total = 0
  for (const enemyMove of getCandidateMoves(sourceBoard, 1)) {
    if (!isLegalMove(sourceBoard, enemyMove, enemySide, forbiddenRulesActive)) {
      continue
    }
    const enemyBoard = cloneBoard(sourceBoard)
    enemyBoard[enemyMove.row][enemyMove.col] = enemySide
    if (analyzeMovePatterns(enemyBoard, enemyMove.row, enemyMove.col, enemySide).maxLine >= 5) {
      total += 1
    }
  }

  const boardWithoutThreat = cloneBoard(sourceBoard)
  boardWithoutThreat[move.row][move.col] = side
  let remaining = 0
  for (const enemyMove of getCandidateMoves(boardWithoutThreat, 1)) {
    if (!isLegalMove(boardWithoutThreat, enemyMove, enemySide, forbiddenRulesActive)) {
      continue
    }
    const enemyBoard = cloneBoard(boardWithoutThreat)
    enemyBoard[enemyMove.row][enemyMove.col] = enemySide
    if (analyzeMovePatterns(enemyBoard, enemyMove.row, enemyMove.col, enemySide).maxLine >= 5) {
      remaining += 1
    }
  }

  return Math.max(0, total - remaining)
}

function buildScoreSummary(analysis, move) {
  const points = []
  if (analysis.selfPattern.maxLine >= 5) {
    points.push('直接胜势')
  }
  if (analysis.blockedWins > 0) {
    points.push(`封堵 ${analysis.blockedWins} 处胜点`)
  }
  if (analysis.selfPattern.openFourCount > 0 || analysis.selfPattern.fourThreatCount > 0) {
    points.push('形成四连强攻')
  }
  if (analysis.selfPattern.openThreeCount >= 2) {
    points.push('双活三推进')
  } else if (analysis.selfPattern.openThreeCount > 0) {
    points.push('保留活三后续')
  }
  if (!points.length && Math.abs(move.row - 7) + Math.abs(move.col - 7) <= 3) {
    points.push('控制中腹')
  }
  if (!points.length) {
    points.push('兼顾形状与先手')
  }
  return points.slice(0, 2).join('，')
}

function scoreMove(sourceBoard, move, side, style = 'balanced', forbiddenRulesActive = false) {
  const forbiddenReason = getForbiddenReason(sourceBoard, move, side, forbiddenRulesActive)
  if (forbiddenReason) {
    return {
      score: Number.NEGATIVE_INFINITY,
      forbiddenReason,
      tags: ['禁手'],
      summary: `该点在当前规则下属于${forbiddenReason}。`,
      analysis: null,
    }
  }

  const nextBoard = cloneBoard(sourceBoard)
  nextBoard[move.row][move.col] = side
  const enemySide = oppositeSide(side)
  const selfPattern = analyzeMovePatterns(nextBoard, move.row, move.col, side)
  const defendBoard = cloneBoard(sourceBoard)
  defendBoard[move.row][move.col] = enemySide
  const enemyAtMove = analyzeMovePatterns(defendBoard, move.row, move.col, enemySide)
  const blockedWins = enemyAtMove.maxLine >= 5 ? 1 : getBlockedEnemyWinCount(sourceBoard, move, side, forbiddenRulesActive)
  const nearby = countNearbyStones(sourceBoard, move.row, move.col, 2)
  const centerBias = 18 - (Math.abs(move.row - 7) + Math.abs(move.col - 7))
  const pressureScore = selfPattern.openFourCount * 22000 + selfPattern.fourThreatCount * 7800 + selfPattern.openThreeCount * 3200
  const defendScore = blockedWins * 26000 + enemyAtMove.openFourCount * 5200 + enemyAtMove.openThreeCount * 2100
  const lineScore = selfPattern.maxLine * 900 + getLineScore(nextBoard, move.row, move.col, side) * 180

  let score = pressureScore + defendScore + lineScore + nearby * 12 + centerBias * 6
  if (selfPattern.maxLine >= 5) {
    score += 200000
  }
  if (selfPattern.overline) {
    score -= 30000
  }
  if (style === 'aggressive') {
    score += selfPattern.openFourCount * 2400 + selfPattern.openThreeCount * 900 + selfPattern.maxLine * 120
  }
  if (style === 'defensive') {
    score += blockedWins * 4200 + enemyAtMove.openFourCount * 1400 + enemyAtMove.openThreeCount * 700
  }

  const tags = []
  if (selfPattern.maxLine >= 5) {
    tags.push('胜势')
  }
  if (blockedWins > 0) {
    tags.push('防守')
  }
  if (selfPattern.openFourCount > 0 || selfPattern.fourThreatCount > 0) {
    tags.push('进攻')
  }
  if (selfPattern.openThreeCount >= 2) {
    tags.push('双三')
  } else if (selfPattern.openThreeCount > 0) {
    tags.push('活三')
  }
  if (!tags.length && Math.abs(move.row - 7) + Math.abs(move.col - 7) <= 3) {
    tags.push('中心')
  }

  return {
    score,
    forbiddenReason: '',
    tags: tags.slice(0, 3),
    summary: buildScoreSummary({ selfPattern, blockedWins }, move),
    analysis: {
      selfPattern,
      blockedWins,
    },
  }
}

function evaluateBoardForSide(sourceBoard, side, radius = 2, forbiddenRulesActive = false) {
  const moves = getCandidateMoves(sourceBoard, radius)
  if (!moves.length) {
    return 0
  }

  let best = Number.NEGATIVE_INFINITY
  for (const move of moves) {
    const evaluation = scoreMove(sourceBoard, move, side, 'balanced', forbiddenRulesActive)
    if (!Number.isFinite(evaluation.score)) {
      continue
    }
    best = Math.max(best, evaluation.score)
  }

  return Number.isFinite(best) ? best : -200000
}

function getSearchCandidates(sourceBoard, side, options = {}) {
  const radius = options.radius ?? 2
  const breadth = options.breadth ?? 6
  return getCandidateMoves(sourceBoard, radius)
    .map((move) => {
      const evaluation = scoreMove(sourceBoard, move, side, options.style || 'balanced', options.forbiddenRulesActive)
      return { move, evaluation }
    })
    .filter((entry) => Number.isFinite(entry.evaluation.score))
    .sort((left, right) => right.evaluation.score - left.evaluation.score)
    .slice(0, breadth)
}

function evaluateTerminalState(sourceBoard, lastMove, sideToCheck) {
  if (!lastMove) {
    return null
  }
  const side = sourceBoard[lastMove.row][lastMove.col]
  if (!side) {
    return null
  }
  if (hasFiveInRow(sourceBoard, lastMove.row, lastMove.col, side)) {
    return side === sideToCheck ? 900000 : -900000
  }
  return null
}

function serializeBoardState(sourceBoard, turnSide) {
  return `${turnSide}|${sourceBoard.map((row) => row.map((cell) => (cell === 'black' ? 'b' : cell === 'white' ? 'w' : '.')).join('')).join('/')}`
}

function setSearchCache(cache, key, value) {
  if (cache.size >= maxSearchCacheSize) {
    const firstKey = cache.keys().next().value
    if (firstKey) {
      cache.delete(firstKey)
    }
  }
  cache.set(key, value)
}

function collectForcedMoves(sourceBoard, side, options = {}) {
  const candidates = getSearchCandidates(sourceBoard, side, {
    radius: options.radius ?? 2,
    breadth: options.breadth ?? 10,
    style: options.style || 'balanced',
    forbiddenRulesActive: options.forbiddenRulesActive,
  })
  const immediateWins = candidates.filter((entry) => entry.evaluation.analysis?.selfPattern?.maxLine >= 5)
  if (immediateWins.length) {
    return immediateWins
  }
  const directBlocks = candidates.filter((entry) => entry.evaluation.analysis?.blockedWins > 0)
  if (directBlocks.length) {
    return directBlocks
  }
  return candidates.filter((entry) => {
    const pattern = entry.evaluation.analysis?.selfPattern
    return Boolean(pattern && (pattern.openFourCount > 0 || pattern.fourThreatCount > 0 || pattern.openThreeCount >= 2))
  }).slice(0, options.limit ?? 6)
}

function evaluateStaticBoard(sourceBoard, maximizingSide, options = {}) {
  const forbiddenRulesActive = Boolean(options.forbiddenRulesActive)
  const myScore = evaluateBoardForSide(sourceBoard, maximizingSide, options.radius ?? 2, forbiddenRulesActive)
  const enemyScore = evaluateBoardForSide(sourceBoard, oppositeSide(maximizingSide), options.radius ?? 2, forbiddenRulesActive)
  return myScore - enemyScore
}

function minimaxSearch(sourceBoard, turnSide, maximizingSide, depth, alpha, beta, options, cache, lastMove = null) {
  if (getNow() >= options.deadline) {
    return { score: evaluateStaticBoard(sourceBoard, maximizingSide, options), aborted: true }
  }

  const cacheKey = `${serializeBoardState(sourceBoard, turnSide)}|${maximizingSide}|${depth}`
  const cached = cache.get(cacheKey)
  if (cached && cached.depth >= depth) {
    return cached.result
  }

  const terminalScore = evaluateTerminalState(sourceBoard, lastMove, maximizingSide)
  if (terminalScore !== null) {
    const result = { score: terminalScore, aborted: false }
    setSearchCache(cache, cacheKey, { depth, result })
    return result
  }

  if (depth <= 0) {
    const result = { score: evaluateStaticBoard(sourceBoard, maximizingSide, options), aborted: false }
    setSearchCache(cache, cacheKey, { depth, result })
    return result
  }

  const forcedCandidates = collectForcedMoves(sourceBoard, turnSide, {
    radius: options.radius,
    breadth: Math.max(options.searchBreadth, 8),
    style: turnSide === maximizingSide ? options.style : 'defensive',
    forbiddenRulesActive: options.forbiddenRulesActive,
  })
  const candidates = forcedCandidates.length
    ? forcedCandidates
    : getSearchCandidates(sourceBoard, turnSide, {
        radius: options.radius,
        breadth: options.searchBreadth,
        style: turnSide === maximizingSide ? options.style : 'defensive',
        forbiddenRulesActive: options.forbiddenRulesActive,
      })

  if (!candidates.length) {
    const result = { score: evaluateStaticBoard(sourceBoard, maximizingSide, options), aborted: false }
    setSearchCache(cache, cacheKey, { depth, result })
    return result
  }

  const isMaximizing = turnSide === maximizingSide
  let bestScore = isMaximizing ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY
  let aborted = false

  for (const candidate of candidates) {
    const nextBoard = cloneBoard(sourceBoard)
    nextBoard[candidate.move.row][candidate.move.col] = turnSide
    const result = minimaxSearch(nextBoard, oppositeSide(turnSide), maximizingSide, depth - 1, alpha, beta, options, cache, candidate.move)
    if (result.aborted) {
      aborted = true
    }
    if (isMaximizing) {
      bestScore = Math.max(bestScore, result.score)
      alpha = Math.max(alpha, bestScore)
    } else {
      bestScore = Math.min(bestScore, result.score)
      beta = Math.min(beta, bestScore)
    }
    if (beta <= alpha) {
      break
    }
  }

  const finalResult = { score: bestScore, aborted }
  if (!aborted) {
    setSearchCache(cache, cacheKey, { depth, result: finalResult })
  }
  return finalResult
}

function evaluateMoveWithSearch(sourceBoard, move, side, options, cache) {
  const evaluation = scoreMove(sourceBoard, move, side, options.style || 'balanced', options.forbiddenRulesActive)
  if (!Number.isFinite(evaluation.score)) {
    return { move, score: evaluation.score, evaluation, searchScore: evaluation.score, reachedDepth: 0 }
  }

  const nextBoard = cloneBoard(sourceBoard)
  nextBoard[move.row][move.col] = side
  let searchScore = evaluation.score
  let reachedDepth = 0

  if ((options.searchDepth || 0) > 0) {
    for (let depth = 1; depth <= options.searchDepth; depth += 1) {
      const result = minimaxSearch(
        nextBoard,
        oppositeSide(side),
        side,
        depth,
        Number.NEGATIVE_INFINITY,
        Number.POSITIVE_INFINITY,
        options,
        cache,
        move,
      )
      searchScore = evaluation.score + result.score * 0.72
      reachedDepth = depth
      if (result.aborted || getNow() >= options.deadline) {
        return { move, score: searchScore, evaluation, searchScore, reachedDepth, timedOut: true }
      }
    }
  }

  return { move, score: searchScore, evaluation, searchScore, reachedDepth, timedOut: false }
}

export function rankGomokuMoves(payload) {
  const config = {
    radius: payload.radius ?? 2,
    rootBreadth: payload.rootBreadth ?? 6,
    searchBreadth: payload.searchBreadth ?? 5,
    searchDepth: payload.searchDepth ?? 2,
    maxSearchMs: payload.maxSearchMs ?? 180,
    style: payload.style || 'balanced',
    forbiddenRulesActive: Boolean(payload.forbiddenRulesActive),
  }
  const deadline = getNow() + config.maxSearchMs
  const cache = new Map()
  const moves = getSearchCandidates(payload.board, payload.side, {
    radius: config.radius,
    breadth: config.rootBreadth,
    style: config.style,
    forbiddenRulesActive: config.forbiddenRulesActive,
  })

  const rankedMoves = []
  let timedOut = false
  for (const entry of moves) {
    const result = evaluateMoveWithSearch(payload.board, entry.move, payload.side, {
      radius: config.radius,
      searchBreadth: config.searchBreadth,
      searchDepth: config.searchDepth,
      deadline,
      style: config.style,
      forbiddenRulesActive: config.forbiddenRulesActive,
    }, cache)
    if (result.timedOut) {
      timedOut = true
    }
    rankedMoves.push(result)
    if (getNow() >= deadline) {
      timedOut = true
      break
    }
  }

  return {
    moves: rankedMoves
      .filter((entry) => Number.isFinite(entry.score))
      .sort((left, right) => right.score - left.score)
      .slice(0, payload.limit ?? 3),
    timedOut,
  }
}

export function getForbiddenMoveReason(sourceBoard, move, side, forbiddenRulesActive) {
  return getForbiddenReason(sourceBoard, move, side, forbiddenRulesActive)
}
