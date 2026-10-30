import { useEffect, useState } from 'react'
import { Bell, X } from 'lucide-react'
import { enablePhoneNotifications, phoneNotificationsSupported, syncPhoneNotifications } from '../phoneNotifications'

const DISMISS_KEY = 'techhrm-push-dismissed'
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
      setDetail('Notifications stay off until you allow them for TechHRM.')
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
        className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_12px_40px_rgba(15,23,42,0.16)]"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
          <Bell className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-slate-900">Phone notifications</h2>
          <p className="text-xs font-medium leading-relaxed text-slate-600">
            {detail || 'Alerts can appear on this phone even when TechHRM is closed.'}
          </p>
        </div>
        <button
          type="button"
          onClick={allow}
          disabled={working}
          className="shrink-0 rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          {working ? 'Asking…' : 'Allow'}
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Dismiss phone notifications"
        >
          <X className="h-4 w-4" />
        </button>
      </section>
    </div>
  )
}

export default PhoneNotificationPrompt
