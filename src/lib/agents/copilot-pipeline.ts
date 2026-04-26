import { generatePRDText } from "@/lib/llm/generate"
import type { PRDGeneration } from "@/lib/types/prd"
import type { NormalizedContent } from "@/lib/types/requirement"

/**
 * C 档核心：三步 Agent 链
 * Planner → Outliner → Drafter
 * 每一步的输出都作为下一步的输入
 */

const PLANNER_SYSTEM = `你是 PRD Copilot 的 Planner Agent。你的职责是：接收结构化的需求草稿，产出一份 PRD 章节规划。

## 输出要求（Markdown 格式）
### 📋 章节规划
列出这份 PRD 应该包含的 5-8 个章节，每个章节包括：
- 章节标题
- 这个章节要回答的核心问题（1 句话）
- 该章节的关键要点（3-5 个 bullet）

### 🎯 核心假设
列出你在规划时做出的关键假设（例如：用户规模、技术栈、时间节奏），并说明为什么做这个假设。

### ⚠️ 关键风险
列出 PM 在接下来写作时最需要警惕的 3 个风险点。

## 原则
- 不要开始写 PRD 内容，只做规划
- 章节设计要贴合需求本身，避免套用固定模板
- 假设和风险必须是具体的，不能是"需要更多调研"这种废话
- 输出尽量精炼，适合后续快速进入写作阶段`

const OUTLINER_SYSTEM = `你是 PRD Copilot 的 Outliner Agent。你接收 Planner 产出的章节规划，把它展开为详细大纲。

## 输出要求
对每个章节：
- 保留原章节标题
- 把每个要点展开为 2-4 句话的简要描述（但还不是成文，只是框架）
- 保留 Planner 的假设和风险清单（放在文档末尾）

## 原则
- 不要写完整段落，只写骨架
- 用"-"或数字列表组织内容
- 在每个关键决策点，用 [假设: ...] 或 [需追问: ...] 的方式标注
- 保持大纲紧凑，避免无关展开`

const DRAFTER_SYSTEM = `你是 PRD Copilot 的 Drafter Agent。你接收完整大纲，把它写成一份高质量的成品 PRD。

## 输出要求
- 使用 Markdown，层级清晰
- 严格遵循 Outliner 给出的骨架，不要擅自增删章节
- 把大纲的 bullet 扩写为可读的段落
- 保留 [假设: ...] 和 [需追问: ...] 标注，以醒目方式呈现（例如用 > 引用块）
- 在文档末尾保留"核心假设"和"关键风险"两个区块

## 原则
- 用 PM 的专业语言，具体、可执行
- 保持 Copilot 姿态：让读者能看出"哪些是 AI 的推断，哪些是原需求给出的事实"
- 不要编造原始需求中没有的数据、指标或用户数
- 输出适合 MVP 评审阅读，尽量精炼但保留关键判断`

function formatList(title: string, items: string[]) {
  if (items.length === 0) {
    return `## ${title}
（无）`
  }

  return `## ${title}
${items.map((item, index) => `${index + 1}. ${item}`).join("\n")}`
}

function formatNormalizedContent(normalizedContent: NormalizedContent): string {
  return `## 概要
${normalizedContent.summary}

## 用户故事
${normalizedContent.userStory}

${formatList("识别的痛点", normalizedContent.painPoints)}

${formatList("已知约束", normalizedContent.constraints)}

${formatList("PM 应追问的问题", normalizedContent.openQuestions)}

## 信息充分度
${normalizedContent.confidence}`
}

export async function generateCopilot(
  normalizedContent: NormalizedContent,
  signal?: AbortSignal,
): Promise<PRDGeneration> {
  const start = Date.now()
  const trace: PRDGeneration["trace"] = {}
  let totalInput = 0
  let totalOutput = 0

  try {
    const formatted = formatNormalizedContent(normalizedContent)

    const plannerResult = await generatePRDText({
      system: PLANNER_SYSTEM,
      maxOutputTokens: 500,
      signal,
      prompt: `以下是归一化后的需求草稿，请产出章节规划：

${formatted}`,
    })

    trace.planner = {
      output: plannerResult.text,
      tokens: {
        input: plannerResult.inputTokens,
        output: plannerResult.outputTokens,
      },
    }
    totalInput += plannerResult.inputTokens
    totalOutput += plannerResult.outputTokens
    console.info("[generateCopilot:planner]", {
      inputTokens: plannerResult.inputTokens,
      outputTokens: plannerResult.outputTokens,
    })

    const outlinerResult = await generatePRDText({
      system: OUTLINER_SYSTEM,
      maxOutputTokens: 700,
      signal,
      prompt: `以下是 Planner 产出的章节规划，请展开为详细大纲：

${plannerResult.text}`,
    })

    trace.outliner = {
      output: outlinerResult.text,
      tokens: {
        input: outlinerResult.inputTokens,
        output: outlinerResult.outputTokens,
      },
    }
    totalInput += outlinerResult.inputTokens
    totalOutput += outlinerResult.outputTokens
    console.info("[generateCopilot:outliner]", {
      inputTokens: outlinerResult.inputTokens,
      outputTokens: outlinerResult.outputTokens,
    })

    const drafterResult = await generatePRDText({
      system: DRAFTER_SYSTEM,
      maxOutputTokens: 1400,
      signal,
      prompt: `以下是完整大纲，请写成成品 PRD：

${outlinerResult.text}`,
    })

    trace.drafter = {
      output: drafterResult.text,
      tokens: {
        input: drafterResult.inputTokens,
        output: drafterResult.outputTokens,
      },
    }
    totalInput += drafterResult.inputTokens
    totalOutput += drafterResult.outputTokens
    const durationMs = Date.now() - start

    console.info("[generateCopilot:drafter]", {
      inputTokens: drafterResult.inputTokens,
      outputTokens: drafterResult.outputTokens,
    })
    console.info("[generateCopilot]", {
      durationMs,
      totalInput,
      totalOutput,
    })

    return {
      tier: "copilot",
      content: drafterResult.text,
      tokenUsage: { input: totalInput, output: totalOutput },
      durationMs,
      trace,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成失败"
    const durationMs = Date.now() - start

    console.error("[generateCopilot:error]", {
      durationMs,
      totalInput,
      totalOutput,
      message,
    })

    return {
      tier: "copilot",
      content: "",
      tokenUsage: { input: totalInput, output: totalOutput },
      durationMs,
      trace,
      error: message,
    }
  }
}
