import { useEffect, useState } from 'react'
import { Bell, X } from 'lucide-react'
import { enablePhoneNotifications, phoneNotificationsSupported, syncPhoneNotifications } from '../phoneNotifications'

const DISMISS_KEY = 'wospis-push-dismissed'
const DISMISS_MS = 1000 * 60 * 60 * 24 * 30

interface PhoneNotificationPromptProps {
  enabled: boolean
}

function dismissedRecently() {
  const saved = Number(localStorage.getItem(DISMISS_KEY))
  return Number.isFinite(saved) && saved > 0 && Date.now() - saved < DISMISS_MS
}

function isIos() {
  const nav = navigator as Navigator & { platform?: string; maxTouchPoints?: number }
  return /iPad|iPhone|iPod/i.test(navigator.userAgent)
    || (nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1)
}

function isStandalone() {
  const nav = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
}

const PhoneNotificationPrompt = ({ enabled }: PhoneNotificationPromptProps) => {
  const [open, setOpen] = useState(false)
  const [working, setWorking] = useState(false)
  const [detail, setDetail] = useState('')

  useEffect(() => {
    if (!enabled || !phoneNotificationsSupported() || dismissedRecently()) {
      setOpen(false)
      return
    }
    if (Notification.permission === 'granted') {
      setOpen(false)
      void syncPhoneNotifications()
      return
    }
    if (Notification.permission === 'denied') {
      setOpen(false)
      return
    }
    if (isIos() && !isStandalone()) {
      setOpen(false)
      return
    }
    setOpen(true)
  }, [enabled])

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setOpen(false)
  }

  const allow = async () => {
    setWorking(true)
    setDetail('')
    try {
      const permission = await enablePhoneNotifications()
      if (permission === 'granted') {
        setOpen(false)
        return
      }
      setDetail('Notifications stay off until you allow them for WoSPIS.')
    } catch {
      setDetail('The phone could not turn notifications on. Try again from the home screen icon.')
    } finally {
      setWorking(false)
    }
  }

  if (!open) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[5.75rem] z-[61] flex justify-center px-4 print:hidden">
      <section
        aria-label="Phone notifications"
        className="pointer-events-auto relative flex w-full max-w-md items-center gap-3 overflow-hidden rounded-[1.5rem] border border-slate-800 bg-slate-950 p-3.5 text-white shadow-2xl shadow-slate-950/35"
      >
        <div
          className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-indigo-500/25 blur-2xl"
          aria-hidden="true"
        />
        <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 text-blue-300 ring-1 ring-blue-400/30">
          <Bell className="h-5 w-5" />
        </div>
        <div className="relative z-10 min-w-0 flex-1">
          <h2 className="text-sm font-black tracking-tight text-white">Phone Notifications</h2>
          <p className="mt-0.5 text-xs font-medium leading-relaxed text-slate-300">
            {detail || 'Alerts can appear on this phone even when WoSPIS is closed.'}
          </p>
        </div>
        <button
          type="button"
          onClick={allow}
          disabled={working}
          className="relative z-10 shrink-0 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm shadow-blue-600/30 transition hover:bg-blue-500 disabled:opacity-60"
        >
          {working ? 'Asking…' : 'Allow'}
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="relative z-10 shrink-0 rounded-xl border border-white/10 bg-white/5 p-1.5 text-slate-300 transition hover:bg-white/15 hover:text-white"
          aria-label="Dismiss phone notifications"
        >
          <X className="h-4 w-4" />
        </button>
      </section>
    </div>
  )
}

export default PhoneNotificationPrompt
