# Day 4 Baseline · 证据存档

本目录存放 2026-04-24 Day 4 端到端跑通的证据素材。

## 为什么要有这份存档

- 中转站长请求偶有"悄无声息消失"问题，可能影响后续演示
- 本目录保留已验证可跑通的产物，作为最终演示的保底素材

## 文件清单

- `prd-rider-app-v1.md`：Generator 实际产出的 PRD（骑手 App 案例）
- `planner-output.json`：Planner 的完整输出
- `day4-metrics.json`：Day 4 已知端到端指标与存档补齐状态
- `screenshots/`：关键界面截图

## 当前状态

- 已保存中转站使用日志截图：`screenshots/00-relay-log-day4-generator.png`
- `prd-rider-app-v1.md` 当前是待补齐占位文件，请用浏览器 Network tab 中 `/api/generate-prd` 的 `generatorOutput.prdMarkdown` 覆盖
- `planner-output.json` 当前保留已知指标和 outline，请用 `/api/plan` 的完整 Response 覆盖
- UI 三张截图如页面状态已丢失，不建议伪造；保留真实中转站日志截图作为跑通证据

## 使用方式

如果 6 天结束时中转站问题未解决，用这份素材录制演示视频，
并在 README 里诚实说明"API 层存在中转站时延问题，本次演示使用已验证数据回放"。
