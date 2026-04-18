import { rankGomokuMoves } from './gomokuEngine'

self.onmessage = (event) => {
  try {
    const result = rankGomokuMoves(event.data)
    self.postMessage({ type: 'result', ...result })
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: String(error?.message || error || 'unknown worker error'),
    })
  }
}
