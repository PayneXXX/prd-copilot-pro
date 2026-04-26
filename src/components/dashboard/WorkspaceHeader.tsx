"use client"

interface WorkspaceHeaderProps {
  kicker: string
  roman: string
  title: string
  subtitle: string
}

export function WorkspaceHeader({
  kicker,
  roman,
  title,
  subtitle,
}: WorkspaceHeaderProps) {
  return (
    <header className="pb-8">
      <div className="flex items-baseline gap-3">
        <span
          className="text-[var(--text-tertiary)]"
          style={{
            fontFamily: "var(--font-newsreader), Georgia, serif",
            fontSize: "20px",
            fontWeight: 500,
          }}
        >
          {roman}
        </span>
        <span className="kicker">{kicker}</span>
      </div>
      <h1 className="heading-h1 mt-2">{title}</h1>
      <p className="mt-2 max-w-[60ch] text-[13px] leading-[1.6] text-[var(--text-secondary)]">
        {subtitle}
      </p>
      <div className="mt-6 border-t border-[var(--border-hairline)]" />
    </header>
  )
}
