import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"

const ROOT = "/Users/payne/project/prd-copilot-pro"
const OUT_DIR = path.join(ROOT, "demo-artifacts/video")
const RAW_DIR = path.join(OUT_DIR, "raw")
const WORK_DIR = path.join(OUT_DIR, "work")
const EVENTS_PATH = path.join(WORK_DIR, "recording-events.json")
const RAW_VIDEO = path.join(RAW_DIR, `prd-copilot-pro-raw-${Date.now()}.mp4`)

const DEMO_INPUT = `我们要搭建一个标准化 Agent 引擎，支持业务线快速创建 AI 工作流。业务方可以配置 Skill、知识库、执行步骤和评估规则；平台要支持版本管理、权限审批、运行日志、失败重试、人工接管和效果评估。MVP 先支持内部客服和运营团队使用，不做复杂可视化编排，但要能沉淀可复用模板。`

const PLANNER_FEEDBACK =
  "请优先写清楚可复用模板、权限审批、人工接管和评估指标；不要把可视化编排当成一期范围。"
const GENERATOR_FEEDBACK =
  "验收标准要表格化，补充失败重试、人工接管和版本回滚的边界。"
const EVALUATOR_FEEDBACK =
  "如果要求返工，请重点检查 1.1 量化目标、1.4 验收标准和 2.3 决策确定性。"
const REVIEW_FEEDBACK =
  "最终可复用经验：PRD 必须把权限、回滚、人工接管和指标口径前置，不要只写功能流程。"

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const events = []
const startMs = Date.now()
let chromeProcess
let ffmpegProcess
let ws
let msgId = 0
const pending = new Map()

function mark(name, extra = {}) {
  const atMs = Date.now() - startMs
  const event = { name, atMs, ...extra }
  events.push(event)
  console.log(`[demo] ${name} +${(atMs / 1000).toFixed(1)}s`, extra)
}

function spawnLogged(command, args, options = {}) {
  return spawn(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  })
}

async function waitForJsonEndpoint() {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    try {
      const tabs = await fetch("http://127.0.0.1:9223/json").then(r => r.json())
      const page = tabs.find(t => t.type === "page" && t.webSocketDebuggerUrl)
      if (page) return page.webSocketDebuggerUrl
    } catch {
      // Chrome is still booting.
    }
    await sleep(500)
  }
  throw new Error("Chrome remote debugging endpoint did not become ready")
}

function cdp(method, params = {}) {
  const id = ++msgId
  ws.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id)
        reject(new Error(`CDP timeout: ${method}`))
      }
    }, 30_000)
  })
}

async function evaluate(expression, awaitPromise = true) {
  const result = await cdp("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true,
  })
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Runtime.evaluate failed")
  }
  return result.result?.value
}

function jsString(value) {
  return JSON.stringify(value)
}

async function bodyText() {
  return evaluate("document.body.innerText")
}

async function clickText(text) {
  const ok = await evaluate(`
(() => {
  const target = ${jsString(text)};
  const candidates = [...document.querySelectorAll('button,a,[role="button"]')];
  const el = candidates.find(node => (node.innerText || node.textContent || '').includes(target));
  if (!el) return false;
  el.scrollIntoView({ block: 'center', inline: 'center' });
  el.click();
  return true;
})()
`)
  if (!ok) throw new Error(`Could not click text: ${text}`)
}

async function fillFirstTextarea(value) {
  const ok = await evaluate(`
(() => {
  const el = document.querySelector('textarea');
  if (!el) return false;
  el.scrollIntoView({ block: 'center' });
  el.focus();
  return true;
})()
`)
  if (!ok) throw new Error("Could not fill first textarea")
  await cdp("Input.insertText", { text: value })
}

async function fillTextareaByPlaceholder(fragment, value) {
  const ok = await evaluate(`
(() => {
  const fragment = ${jsString(fragment)};
  const el = [...document.querySelectorAll('textarea')].find(node => (node.getAttribute('placeholder') || '').includes(fragment));
  if (!el) return false;
  el.scrollIntoView({ block: 'center' });
  el.focus();
  return true;
})()
`)
  if (!ok) throw new Error(`Could not fill textarea placeholder containing: ${fragment}`)
  await cdp("Input.insertText", { text: value })
}

async function waitForIncludes(label, fragments, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const text = await bodyText()
    if (fragments.every(fragment => text.includes(fragment))) {
      mark(`${label}:ready`)
      return text
    }
    await sleep(1500)
  }
  throw new Error(`Timed out waiting for ${label}: ${fragments.join(" / ")}`)
}

async function scrollToText(text) {
  await evaluate(`
(() => {
  const target = ${jsString(text)};
  const nodes = [...document.querySelectorAll('h1,h2,h3,p,div,span,button')];
  const el = nodes.find(node => (node.innerText || node.textContent || '').includes(target));
  if (el) el.scrollIntoView({ block: 'center', inline: 'center' });
  return Boolean(el);
})()
`)
}

async function startChrome() {
  mark("chrome:start")
  chromeProcess = spawnLogged(
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    [
      "--remote-debugging-port=9223",
      "--user-data-dir=/tmp/prd-copilot-pro-demo-chrome",
      "--no-first-run",
      "--new-window",
      "--window-size=1500,980",
      "--window-position=420,80",
      "http://localhost:3000",
    ],
  )
  chromeProcess.stderr.on("data", chunk => {
    const text = chunk.toString()
    if (!text.includes("DevTools listening")) process.stderr.write(text)
  })
  const wsUrl = await waitForJsonEndpoint()
  ws = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true })
    ws.addEventListener("error", reject, { once: true })
  })
  ws.addEventListener("message", event => {
    const message = JSON.parse(event.data)
    const item = pending.get(message.id)
    if (!item) return
    pending.delete(message.id)
    if (message.error) item.reject(new Error(message.error.message))
    else item.resolve(message.result)
  })
  await cdp("Page.enable")
  await cdp("Runtime.enable")
  await waitForIncludes("home", ["需求输入", "归一化需求"], 20_000)
}

async function startRecording() {
  mark("recording:start", { rawVideo: RAW_VIDEO })
  ffmpegProcess = spawn("ffmpeg", [
    "-y",
    "-hide_banner",
    "-f",
    "avfoundation",
    "-framerate",
    "30",
    "-i",
    "4:none",
    "-vf",
    "scale=1920:-2",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "22",
    "-pix_fmt",
    "yuv420p",
    RAW_VIDEO,
  ], {
    stdio: ["pipe", "pipe", "pipe"],
  })
  ffmpegProcess.stderr.on("data", chunk => {
    const text = chunk.toString()
    if (/error|denied|failed/i.test(text)) process.stderr.write(text)
  })
  await sleep(1500)
}

async function stopRecording() {
  if (!ffmpegProcess) return
  mark("recording:stop")
  ffmpegProcess.stdin.write("q")
  await new Promise(resolve => ffmpegProcess.once("close", resolve))
}

async function runFlow() {
  mark("flow:input:start")
  await fillFirstTextarea(DEMO_INPUT)
  await sleep(1000)
  await clickText("归一化需求")
  mark("normalize:clicked")
  await waitForIncludes("normalize", ["归一化结果", "PM 应继续追问"], 90_000)
  await sleep(4000)

  mark("planner:start")
  await clickText("启动 Planner")
  await waitForIncludes("planner", ["评估规则", "写作规划", "保存修改"], 420_000)
  await scrollToText("对本次规划的整体反馈")
  await fillTextareaByPlaceholder("可以为空", PLANNER_FEEDBACK)
  await sleep(2500)
  await clickText("保存修改")
  mark("planner:committed")
  await waitForIncludes("generator:pre", ["即将按以下规划撰写", "启动 Generator"], 20_000)

  mark("generator:start")
  await clickText("启动 Generator")
  await waitForIncludes("generator", ["PRD 初稿", "提交给 Evaluator"], 420_000)
  await scrollToText("对当前 PRD 的反馈")
  await fillTextareaByPlaceholder("验收标准要更细", GENERATOR_FEEDBACK)
  await sleep(3000)
  await clickText("提交给 Evaluator")
  mark("generator:submitted")

  await waitForIncludes("evaluator:pre", ["启动 Evaluator", "评估参数"], 30_000)
  mark("evaluator:start")
  await clickText("启动 Evaluator")
  await waitForIncludes("evaluator", ["三核心维度", "所有维度"], 600_000)
  await scrollToText("对评分的反馈")
  await fillTextareaByPlaceholder("写下你对评分", EVALUATOR_FEEDBACK)
  await sleep(3000)
  await clickText("进入人类审核")
  mark("evaluator:review")

  await waitForIncludes("review", ["人类审核反馈", "通过并进入 Skill"], 30_000)
  await fillTextareaByPlaceholder("写下最终审核意见", REVIEW_FEEDBACK)
  await sleep(2500)
  await clickText("通过并进入 Skill")
  mark("review:approved")

  await waitForIncludes("skill", ["沉淀出的可复用维度", "Skill Markdown 预览"], 30_000)
  await scrollToText("保存 Skill")
  await sleep(5000)
  mark("flow:complete")
}

async function main() {
  await fs.mkdir(RAW_DIR, { recursive: true })
  await fs.mkdir(WORK_DIR, { recursive: true })
  await startChrome()
  await startRecording()
  try {
    await runFlow()
  } finally {
    await stopRecording()
    await fs.writeFile(
      EVENTS_PATH,
      JSON.stringify({ rawVideo: RAW_VIDEO, events }, null, 2),
      "utf-8",
    )
    if (ws) ws.close()
    if (chromeProcess && !chromeProcess.killed) chromeProcess.kill("SIGTERM")
  }
  console.log(JSON.stringify({ rawVideo: RAW_VIDEO, eventsPath: EVENTS_PATH }, null, 2))
}

main().catch(async error => {
  mark("flow:error", { message: error.message })
  try {
    await stopRecording()
    await fs.writeFile(
      EVENTS_PATH,
      JSON.stringify({ rawVideo: RAW_VIDEO, events, error: error.message }, null, 2),
      "utf-8",
    )
  } catch {
    // Best effort artifact preservation.
  }
  if (ws) ws.close()
  if (chromeProcess && !chromeProcess.killed) chromeProcess.kill("SIGTERM")
  console.error(error)
  process.exit(1)
})
