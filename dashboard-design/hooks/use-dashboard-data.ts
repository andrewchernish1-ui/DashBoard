"use client"

import { useCallback, useEffect, useState } from "react"
import type { DashboardResponse } from "@/types/dashboard"
import { getDashboardData, triggerDashboardRefresh } from "@/lib/api"

export function useDashboardData() {
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async (showLoader = true) => {
    if (showLoader) {
      setLoading(true)
    }

    try {
      const response = await getDashboardData()
      setData(response)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Неизвестная ошибка")
    } finally {
      if (showLoader) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    fetchData(true)
  }, [fetchData])

  const reload = useCallback(() => fetchData(true), [fetchData])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await triggerDashboardRefresh()
      await fetchData(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка обновления данных")
    } finally {
      setRefreshing(false)
    }
  }, [fetchData])

  return { data, loading, refreshing, error, reload, refresh }
}
