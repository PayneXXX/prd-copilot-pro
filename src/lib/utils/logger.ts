// 极简埋点：记录 API 内部关键节点的耗时。

export function mark(tag: string, step: string, extra?: Record<string, any>) {
  const timestamp = new Date().toISOString().slice(11, 23)
  const extraStr = extra ? ` ${JSON.stringify(extra)}` : ""

  console.log(`[${tag}] ${timestamp} ${step}${extraStr}`)
}

export function makeTimer(tag: string) {
  const start = Date.now()

  return {
    tick: (step: string, extra?: Record<string, any>) => {
      const elapsed = Date.now() - start
      mark(tag, `${step} (+${elapsed}ms)`, extra)
    },
    total: () => Date.now() - start,
  }
}
