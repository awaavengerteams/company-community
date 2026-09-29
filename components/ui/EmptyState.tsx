import type { ReactNode } from 'react'

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-card border border-dashed border-line bg-surface/40 px-6 py-10 text-center">
      <p className="text-sm font-medium text-ink-soft">{title}</p>
      {description ? (
        <p className="mx-auto mt-1.5 max-w-xs text-xs leading-relaxed text-ink-faint">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}
