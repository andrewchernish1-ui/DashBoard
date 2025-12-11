export type TelegramStat = {
  date: string
  subscribers: number
  total_views_24h: number
  created_at: number
}

export type TelegramPost = {
  post_id: string
  channel_name: string
  title: string
  content: string
  link: string
  published_at: string | null
  views: number
}

export type TelegramAggregates = {
  subscribers: {
    current: number
    changeToday: number
    changeWeek: number
    changeMonth: number
  }
  views: {
    today: number
    week: number
    month: number
  }
}

export type TelegramData = {
  history: TelegramStat[]
  current: TelegramStat | null
  aggregates: TelegramAggregates
  posts: TelegramPost[]
}

export type FocusExerciseMetric = {
  name: string
  current: number | null
  previous: number | null
  changePercent: number
}

export type ExerciseTimelinePoint = {
  date: string
  [exercise: string]: string | number | null
}

export type ExerciseData = {
  latestDate: string | null
  focus: FocusExerciseMetric[]
  timeline: ExerciseTimelinePoint[]
}

export type PaymentItem = {
  id: number
  name: string
  plan: string | null
  amount: number | null
  status: string
  nextPayment: string | null
  notes: string | null
}

export type PaymentSummary = {
  total: number
  urgent: number
  warning: number
  ok: number
  expectedTotal: number
  overdueAmount: number
  nextSevenDays: number
}

export type PaymentData = {
  summary: PaymentSummary
  items: PaymentItem[]
}

export type CalendarEvent = {
  id: string
  summary: string
  start: string | null
  end: string | null
  location: string | null
  description: string | null
}

export type EventsData = {
  items: CalendarEvent[]
}

export type DashboardResponse = {
  telegram: TelegramData
  exercises: ExerciseData
  payments: PaymentData
  events?: EventsData
}

export type RefreshResponse = {
  success: boolean
  timestamp: string
}
