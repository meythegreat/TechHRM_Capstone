import type { ClientRequest, IncomingMessage } from 'node:http'
import { createRequire } from 'node:module'
import { defineConfig, type Plugin, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { DEV_CA_PORT, devCaPlugin, lanIPv4, loadDevHttps } from './pwa/devCertificate.ts'
import { pwaPlugin } from './pwa/plugin.ts'

const require = createRequire(import.meta.url)
const QRCode = require('qrcode') as {
  toString: (
    text: string,
    opts: { type: 'terminal'; small: true },
  ) => Promise<string>
}

function clientAddress(req: IncomingMessage): string {
  const raw = req.socket.remoteAddress ?? ''
  const socketIp = raw.startsWith('::ffff:') ? raw.slice('::ffff:'.length) : raw
  // Apache on this machine reverse-proxies port 80, so the socket is loopback.
  // Keep the visitor address Apache already put in X-Forwarded-For.
  const loopback = socketIp === '127.0.0.1' || socketIp === '::1'
  const forwarded = req.headers['x-forwarded-for']
  if (loopback && typeof forwarded === 'string' && forwarded.trim()) {
    const client = forwarded.split(',')[0]?.trim() ?? ''
    if (client) return client
  }
  return socketIp
}

function apiProxy(): ProxyOptions {
  return {
    target: 'http://127.0.0.1:8000',
    changeOrigin: true,
    configure(proxy) {
      proxy.on('proxyReq', (proxyReq: ClientRequest, req: IncomingMessage) => {
        const ip = clientAddress(req)
        if (ip) {
          proxyReq.setHeader('X-Forwarded-For', ip)
        }
      })
    },
  }
}

function lanPhonePlugin(): Plugin {
  return {
    name: 'lan-phone-urls',
    configureServer(server) {
      let last = ''
      let seq = 0
      const logUrls = async (reason?: string) => {
        const rows = lanIPv4()
        const next = rows.map((row) => `${row.iface}:${row.address}`).sort().join(',')
        if (next === last) return
        last = next
        const id = ++seq
        const logger = server.config.logger
        if (reason) {
          logger.info(`\n  Network changed (${reason}). Phone setup:`)
        } else {
          logger.info('\n  Phone setup (Safari, same Wi-Fi). Trust the certificate, then open the app:')
        }
        if (!rows.length) {
          logger.warn('  No LAN address yet. Join Wi-Fi or plug in Ethernet.')
          return
        }
        const port = server.config.server.port ?? 5173
        for (const row of rows) {
          if (id !== seq) return
          const setup = `http://${row.address}:${DEV_CA_PORT}`
          const url = `https://${row.address}:${port}`
          logger.info(`    ${setup}  (${row.iface})`)
          logger.info(`    Then open ${url}`)
          logger.info('    Scan to trust this computer:')
          const qr = await QRCode.toString(setup, { type: 'terminal', small: true })
          if (id !== seq) return
          process.stdout.write(qr.endsWith('\n') ? qr : `${qr}\n`)
        }
      }

      const listen = () => {
        void logUrls()
      }
      if (server.httpServer?.listening) listen()
      else server.httpServer?.once('listening', listen)

      const timer = setInterval(() => {
        void logUrls('Wi-Fi / Ethernet')
      }, 8000)
      timer.unref()
      const stop = () => clearInterval(timer)
      server.httpServer?.once('close', stop)
    },
  }
}

export default defineConfig(async ({ command }) => {
  // HTTPS is only needed while `vite` is serving the app for a phone.
  const devHttps = command === 'serve' ? await loadDevHttps() : undefined
  return {
    plugins: [
      react(),
      tailwindcss(),
      lanPhonePlugin(),
      ...(devHttps ? [devCaPlugin(devHttps.caCert)] : []),
      pwaPlugin(),
    ],
    // Keep React and React DOM singletons when dependencies such as
    // Framer Motion are optimized by Vite. Without this, Vite can resolve a
    // second React copy from the repository root and crash at runtime.
    resolve: {
      dedupe: ['react', 'react-dom'],
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      allowedHosts: true as const,
      // Phones only show the camera prompt on HTTPS. A LAN http:// address never asks.
      https: devHttps ? { key: devHttps.key, cert: devHttps.cert } : undefined,
      // Do not pin hmr.host. The browser uses the hostname it loaded
      // (localhost, Wi-Fi IP, or Ethernet IP).
      proxy: {
        '/api': apiProxy(),
        '/sanctum': apiProxy(),
      },
    },
  }
})
