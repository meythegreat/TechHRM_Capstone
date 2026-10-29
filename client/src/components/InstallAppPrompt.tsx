import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'

const DISMISS_KEY = 'techhrm-install-dismissed'
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
        aria-label="Install TechHRM"
        className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_12px_40px_rgba(15,23,42,0.16)]"
      >
        <img src="/icons/icon-192.png" alt="" className="h-10 w-10 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-slate-900">Install TechHRM</h2>
          <p className="text-xs font-medium leading-relaxed text-slate-600">
            {mode === 'ios' && (isIosSafari()
              ? 'Tap Share, then Add to Home Screen. It opens as its own app.'
              : 'Open this page in Safari, tap Share, then Add to Home Screen.')}
            {mode === 'native' && 'Adds a home screen icon that opens TechHRM as its own app.'}
            {mode === 'menu' && 'In the browser menu, tap Install app or Add to Home screen.'}
          </p>
        </div>
        {mode === 'native' && (
          <button
            type="button"
            onClick={install}
            disabled={installing}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-60"
          >
            <Download className="h-4 w-4" />
            {installing ? 'Installing…' : 'Install'}
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Dismiss install prompt"
        >
          <X className="h-4 w-4" />
        </button>
      </section>
    </div>
  )
}

export default InstallAppPrompt
