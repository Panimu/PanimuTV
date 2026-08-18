// Small concurrency limiter so bulk episode fetches don't hammer TheTVDB.

const MAX_CONCURRENT = 4

let active = 0
const queue: (() => void)[] = []

export function pooled<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      active++
      fn()
        .then(resolve, reject)
        .finally(() => {
          active--
          const next = queue.shift()
          if (next) next()
        })
    }
    if (active < MAX_CONCURRENT) run()
    else queue.push(run)
  })
}
