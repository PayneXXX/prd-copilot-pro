# PRD Copilot Pro · 项目上下文压缩版（v2 · 副驾驶 Agent 重构后）

## 产品定位（最新）
PM 的 PRD 副驾驶 Agent。输入会议记录/聊天记录/需求描述 → Planner
(Opus 4.6) 产出写作规划 + 评估规则 → Generator (可选 Opus/Sonnet/
Kimi) 生成初稿 → Evaluator (Kimi) 按规则打分，不合格打回重做 → 人
类审核签字 → 反馈沉淀为 Skill，下次 Planner 读取使用。

## 用户
肖佩恩（Payne Xiao）· 上海 · 2026 年 6 月签三方 · 求 AI PM 校招岗

## 已完成（Day 0-3 上半天）
- Next.js 14 + TypeScript + shadcn/ui + Vercel AI SDK 骨架
- M1 输入层：文字 / 聊天记录 → RequirementDraft 归一化（保留）
- M2 三档生成链路：裸/结构化/Copilot 并行（降级为"实验模式"）
- 模型降级：Opus 4.7 → Opus 4.6（中转站路由已稳定）
- 中转站性能实测：Opus 4.6 长输出仍偏慢，B档约 3.6 分钟，C档约 11
  分钟。待观察是否切换或加速。

## 关键产品决策
- Planner：Opus 4.6，调度中枢身份
- Evaluator：Kimi K2（Pro/moonshotai/Kimi-K2.6），避免同厂商偏见
- Generator：Opus 4.6 主路径，Sonnet/Kimi 作为可切换备选
- Skill 沉淀：半自动（系统生成 Diff，人类确认后写入 SKILL.md）

## 未做（Day 3 下半天起）
- Day 3：Planner 重构（升级为全局调度）
- Day 4：Generator 改造 + 多模型切换
- Day 5：Evaluator 返工闭环 + 人类审核
- Day 6：Skill 沉淀 + 部署 + 演示视频

## 协作约定
- Claude = Planner，用户 = Human，Claude Code (Sonnet) = Generator
- 一次一步，不要倾泻 6 天计划
- 代码能力偏弱，ExecPlan 要足够细可直接复制
- 别吹捧，直接给答案

## 技术栈
- Next.js 14 App Router + TypeScript
- shadcn/ui + Tailwind
- Vercel AI SDK（@ai-sdk/anthropic 主用，后续加 openai-compatible 接 Kimi）
- Vercel 部署
- 项目路径 /Users/payne/project/prd-copilot-pro

## 中转站性能问题（待解决）
- Opus 4.6 通过中转站长输出被限速
- maxOutputTokens 参数未被中转站透传
- Plan：Day 3 做 Planner 时同时测试 Kimi 通过硅基流动的速度，用数据决策主 Generator 选型

## [Day 3 下半天] 里程碑 · Planner 重构完成

### 已完成
- 主路径从"三档对照"切换为"副驾驶 Agent"
- 旧三档生成迁至 /experiment（保留但不在主路径）
- Dashboard 布局：左侧 Stepper + 右侧工作区 + 底部运行数据面板
- Planner Agent 可读取 skills/prd-evaluation-rubric-v1.md 动态生成评估规则

### 关键工程决策
- generateObject → generateText + JSON.parse：复杂嵌套 schema 下 Claude 不稳定
- skills/ 目录首次出现：从此所有可复用 Skill 都放这里
- zustand 作为状态管理：不用 xstate，避免学习成本

### 性能观测
- Planner 单次 137 秒 / 输入 4731 tokens / 输出 7492 tokens
- 中转站长请求问题延续，部署前再决策

### 下一步
- Day 4：Generator 严格服从 WritingPlan，首次 Human 介入编辑