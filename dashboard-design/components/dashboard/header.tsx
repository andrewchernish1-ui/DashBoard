"use client"

import { Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

type HeaderProps = {
  onRefresh?: () => void | Promise<void>
  refreshing?: boolean
  lastUpdated?: string | null
}

const formatDate = (value: string | null | undefined) => {
  if (!value) {
    return "нет данных"
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

export function Header({ onRefresh, refreshing, lastUpdated }: HeaderProps) {
  const today = new Date().toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  return (
    <header className="sticky top-0 z-40 h-16 border-b border-border bg-white/95 backdrop-blur px-6 flex items-center justify-between">
      <div className="flex flex-col gap-0.5">
        <div className="inline-flex items-center gap-2">
          <span className="inline-flex items-center justify-center h-7 px-2 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold">
            Dashboard
          </span>
          <h1 className="text-lg font-semibold text-foreground leading-none">Панель мониторинга</h1>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
            Сегодня {today}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
            Последнее обновление: {formatDate(lastUpdated ?? null)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Button variant="outline" className="gap-2" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Обновить
        </Button>
      </div>
    </header>
  )
}
