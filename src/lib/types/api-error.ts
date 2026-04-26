export type ApiErrorType =
  | "missing_api_key"
  | "schema_validation_failed"
  | "upstream_timeout"
  | "upstream_error"
  | "parse_fallback"
  | "unknown"

export interface ApiError {
  ok: false
  type: ApiErrorType
  error: string
  detail?: unknown
  provider?: "anthropic" | "siliconflow"
  model?: string
}
