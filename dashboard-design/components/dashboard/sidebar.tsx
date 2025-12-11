"use client"

import { cn } from "@/lib/utils"
import { LayoutDashboard, Dumbbell, Send, CreditCard, Settings, User } from "lucide-react"
import { useState } from "react"

const navItems = [
  { icon: LayoutDashboard, label: "Панель", active: true },
  { icon: Dumbbell, label: "Тренировки", active: false },
  { icon: Send, label: "Telegram", active: false },
  { icon: CreditCard, label: "Оплаты", active: false },
  { icon: Settings, label: "Настройки", active: false },
]

export function Sidebar() {
  const [activeIndex, setActiveIndex] = useState(0)

  return (
    <aside className="w-64 bg-card border-r border-border flex flex-col">
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center">
            <span className="text-white font-bold text-lg">F</span>
          </div>
          <span className="font-semibold text-lg text-foreground">FitTracker</span>
        </div>
      </div>

      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {navItems.map((item, index) => (
            <li key={item.label}>
              <button
                onClick={() => setActiveIndex(index)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-left",
                  activeIndex === index ? "bg-emerald-50 text-emerald-600" : "text-muted-foreground hover:bg-muted",
                )}
              >
                <item.icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
                {activeIndex === index && <div className="ml-auto w-2 h-2 rounded-full bg-emerald-500" />}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
            <User className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="font-medium text-sm text-foreground">Тренер</p>
            <p className="text-xs text-muted-foreground">Онлайн</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
