const pieceValues = {
  general: 100000,
  advisor: 110,
  elephant: 110,
  horse: 320,
  chariot: 640,
  cannon: 360,
  soldier: 90,
}

function cloneBoard(sourceBoard) {
  return sourceBoard.map((row) => row.map((piece) => (piece ? { ...piece } : null)))
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
      ;[[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([rowOffset, colOffset]) => {
        const nextRow = row + rowOffset
        const nextCol = col + colOffset
        if (isInsidePalace(piece.side, nextRow, nextCol)) {
          pushMoveIfAvailable(moves, sourceBoard, piece, nextRow, nextCol)
        }
      })

      {
        const enemyGeneral = locateGeneral(sourceBoard, oppositeSide(piece.side))
        if (enemyGeneral && enemyGeneral.col === col && countPiecesBetween(sourceBoard, row, col, enemyGeneral.row, enemyGeneral.col) === 0) {
          moves.push({ row: enemyGeneral.row, col: enemyGeneral.col })
        }
      }
      break
    case 'advisor':
      ;[[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([rowOffset, colOffset]) => {
        const nextRow = row + rowOffset
        const nextCol = col + colOffset
        if (isInsidePalace(piece.side, nextRow, nextCol)) {
          pushMoveIfAvailable(moves, sourceBoard, piece, nextRow, nextCol)
        }
      })
      break
    case 'elephant':
      ;[[-2, -2], [-2, 2], [2, -2], [2, 2]].forEach(([rowOffset, colOffset]) => {
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
      ;[[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([rowStep, colStep]) => {
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
      ;[[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([rowStep, colStep]) => {
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

function applySuggestionStyleScore(move, side, nextBoard, baseScore, suggestionStyle) {
  let score = baseScore

  if (suggestionStyle === 'aggressive') {
    if (move.capturedPiece) {
      score += 35
    }
    if (isInCheck(nextBoard, oppositeSide(side))) {
      score += 50
    }
  }

  if (suggestionStyle === 'solid') {
    if (isInCheck(nextBoard, side)) {
      score -= 80
    }
    if (!move.capturedPiece) {
      score += 12
    }
  }

  return score
}

function getQuickSuggestionScore(move, side, nextBoard, suggestionStyle) {
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

  return applySuggestionStyleScore(move, side, nextBoard, score, suggestionStyle)
}

function prioritizeGeneralCaptureMoves(moves, board, side) {
  const forcedCapture = moves.find((move) => !locateGeneral(applyMoveToBoard(board, move), oppositeSide(side)))
  return forcedCapture ? [forcedCapture] : moves
}

function findGeneralCaptureMove(board, side) {
  return getAllAvailableMoves(board, side).find((move) => !locateGeneral(applyMoveToBoard(board, move), oppositeSide(side))) || null
}

function minimax(sourceBoard, sideToMove, depth, alpha, beta, maximizingSide, deadline) {
  if (performance.now() >= deadline) {
    return { score: evaluateBoard(sourceBoard, maximizingSide), timedOut: true }
  }

  const currentGeneral = locateGeneral(sourceBoard, sideToMove)
  const enemyGeneral = locateGeneral(sourceBoard, oppositeSide(sideToMove))

  if (!currentGeneral) {
    return { score: sideToMove === maximizingSide ? -999999 - depth : 999999 + depth, timedOut: false }
  }

  if (!enemyGeneral) {
    return { score: sideToMove === maximizingSide ? 999999 + depth : -999999 - depth, timedOut: false }
  }

  const legal = getAllLegalMoves(sourceBoard, sideToMove)
  if (!legal.length) {
    return { score: sideToMove === maximizingSide ? -999999 - depth : 999999 + depth, timedOut: false }
  }

  if (depth === 0) {
    return { score: evaluateBoard(sourceBoard, maximizingSide), timedOut: false }
  }

  const orderedMoves = [...legal].sort(compareMoves)

  if (sideToMove === maximizingSide) {
    let bestScore = -Infinity
    for (const move of orderedMoves) {
      const result = minimax(applyMoveToBoard(sourceBoard, move), oppositeSide(sideToMove), depth - 1, alpha, beta, maximizingSide, deadline)
      bestScore = Math.max(bestScore, result.score)
      alpha = Math.max(alpha, result.score)
      if (result.timedOut) {
        return { score: bestScore, timedOut: true }
      }
      if (beta <= alpha) {
        break
      }
    }
    return { score: bestScore, timedOut: false }
  }

  let bestScore = Infinity
  for (const move of orderedMoves) {
    const result = minimax(applyMoveToBoard(sourceBoard, move), oppositeSide(sideToMove), depth - 1, alpha, beta, maximizingSide, deadline)
    bestScore = Math.min(bestScore, result.score)
    beta = Math.min(beta, result.score)
    if (result.timedOut) {
      return { score: bestScore, timedOut: true }
    }
    if (beta <= alpha) {
      break
    }
  }
  return { score: bestScore, timedOut: false }
}

function rankMovesWithBudget({ board, side, limit, maxMs, searchDepth, suggestionStyle }) {
  const forcedCaptureMove = findGeneralCaptureMove(board, side)
  const legal = (forcedCaptureMove
    ? [forcedCaptureMove]
    : prioritizeGeneralCaptureMoves(getAllLegalMoves(board, side), board, side)).sort(compareMoves)
  if (!legal.length) {
    return { moves: [], timedOut: false }
  }

  const deadline = performance.now() + maxMs
  const scoredMoves = legal
    .map((move) => {
      const nextBoard = applyMoveToBoard(board, move)
      return {
        move,
        nextBoard,
        score: getQuickSuggestionScore(move, side, nextBoard, suggestionStyle),
      }
    })
    .sort((left, right) => right.score - left.score)

  const deepCandidates = scoredMoves.slice(0, Math.min(Math.max(limit * 3, 6), scoredMoves.length))
  let timedOut = false

  for (const entry of deepCandidates) {
    if (searchDepth <= 0 || performance.now() >= deadline) {
      timedOut = true
      break
    }

    const result = minimax(entry.nextBoard, oppositeSide(side), searchDepth, -Infinity, Infinity, side, deadline)
    entry.score = applySuggestionStyleScore(entry.move, side, entry.nextBoard, result.score, suggestionStyle)
    if (result.timedOut) {
      timedOut = true
      break
    }
  }

  return {
    moves: scoredMoves
      .sort((left, right) => right.score - left.score)
      .slice(0, limit),
    timedOut,
  }
}

self.onmessage = (event) => {
  try {
    const result = rankMovesWithBudget(event.data)
    self.postMessage({ type: 'result', ...result })
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: String(error?.message || error || 'unknown worker error'),
    })
  }
}
