# PRD Copilot Pro Demo Script

目标：录制 GitHub README 可引用的无声字幕版端到端演示。

## 演示需求

我们要搭建一个标准化 Agent 引擎，支持业务线快速创建 AI 工作流。业务方可以配置 Skill、知识库、执行步骤和评估规则；平台要支持版本管理、权限审批、运行日志、失败重试、人工接管和效果评估。MVP 先支持内部客服和运营团队使用，不做复杂可视化编排，但要能沉淀可复用模板。

## 章节字幕

1. `00:00` PRD Copilot Pro · PM 副驾驶 Agent
2. `00:10` Step 1 · 输入模糊需求，Normalizer 归一化为结构化草稿
3. `00:35` Step 2 · Planner 读取 Rubric Skill，产出写作规划与评估规则
4. `01:00` Step 3 · Generator 按 Planner 规划撰写 PRD，并允许人类编辑
5. `01:30` Step 4 · Evaluator 按三硬门槛和激活维度评分
6. `02:00` Step 5 · 人类审核保留最终决策权
7. `02:20` Step 6 · Skill 沉淀，把反馈转化为可复用写作规则
8. `02:40` Closed loop · Normalizer / Planner / Generator / Evaluator / Human Feedback / Skill

## 录制原则

- 不展示 `.env.local`、API Key、终端敏感输出。
- 长时间 LLM 等待保留真实触发动作，后期压缩等待片段。
- 保留原始录屏，最终视频输出为 H.264 MP4。
