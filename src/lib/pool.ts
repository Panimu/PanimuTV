// Small concurrency limiter so bulk episode fetches don't hammer TheTVDB.
// Queued work is ordered by priority (lower runs first) rather than FIFO, so
// a user-visible schedule load overtakes the background library sync.

const MAX_CONCURRENT = 4

/** Lower numbers run first. */
export const PRIORITY = {
  /** Direct response to a tap: refresh this show, import this row. */
  interactive: 0,
  /** Schedule/day loading — offset by how far the day is from today. */
  schedule: 100,
  /** Opportunistic freshening nobody is waiting on. */
  background: 5000,
}

interface QueueItem {
  run: () => void
  priority: number
  /** Insertion order, so equal priorities stay stable. */
  seq: number
}

let active = 0
let seq = 0
const queue: QueueItem[] = []

function dequeue(): QueueItem | undefined {
  if (!queue.length) return undefined
  let bestIndex = 0
  for (let i = 1; i < queue.length; i++) {
    const item = queue[i]
    const best = queue[bestIndex]
    if (item.priority < best.priority || (item.priority === best.priority && item.seq < best.seq)) {
      bestIndex = i
    }
  }
  return queue.splice(bestIndex, 1)[0]
}

export function pooled<T>(fn: () => Promise<T>, priority = PRIORITY.schedule): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      active++
      fn()
        .then(resolve, reject)
        .finally(() => {
          active--
          dequeue()?.run()
        })
    }
    if (active < MAX_CONCURRENT) run()
    else queue.push({ run, priority, seq: seq++ })
  })
}
