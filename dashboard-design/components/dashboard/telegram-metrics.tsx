"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, Eye, TrendingUp, TrendingDown, Loader2, ExternalLink } from "lucide-react"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import type { TelegramData } from "@/types/dashboard"

type Props = {
  data?: TelegramData
  loading?: boolean
}

const formatNumber = (value: number) => value.toLocaleString("ru-RU")

const formatDateLabel = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
}

export function TelegramMetrics({ data, loading }: Props) {
  const history = data?.history ?? []
  const posts = data?.posts ?? []

  const latestViewsChange =
    history.length > 1 ? history[history.length - 1]!.total_views_24h - history[history.length - 2]!.total_views_24h : 0

  const subscriberMetrics = {
    label: "Подписчики",
    icon: Users,
    today: data?.aggregates.subscribers.current ?? 0,
    week: data?.aggregates.subscribers.changeWeek ?? 0,
    month: data?.aggregates.subscribers.changeMonth ?? 0,
    change: data?.aggregates.subscribers.changeToday ?? 0,
    color: "text-blue-500",
  }

  const viewMetrics = {
    label: "Просмотры",
    icon: Eye,
    today: data?.aggregates.views.today ?? 0,
    week: data?.aggregates.views.week ?? 0,
    month: data?.aggregates.views.month ?? 0,
    change: latestViewsChange,
    color: "text-teal-500",
  }

  const subscribersChart = history.slice(-7).map((point) => ({
    label: formatDateLabel(point.date),
    value: point.subscribers,
  }))

  const viewsChart = history.slice(-7).map((point) => ({
    label: formatDateLabel(point.date),
    value: point.total_views_24h,
  }))

  return (
    <Card className="col-span-1">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
            <span className="text-blue-600 text-sm">TG</span>
          </div>
          Статистика по моему TG-каналу
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && history.length === 0 ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {[subscriberMetrics, viewMetrics].map((metric) => (
              <div key={metric.label} className="p-3 rounded-xl bg-muted/50 border border-border">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <metric.icon className={`w-4 h-4 ${metric.color}`} />
                    <span className="font-medium text-sm">{metric.label}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {metric.change >= 0 ? (
                      <TrendingUp className="w-3 h-3 text-emerald-500" />
                    ) : (
                      <TrendingDown className="w-3 h-3 text-red-500" />
                    )}
                    <span className={`text-xs font-medium ${metric.change >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {metric.change >= 0 ? "+" : ""}
                      {metric.change.toLocaleString("ru-RU")}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-lg font-bold text-foreground">{formatNumber(metric.today)}</p>
                    <p className="text-xs text-muted-foreground">Сегодня</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-foreground">{formatNumber(metric.week)}</p>
                    <p className="text-xs text-muted-foreground">Неделя</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-foreground">{formatNumber(metric.month)}</p>
                    <p className="text-xs text-muted-foreground">Месяц</p>
                  </div>
                </div>
              </div>
            ))}

            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Подписчики (7 дней)</p>
              <div className="h-24">
                {subscribersChart.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={subscribersChart}>
                      <defs>
                        <linearGradient id="subscribersGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                      <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "white",
                          border: "1px solid #e5e7eb",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                      />
                      <Area type="monotone" dataKey="value" stroke="#3b82f6" fill="url(#subscribersGradient)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-xs text-muted-foreground">Нет данных</div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Просмотры (7 дней)</p>
              <div className="h-24">
                {viewsChart.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={viewsChart}>
                      <defs>
                        <linearGradient id="viewsGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                      <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "white",
                          border: "1px solid #e5e7eb",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                      />
                      <Area type="monotone" dataKey="value" stroke="#14b8a6" fill="url(#viewsGradient)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-xs text-muted-foreground">Нет данных</div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Свежие посты</p>
              <div className="space-y-2">
                {posts.map((post) => (
                  <div key={post.post_id} className="p-3 rounded-xl border border-border bg-muted/30 space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{post.channel_name}</span>
                      <span>{post.views ? post.views.toLocaleString("ru-RU") : "-"}</span>
                    </div>
                    <p className="text-sm font-semibold text-foreground">{post.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{post.content}</p>
                    <a
                      href={post.link}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-600 flex items-center gap-1 mt-1 hover:underline"
                    >
                      Читать полностью <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ))}
                {posts.length === 0 && (
                  <div className="text-xs text-muted-foreground text-center py-4">Нет данных о постах</div>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}



