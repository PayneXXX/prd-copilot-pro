import type { Metadata } from "next"

import "./globals.css"

import { Toaster } from "@/components/ui/sonner"

export const metadata: Metadata = {
  title: "PRD Copilot Pro",
  description: "为 PM 设计的 PRD 协作工具 · 三档对照 + 反馈闭环 + Skill 沉淀",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="editorial-body min-h-full font-sans">
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  )
}
