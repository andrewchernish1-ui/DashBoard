"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp, TrendingDown, Loader2 } from "lucide-react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import type { ExerciseData, FocusExerciseMetric } from "@/types/dashboard"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { addExercise } from "@/lib/api"

type Props = {
  data?: ExerciseData
  loading?: boolean
  onChange?: () => void
}

const colorMap: Record<string, string> = {
  Clean: "#10b981",
  Snatch: "#3b82f6",
  Deadlift: "#f59e0b",
  Squat: "#8b5cf6",
  "Bench Press": "#6366f1",
}

const formatDateLabel = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString("ru-RU", { month: "short", day: "numeric" })
}

const getChange = (metric: FocusExerciseMetric) => {
  if (!metric.current || !metric.previous) return 0
  return metric.current - metric.previous
}

export function ExerciseRM({ data, loading, onChange }: Props) {
  const [form, setForm] = useState({ name: "Clean", weight: "" })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const focus = data?.focus ?? []
  const timeline = data?.timeline ?? []

  const chartData = timeline.map((point) => ({
    label: formatDateLabel(point.date),
    Clean: (point["Clean"] as number | null) ?? null,
    Snatch: (point["Snatch"] as number | null) ?? null,
    Deadlift: (point["Deadlift"] as number | null) ?? null,
    Squat: (point["Squat"] as number | null) ?? null,
    "Bench Press": (point["Bench Press"] as number | null) ?? null,
  }))

  const hasData = focus.some((metric) => metric.current !== null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const weightNumber = Number(String(form.weight).replace(",", "."))
    if (Number.isNaN(weightNumber)) {
      setError("Вес должен быть числом")
      setSaving(false)
      return
    }
    try {
      await addExercise({ name: form.name, weight: weightNumber })
      setForm((prev) => ({ ...prev, weight: "" }))
      onChange?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось добавить RM")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="col-span-1">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
            <span className="text-emerald-600 text-sm">RM</span>
          </div>
          Повторные максимумы (RM) в упражнениях
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="grid grid-cols-2 gap-2 items-end" onSubmit={handleSubmit}>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Упражнение</label>
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            >
              {Object.keys(colorMap).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <label className="text-xs text-muted-foreground">Вес (кг)</label>
              <Input
                value={form.weight}
                onChange={(e) => setForm((prev) => ({ ...prev, weight: e.target.value }))}
                placeholder="Напр. 120"
              />
            </div>
            <Button type="submit" disabled={saving} className="self-end">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Добавить"}
            </Button>
          </div>
          {error && <p className="text-xs text-destructive col-span-2">{error}</p>}
        </form>

        {loading && !hasData ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              {focus.map((exercise) => {
                const change = getChange(exercise)
                return (
                  <div key={exercise.name} className="p-3 rounded-xl bg-muted/50 border border-border">
                    <p className="text-xs text-muted-foreground mb-1">{exercise.name}</p>
                    <p className="text-xl font-bold text-foreground">
                      {exercise.current ? `${exercise.current} кг` : "—"}
                    </p>
                    <div className="flex items-center gap-1 mt-1">
                      {change >= 0 ? (
                        <TrendingUp className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <TrendingDown className="w-3 h-3 text-red-500" />
                      )}
                      <span className={`text-xs font-medium ${change >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                        {change >= 0 ? "+" : ""}
                        {change.toFixed(1)} кг
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="h-48">
              <p className="text-sm font-medium text-muted-foreground mb-2">Прогресс последних сессий</p>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                    <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "white",
                        border: "1px solid #e5e7eb",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                    {Object.entries(colorMap).map(([name, color]) => (
                      <Line key={name} type="monotone" dataKey={name} stroke={color} strokeWidth={2} dot={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  Нет данных для графика
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-3 text-xs">
              {Object.entries(colorMap).map(([name, color]) => (
                <div key={name} className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                  <span>{name}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
