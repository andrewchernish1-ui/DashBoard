import type { DashboardResponse, RefreshResponse } from "@/types/dashboard"

const getBaseUrl = () => {
  const base = process.env.NEXT_PUBLIC_BACKEND_URL
  if (!base) {
    throw new Error("NEXT_PUBLIC_BACKEND_URL не настроен")
  }
  return base.replace(/\/$/, "")
}

export async function getDashboardData(): Promise<DashboardResponse> {
  const response = await fetch(`${getBaseUrl()}/api/dashboard`, {
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error("Не удалось загрузить данные панели")
  }

  return response.json()
}

export async function triggerDashboardRefresh(): Promise<RefreshResponse> {
  const response = await fetch(`${getBaseUrl()}/api/refresh`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
  })

  if (!response.ok) {
    throw new Error("Не удалось инициировать обновление данных")
  }

  return response.json()
}

export async function addPayment(data: {
  name: string
  amount: number
  plan?: string | null
  status?: string | null
  nextPayment?: string | null
  notes?: string | null
  apiKey?: string
}) {
  const response = await fetch(`${getBaseUrl()}/api/payments/add`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(data.apiKey ? { "x-api-key": data.apiKey } : {}),
    },
    body: JSON.stringify({
      name: data.name,
      amount: data.amount,
      plan: data.plan,
      status: data.status,
      nextPayment: data.nextPayment,
      notes: data.notes,
    }),
  })
  if (!response.ok) {
    throw new Error("Не удалось добавить оплату")
  }
  return response.json()
}

export async function updatePayment(params: {
  match: { name: string; plan?: string | null; amount?: number | null; status?: string | null; nextPayment?: string | null }
  data: { name: string; amount: number; plan?: string | null; status?: string | null; nextPayment?: string | null; notes?: string | null }
  apiKey?: string
}) {
  const response = await fetch(`${getBaseUrl()}/api/payments/update`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      ...(params.apiKey ? { "x-api-key": params.apiKey } : {}),
    },
    body: JSON.stringify(params),
  })
  if (!response.ok) {
    throw new Error("Не удалось обновить оплату")
  }
  return response.json()
}

export async function deletePayment(match: {
  name: string
  plan?: string | null
  amount?: number | null
  status?: string | null
  nextPayment?: string | null
  apiKey?: string
}) {
  const response = await fetch(`${getBaseUrl()}/api/payments/delete`, {
    method: "DELETE",
    headers: {
      "content-type": "application/json",
      ...(match.apiKey ? { "x-api-key": match.apiKey } : {}),
    },
    body: JSON.stringify(match),
  })
  if (!response.ok) {
    throw new Error("Не удалось удалить оплату")
  }
  return response.json()
}

export async function addExercise(data: { name: string; weight: number; apiKey?: string }) {
  const response = await fetch(`${getBaseUrl()}/api/exercises/add`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(data.apiKey ? { "x-api-key": data.apiKey } : {}),
    },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    throw new Error("Не удалось добавить RM")
  }
  return response.json()
}
