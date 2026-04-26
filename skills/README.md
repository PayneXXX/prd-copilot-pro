# Skills · Harness 组件目录

本目录存放 PRD Copilot 的可复用 Skill 文件。
每个 Skill 是一份独立的 Markdown 文档，由 Planner 根据任务需要动态加载。

## 当前 Skills

- `prd-evaluation-rubric-v1.md`：AI PRD 评估标准（100 分制）
  - 类型：global（所有 PRD 都加载）
  - 作者：Payne Xiao
  - 版本：v1.0

## 命名规范
`{skill-name}-{version}.md`

## Front matter 要求
每个 Skill 文件必须在开头包含 YAML front matter，字段：
- name: string（唯一标识）
- description: string（一句话说明）
- author: string
- version: string
