"use client"

import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

interface ChatInputProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

const SAMPLE_PLACEHOLDER = `粘贴钉钉/飞书/微信聊天记录，例如：

张三 2026-04-20 14:32
老板今天说骑手投诉列表页找不到取消订单的单子，咱们得优化下

李四 2026-04-20 14:35
那是因为筛选默认不含"已取消"，要改默认值吗？

张三 2026-04-20 14:37
我觉得要，但还得加个入口能看历史全部订单...`

export function ChatInput({ value, onChange, disabled }: ChatInputProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="chat-input">聊天记录</Label>
      <Textarea
        id="chat-input"
        placeholder={SAMPLE_PLACEHOLDER}
        value={value}
        onChange={event => onChange(event.target.value)}
        disabled={disabled}
        className="min-h-[240px] resize-y font-mono text-sm"
      />
      <p className="text-xs text-muted-foreground">
        支持任意平台的聊天记录格式，AI 会自动识别发言人和讨论主线。
      </p>
    </div>
  )
}
