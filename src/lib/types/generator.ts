import { z } from "zod"

// 格式统计：Generator 自检用，帮助 PM 判断 PRD 的信息密度。
export const FormatStatsSchema = z.object({
  tableCount: z.number().describe("PRD 中的 Markdown 表格数量"),
  listCount: z
    .number()
    .describe("有序/无序列表的数量（顶层 list 算 1 个，嵌套不重复计数）"),
  mermaidBlockCount: z.number().describe("Mermaid 流程图/时序图的数量"),
  paragraphCount: z
    .number()
    .describe("纯文字段落的数量（连续 3 行以上的文字块算 1 个段落）"),
  totalWordCount: z
    .number()
    .describe("PRD 正文的中文+英文字数合计（近似值）"),
})
export type FormatStats = z.infer<typeof FormatStatsSchema>

export const GeneratorParseStatusSchema = z.enum([
  "ok",
  "protocol_violation",
  "metadata_missing",
  "fallback_raw_text",
])
export type GeneratorParseStatus = z.infer<typeof GeneratorParseStatusSchema>

// Generator 的输出
export const GeneratorOutputSchema = z.object({
  prdMarkdown: z.string().describe("完整 PRD 的 Markdown 内容"),
  sectionsGenerated: z.array(z.string()).describe("本次生成的章节列表"),
  assumptions: z.array(z.string()).describe("Generator 在写作时做出的关键假设"),
  openQuestions: z
    .array(z.string())
    .describe("Generator 发现但未能在本次回答的问题"),
  formatStats: FormatStatsSchema.describe("Generator 对输出的格式自检"),
  parseStatus: GeneratorParseStatusSchema.describe("Generator 输出协议解析状态"),
})
export type GeneratorOutput = z.infer<typeof GeneratorOutputSchema>
