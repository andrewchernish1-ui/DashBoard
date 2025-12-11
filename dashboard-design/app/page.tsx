"use client"

import { Header } from "@/components/dashboard/header"
import { ExerciseRM } from "@/components/dashboard/exercise-rm"
import { TelegramMetrics } from "@/components/dashboard/telegram-metrics"
import { PaymentTracking } from "@/components/dashboard/payment-tracking"
import { Events } from "@/components/dashboard/events"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useDashboardData } from "@/hooks/use-dashboard-data"
import { useCallback, useEffect, useState } from "react"

export default function Dashboard() {
  const { data, loading, refreshing, error, refresh, reload } = useDashboardData()
  const isPriming = loading && !data
  const [showWelcome, setShowWelcome] = useState(true)
  const navItems = [
    { id: "all", label: "Вернуться наверх", badge: "⇧" },
    { id: "rm", label: "RM", badge: "RM" },
    { id: "telegram", label: "Telegram", badge: "TG" },
    { id: "payments", label: "Оплаты", badge: "₽" },
    { id: "events", label: "Персональные тренировки", badge: "PT" },
  ]

  const scrollTo = useCallback((id: string) => {
    if (id === "all") {
      window.scrollTo({ top: 0, behavior: "smooth" })
      return
    }
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => setShowWelcome(false), 3200)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 flex-col">
      {showWelcome && (
        <div className="fixed top-16 left-1/2 z-50 -translate-x-1/2 px-4">
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-white/90 backdrop-blur px-4 py-3 shadow-xl">
            <div className="relative mt-1">
              <span className="absolute inline-flex h-3 w-3 rounded-full bg-emerald-400 opacity-75 animate-ping" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
            </div>
            <div className="text-sm">
              <p className="font-semibold text-foreground">Добро пожаловать!</p>
              <p className="text-muted-foreground">Данные подгружаются — можно нажать «Обновить» при необходимости.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowWelcome(false)}
              className="ml-2 text-muted-foreground hover:text-foreground text-sm"
              aria-label="Закрыть приветствие"
            >
              ✕
            </button>
          </div>
        </div>
      )}
      <Header
        onRefresh={refresh}
        refreshing={refreshing}
        lastUpdated={data?.telegram.current?.date ?? null}
      />
      <div className="flex flex-1">
        <aside className="hidden lg:flex w-64 shrink-0 border-r border-border bg-transparent p-4 sticky top-16 h-[calc(100vh-4rem)] overflow-hidden">
          <nav className="flex flex-col gap-2 w-full">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => scrollTo(item.id)}
                className="w-full text-left px-3 py-2 rounded-lg border border-transparent hover:border-emerald-200 hover:bg-emerald-50/70 transition text-sm font-medium text-foreground flex items-center gap-3 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:ring-offset-0 whitespace-normal min-h-11"
              >
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 text-xs font-semibold">
                  {item.badge}
                </span>
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="flex-1 p-6 overflow-auto space-y-4" id="all">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="max-w-6xl mx-auto space-y-6">
            <section id="rm">
              <ExerciseRM data={data?.exercises} loading={isPriming} onChange={reload} />
            </section>
            <section id="telegram">
              <TelegramMetrics data={data?.telegram} loading={isPriming} />
            </section>
            <section id="payments">
              <PaymentTracking data={data?.payments} loading={isPriming} onChange={reload} />
            </section>
            <section id="events">
              <Events data={data?.events} />
            </section>
          </div>
        </main>
      </div>
    </div>
  )
}
