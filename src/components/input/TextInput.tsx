"use client"

import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

interface TextInputProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export function TextInput({ value, onChange, disabled }: TextInputProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="text-input">需求描述</Label>
      <Textarea
        id="text-input"
        placeholder="用自然语言描述你的需求，例如：我们的骑手 App 有一个订单列表页，骑手反馈顶部筛选不好用，想改进一下..."
        value={value}
        onChange={event => onChange(event.target.value)}
        disabled={disabled}
        className="min-h-[240px] resize-y"
      />
      <p className="text-xs text-muted-foreground">
        Tip：越具体越好。可包含目标用户、场景、痛点、约束。
      </p>
    </div>
  )
}
