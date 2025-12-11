"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AlertCircle, Clock, CheckCircle, CalendarDays, BellRing, Loader2, Pencil, Trash2 } from "lucide-react"
import type { PaymentData, PaymentItem } from "@/types/dashboard"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useState } from "react"
import { addPayment, deletePayment, updatePayment } from "@/lib/api"

type PaymentTrackingProps = {
  data?: PaymentData
  loading: boolean
  onChange?: () => void
}

const formatCurrency = (value: number) =>
  value.toLocaleString("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 })

function getStatusConfig(status: string) {
  switch (status) {
    case "urgent":
      return {
        icon: AlertCircle,
        color: "text-red-500",
        bg: "bg-red-50",
        badge: "destructive" as const,
        label: "Срочно",
      }
    case "warning":
      return {
        icon: Clock,
        color: "text-amber-500",
        bg: "bg-amber-50",
        badge: "secondary" as const,
        label: "Скоро",
      }
    default:
      return {
        icon: CheckCircle,
        color: "text-emerald-500",
        bg: "bg-emerald-50",
        badge: "outline" as const,
        label: "Норма",
      }
  }
}

function formatDate(dateString?: string | null) {
  if (!dateString) return "—"
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return dateString
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
}

function getDaysUntil(dateString?: string | null) {
  if (!dateString) return null
  const target = new Date(dateString)
  if (Number.isNaN(target.getTime())) return null
  const today = new Date()
  const diffTime = target.getTime() - today.getTime()
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

export function PaymentTracking({ data, loading, onChange }: PaymentTrackingProps) {
  const [form, setForm] = useState({
    name: "",
    amount: "",
    plan: "",
    status: "ok",
    nextPayment: "",
    notes: "",
  })
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editSource, setEditSource] = useState<PaymentItem | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const resetForm = () =>
    setForm({
      name: "",
      amount: "",
      plan: "",
      status: "ok",
      nextPayment: "",
      notes: "",
    })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setActionLoading(true)
    setActionError(null)
    const amountNumber = Number(String(form.amount).replace(",", "."))
    if (Number.isNaN(amountNumber)) {
      setActionError("Сумма должна быть числом")
      setActionLoading(false)
      return
    }
    try {
      if (editingId && editSource) {
        await updatePayment({
          match: {
            name: editSource.name,
            plan: editSource.plan,
            amount: editSource.amount ?? undefined,
            status: editSource.status,
            nextPayment: editSource.nextPayment,
          },
          data: {
            name: form.name || editSource.name,
            plan: form.plan || null,
            amount: amountNumber,
            status: form.status,
            nextPayment: form.nextPayment || null,
            notes: form.notes || null,
          },
        })
      } else {
        await addPayment({
          name: form.name,
          amount: amountNumber,
          plan: form.plan || null,
          status: form.status,
          nextPayment: form.nextPayment || null,
          notes: form.notes || null,
        })
      }
      resetForm()
      setEditingId(null)
      setEditSource(null)
      onChange?.()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Не удалось сохранить")
    } finally {
      setActionLoading(false)
    }
  }

  const handleEdit = (item: PaymentItem) => {
    setEditingId(item.id)
    setEditSource(item)
    setForm({
      name: item.name,
      amount: item.amount?.toString() ?? "",
      plan: item.plan ?? "",
      status: item.status,
      nextPayment: item.nextPayment ?? "",
      notes: item.notes ?? "",
    })
  }

  const handleDelete = async (item: PaymentItem) => {
    setActionLoading(true)
    setActionError(null)
    try {
      await deletePayment({
        name: item.name,
        plan: item.plan ?? null,
        amount: item.amount ?? null,
        status: item.status,
        nextPayment: item.nextPayment ?? null,
      })
      if (editingId === item.id) {
        resetForm()
        setEditingId(null)
        setEditSource(null)
      }
      onChange?.()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Не удалось удалить")
    } finally {
      setActionLoading(false)
    }
  }

  const handleRemindClick = (client: PaymentItem) => {
    console.log("Reminder trigger:", client.name, client.nextPayment)
  }

  if (loading && !data) {
    return (
      <Card className="col-span-1">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-100 animate-pulse" />
            Оплата онлайн-клиентов
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </CardContent>
      </Card>
    )
  }

  const summary = data?.summary
  const clients = data?.items ?? []
  const urgentCount = summary?.urgent ?? 0
  const warningCount = summary?.warning ?? 0
  const totalExpected = summary?.expectedTotal ?? 0
  const overdueAmount = summary?.overdueAmount ?? 0
  const nextSeven = summary?.nextSevenDays ?? 0
  const overduePercent = totalExpected > 0 ? Math.round((overdueAmount / totalExpected) * 100) : 0

  return (
    <Card className="col-span-1">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
            <span className="text-amber-600 text-sm">₽</span>
          </div>
          Оплата онлайн-клиентов
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="space-y-2" onSubmit={handleSubmit}>
          <p className="text-sm font-medium text-muted-foreground">
            {editingId ? "Редактирование оплаты" : "Новая оплата"}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="Клиент"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
            <Input
              placeholder="Сумма"
              value={form.amount}
              onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
              required
            />
            <Input
              placeholder="План"
              value={form.plan}
              onChange={(e) => setForm((prev) => ({ ...prev, plan: e.target.value }))}
            />
            <Input
              placeholder="Следующая оплата (YYYY-MM-DD)"
              value={form.nextPayment}
              onChange={(e) => setForm((prev) => ({ ...prev, nextPayment: e.target.value }))}
            />
            <select
              className="h-10 rounded-md border bg-background px-2 text-sm"
              value={form.status}
              onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
            >
              <option value="ok">Норма</option>
              <option value="warning">Скоро</option>
              <option value="urgent">Срочно</option>
            </select>
            <Input
              placeholder="Примечание"
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={actionLoading}>
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : editingId ? "Сохранить" : "Добавить"}
            </Button>
            {editingId && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  resetForm()
                  setEditingId(null)
                  setEditSource(null)
                }}
              >
                Отмена
              </Button>
            )}
            {actionError && <span className="text-xs text-destructive">{actionError}</span>}
          </div>
        </form>

        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-center">
            <p className="text-2xl font-bold text-red-600">{urgentCount}</p>
            <p className="text-xs text-red-600">Срочно</p>
          </div>
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 text-center">
            <p className="text-2xl font-bold text-amber-600">{warningCount}</p>
            <p className="text-xs text-amber-600">На этой неделе</p>
          </div>
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-center">
            <p className="text-2xl font-bold text-emerald-600">
              {totalExpected ? formatCurrency(totalExpected) : "—"}
            </p>
            <p className="text-xs text-emerald-600">Ожидается</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-xl border bg-muted/30">
            <p className="text-xs text-muted-foreground">Просрочено</p>
            <p className="text-lg font-semibold text-destructive">
              {overdueAmount ? formatCurrency(overdueAmount) : "—"}
            </p>
            <p className="text-xs text-muted-foreground">{overduePercent}% от ожиданий</p>
          </div>
          <div className="p-3 rounded-xl border bg-muted/30">
            <p className="text-xs text-muted-foreground">В течение 7 дней</p>
            <p className="text-lg font-semibold text-emerald-600">
              {nextSeven ? formatCurrency(nextSeven) : "—"}
            </p>
            <p className="text-xs text-muted-foreground">Планируй напоминания</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">Напоминания о продлении</p>
            <Badge variant="secondary" className="text-xs">
              {clients.length} клиентов
            </Badge>
          </div>

          {clients.length === 0 ? (
            <div className="p-4 rounded-xl border text-sm text-muted-foreground">Нет активных клиентов</div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {clients.map((client) => {
                const statusConfig = getStatusConfig(client.status)
                const daysUntil = getDaysUntil(client.nextPayment)

                return (
                  <div key={client.id} className={`p-3 rounded-xl border ${statusConfig.bg} border-opacity-50`}>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <statusConfig.icon className={`w-4 h-4 ${statusConfig.color}`} />
                        <span className="font-medium text-sm text-foreground">{client.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Badge variant={statusConfig.badge} className="text-xs">
                          {statusConfig.label}
                        </Badge>
                        <button
                          type="button"
                          onClick={() => handleEdit(client)}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(client)}
                          className="text-xs text-destructive hover:opacity-80"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <CalendarDays className="w-3 h-3" />
                        <span>Оплата: {formatDate(client.nextPayment)}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-medium text-foreground">
                          {client.amount ? formatCurrency(client.amount) : "—"}
                        </span>
                      </div>
                      <div className="text-muted-foreground">
                        <span>План: {client.plan ?? "—"}</span>
                      </div>
                      <div className="text-right">
                        <span
                          className={`font-medium ${
                            daysUntil !== null
                              ? daysUntil <= 3
                                ? "text-red-500"
                                : daysUntil <= 7
                                  ? "text-amber-500"
                                  : "text-muted-foreground"
                              : "text-muted-foreground"
                          }`}
                        >
                          {daysUntil === null ? "—" : daysUntil > 0 ? `Через ${daysUntil} дн.` : "Сегодня"}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 flex justify-between items-center">
                      <p className="text-xs text-muted-foreground truncate">{client.notes ?? "Без примечаний"}</p>
                      <button
                        type="button"
                        onClick={() => handleRemindClick(client)}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <BellRing className="w-3 h-3" />
                        Напомнить
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
