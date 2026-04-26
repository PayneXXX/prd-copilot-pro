import { generatePRDText } from "@/lib/llm/generate"
import type { PRDGeneration } from "@/lib/types/prd"

const STRUCTURED_SYSTEM_PROMPT = `你是一位资深互联网产品经理，专门撰写高质量的 PRD 文档。你将根据用户给出的需求描述，输出一份结构完整、细节充实但不过度冗长的 PRD。

## PRD 标准结构
请严格按照以下章节输出（使用 Markdown）：

### 1. 背景与目标
- 业务背景（为什么要做这件事）
- 目标用户（写清楚用户角色）
- 产品目标（用一句话描述，可衡量）

### 2. 用户故事与核心场景
- 列出 3-5 个关键用户故事，格式："作为[角色]，我希望[能力]，以便[目的]"
- 每个故事附一个典型使用场景

### 3. 功能设计
- 功能列表（按优先级 P0/P1/P2 分层）
- 核心功能的详细流程（分步骤描述）
- 关键交互说明

### 4. 非功能需求
- 性能要求
- 安全与合规
- 数据指标埋点

### 5. 边界与约束
- 不做的事（明确划清边界）
- 依赖的前置条件
- 已知风险

### 6. 后续规划
- 二期可扩展方向
- 成功度量指标

## 写作原则
- 用 PM 的专业语言，避免含糊词汇（如"比较好"、"大概"）
- 每个功能点都要能让研发直接理解落地
- 不要编造原需求没有的信息，宁可在"已知风险"里标注"信息不足"
- 这是一个 6 天 MVP 项目，请优先输出精简、可执行、便于评审的内容`

export async function generateStructured(
  rawContent: string,
  signal?: AbortSignal,
): Promise<PRDGeneration> {
  const start = Date.now()

  try {
    const { text, inputTokens, outputTokens } = await generatePRDText({
      system: STRUCTURED_SYSTEM_PROMPT,
      maxOutputTokens: 1600,
      signal,
      prompt: `需求描述：
${rawContent}

请严格按照系统 Prompt 的 PRD 结构输出。
请控制篇幅，避免过度展开。`,
    })

    const durationMs = Date.now() - start
    console.info("[generateStructured]", {
      durationMs,
      inputTokens,
      outputTokens,
    })

    return {
      tier: "structured",
      content: text,
      tokenUsage: { input: inputTokens, output: outputTokens },
      durationMs,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成失败"
    const durationMs = Date.now() - start

    console.error("[generateStructured:error]", {
      durationMs,
      message,
    })

    return {
      tier: "structured",
      content: "",
      tokenUsage: { input: 0, output: 0 },
      durationMs,
      error: message,
    }
  }
}
