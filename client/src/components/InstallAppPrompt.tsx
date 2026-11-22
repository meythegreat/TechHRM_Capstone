import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'

const DISMISS_KEY = 'wospis-install-dismissed'
const DISMISS_MS = 1000 * 60 * 60 * 24 * 30

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type PromptMode = 'hidden' | 'ios' | 'native' | 'menu'

function dismissedRecently() {
  const saved = Number(localStorage.getItem(DISMISS_KEY))
  return Number.isFinite(saved) && saved > 0 && Date.now() - saved < DISMISS_MS
}

function isStandalone() {
  const nav = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
}

function isIos() {
  const nav = navigator as Navigator & { platform?: string; maxTouchPoints?: number }
  return /iPad|iPhone|iPod/i.test(navigator.userAgent)
    || (nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1)
}

function isIosSafari() {
  return isIos() && /Safari/i.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(navigator.userAgent)
}

const InstallAppPrompt = () => {
  const [mode, setMode] = useState<PromptMode>('hidden')
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    if (mode === 'hidden') {
      delete document.documentElement.dataset.pwaInstall
      return
    }
    document.documentElement.dataset.pwaInstall = 'open'
    return () => {
      delete document.documentElement.dataset.pwaInstall
    }
  }, [mode])

  useEffect(() => {
    if (isStandalone() || dismissedRecently()) return

    const onInstalled = () => setMode('hidden')
    window.addEventListener('appinstalled', onInstalled)

    if (isIos()) {
      setMode('ios')
      return () => window.removeEventListener('appinstalled', onInstalled)
    }

    const onPrompt = (event: Event) => {
      event.preventDefault()
      setDeferred(event as BeforeInstallPromptEvent)
      setMode('native')
    }
    window.addEventListener('beforeinstallprompt', onPrompt)

    const phone = window.matchMedia('(pointer: coarse)').matches
    if (phone) setMode('menu')

    return () => {
      window.removeEventListener('appinstalled', onInstalled)
      window.removeEventListener('beforeinstallprompt', onPrompt)
    }
  }, [])

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setMode('hidden')
  }

  const install = async () => {
    if (!deferred) return
    setInstalling(true)
    try {
      await deferred.prompt()
      const choice = await deferred.userChoice
      if (choice.outcome === 'accepted') setMode('hidden')
      setDeferred(null)
    } finally {
      setInstalling(false)
    }
  }

  if (mode === 'hidden') return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] print:hidden">
      <section
        aria-label="Install WoSPIS"
        className="pointer-events-auto relative flex w-full max-w-md items-center gap-3 overflow-hidden rounded-[1.5rem] border border-slate-800 bg-slate-950 p-3.5 text-white shadow-2xl shadow-slate-950/35"
      >
        <div
          className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-blue-600/25 blur-2xl"
          aria-hidden="true"
        />
        <img src="/icons/icon-192.png" alt="" className="relative z-10 h-10 w-10 shrink-0 rounded-xl ring-1 ring-white/15" />
        <div className="relative z-10 min-w-0 flex-1">
          <h2 className="text-sm font-black tracking-tight text-white">Install WoSPIS</h2>
          <p className="mt-0.5 text-xs font-medium leading-relaxed text-slate-300">
            {mode === 'ios' && (isIosSafari()
              ? 'Tap Share, then Add to Home Screen. It opens as its own app.'
              : 'Open this page in Safari, tap Share, then Add to Home Screen.')}
            {mode === 'native' && 'Adds a home screen icon that opens WoSPIS as its own app.'}
            {mode === 'menu' && 'In the browser menu, tap Install app or Add to Home screen.'}
          </p>
        </div>
        {mode === 'native' && (
          <button
            type="button"
            onClick={install}
            disabled={installing}
            className="relative z-10 inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm shadow-blue-600/30 transition hover:bg-blue-500 disabled:opacity-60"
          >
            <Download className="h-3.5 w-3.5" />
            {installing ? 'Installing…' : 'Install'}
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          className="relative z-10 shrink-0 rounded-xl border border-white/10 bg-white/5 p-1.5 text-slate-300 transition hover:bg-white/15 hover:text-white"
          aria-label="Dismiss install prompt"
        >
          <X className="h-4 w-4" />
        </button>
      </section>
    </div>
  )
}

export default InstallAppPrompt
