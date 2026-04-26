/**
 * 安全 fetch + JSON 解析。永远不抛异常，统一返回判别联合（discriminated union）。
 *
 * 解决三类问题：
 * 1. 网络错误（fetch 本身 reject）：错误信息可读
 * 2. 服务器返回非 JSON（HTML 错误页 / 空 body / 502 网关）：不抛 SyntaxError，返回前 200 字预览
 * 3. AbortError：单独标记便于上层区分超时
 *
 * 用法：
 *   const result = await safeFetchJson<{ ok: true; draft: Draft } | ApiError>("/api/x", {...})
 *   if (!result.ok) {
 *     // result.kind: "network" | "abort" | "non_json" | "http_error"
 *     // result.message: 给用户看的错误信息
 *     return showError(result.message)
 *   }
 *   // result.data 已是 typed JSON
 */

export type SafeFetchResult<T> =
  | { ok: true; status: number; data: T }
  | {
      ok: false
      kind: "network" | "abort" | "non_json" | "http_error"
      status: number
      message: string
    }

export async function safeFetchJson<T = unknown>(
  url: string,
  init: RequestInit,
): Promise<SafeFetchResult<T>> {
  let response: Response

  try {
    response = await fetch(url, init)
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        ok: false,
        kind: "abort",
        status: 0,
        message: "请求被中止（通常是超时或用户取消）",
      }
    }

    return {
      ok: false,
      kind: "network",
      status: 0,
      message:
        error instanceof Error
          ? `网络错误：${error.message}`
          : "网络错误（无法连接到服务器）",
    }
  }

  const text = await response.text()

  // 空 body 直接当 non_json 处理（404 / 502 常见）
  if (text.trim().length === 0) {
    return {
      ok: false,
      kind: "non_json",
      status: response.status,
      message: `服务器返回空响应（HTTP ${response.status}）`,
    }
  }

  let data: T

  try {
    data = JSON.parse(text) as T
  } catch {
    const preview = text.slice(0, 200).replace(/\s+/g, " ").trim()

    return {
      ok: false,
      kind: "non_json",
      status: response.status,
      message: `服务器返回非 JSON 响应（HTTP ${response.status}）：${preview}${
        text.length > 200 ? "…" : ""
      }`,
    }
  }

  // 业务侧 ok=false 的情况由调用方处理（data 已正确解析为 JSON）
  // 这里只在 HTTP 层非 2xx 时区分一下
  if (!response.ok) {
    const businessError =
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : `HTTP ${response.status}`

    return {
      ok: false,
      kind: "http_error",
      status: response.status,
      message: businessError,
    }
  }

  return { ok: true, status: response.status, data }
}
