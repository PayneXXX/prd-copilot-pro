export interface DiffLine {
  type: "unchanged" | "added" | "removed"
  oldLineNo?: number
  newLineNo?: number
  text: string
}

export function diffPrdLines(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n")
  const newLines = newText.split("\n")
  const rows = oldLines.length
  const cols = newLines.length
  const dp = Array.from({ length: rows + 1 }, () =>
    Array<number>(cols + 1).fill(0),
  )

  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      dp[i][j] =
        oldLines[i] === newLines[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const result: DiffLine[] = []
  let i = 0
  let j = 0

  while (i < rows && j < cols) {
    if (oldLines[i] === newLines[j]) {
      result.push({
        type: "unchanged",
        oldLineNo: i + 1,
        newLineNo: j + 1,
        text: oldLines[i],
      })
      i += 1
      j += 1
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({
        type: "removed",
        oldLineNo: i + 1,
        text: oldLines[i],
      })
      i += 1
    } else {
      result.push({
        type: "added",
        newLineNo: j + 1,
        text: newLines[j],
      })
      j += 1
    }
  }

  while (i < rows) {
    result.push({
      type: "removed",
      oldLineNo: i + 1,
      text: oldLines[i],
    })
    i += 1
  }

  while (j < cols) {
    result.push({
      type: "added",
      newLineNo: j + 1,
      text: newLines[j],
    })
    j += 1
  }

  return result
}
