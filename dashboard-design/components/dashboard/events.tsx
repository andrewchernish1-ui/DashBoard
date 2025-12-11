"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { EventsData, CalendarEvent } from "@/types/dashboard"
import { CalendarClock, MapPin, Clock } from "lucide-react"

type Props = {
  data?: EventsData
}

const formatDateTime = (value?: string | null) => {
  if (!value) return "Без времени"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const dateStr = date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
  const timeStr = date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
  return `${dateStr}, ${timeStr}`
}

const formatDayLabel = (value: Date) => {
  const today = new Date()
  const startOfToday = new Date(today)
  startOfToday.setHours(0, 0, 0, 0)

  const startOfValue = new Date(value)
  startOfValue.setHours(0, 0, 0, 0)

  const diffDays = Math.round((startOfValue.getTime() - startOfToday.getTime()) / (24 * 60 * 60 * 1000))
  if (diffDays === 0) return "Сегодня"
  if (diffDays === 1) return "Завтра"
  if (diffDays === 2) return "Послезавтра"

  return startOfValue.toLocaleDateString("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  })
}

const EventItem = ({ event }: { event: CalendarEvent }) => {
  return (
    <div className="p-3 rounded-xl border bg-muted/30 space-y-1">
      <div className="flex items-center gap-2">
        <CalendarClock className="w-4 h-4 text-emerald-600" />
        <span className="font-medium text-sm text-foreground">{event.summary}</span>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Clock className="w-3 h-3" />
        <span>{formatDateTime(event.start)}</span>
      </div>
      {event.location && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <MapPin className="w-3 h-3" />
          <span className="truncate">{event.location}</span>
        </div>
      )}
    </div>
  )
}

export function Events({ data }: Props) {
  const items = data?.items ?? []
  const parsed = items
    .map((event) => {
      const date = event.start ? new Date(event.start) : event.end ? new Date(event.end) : null
      return { event, date }
    })
    .filter(({ date }) => (date ? !Number.isNaN(date.getTime()) : true))
    .sort((a, b) => {
      if (!a.date || !b.date) return 0
      return a.date.getTime() - b.date.getTime()
    })

  const grouped = parsed.reduce<Record<string, { label: string; items: CalendarEvent[] }>>((acc, { event, date }) => {
    const key = date ? date.toISOString().split("T")[0] ?? "unknown" : "no-date"
    const label = date ? formatDayLabel(date) : "Без даты"
    if (!acc[key]) acc[key] = { label, items: [] }
    acc[key]!.items.push(event)
    return acc
  }, {})
  const groups = Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0]))

  return (
    <Card className="col-span-1">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
            <span className="text-emerald-600 text-sm">PT</span>
          </div>
          Персональные тренировки — ближайшие 3 дня
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <div className="text-sm text-muted-foreground">Нет событий</div>
        ) : (
          <div className="space-y-4">
            {groups.map(([key, group]) => (
              <div key={key} className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </div>
                <div className="space-y-2">
                  {group.items.map((event) => (
                    <EventItem key={event.id} event={event} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
