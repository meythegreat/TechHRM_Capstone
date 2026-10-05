import os from 'node:os'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { generate } from 'selfsigned'

function lanIPv4() {
  const rows: { iface: string; address: string }[] = []
  for (const [iface, addrs] of Object.entries(os.networkInterfaces())) {
    for (const addr of addrs ?? []) {
      const family = addr.family === 'IPv4' || addr.family === 4
      if (family && !addr.internal) {
        rows.push({ iface, address: addr.address })
      }
    }
  }
  return rows
}

function lanPhonePlugin(): Plugin {
  return {
    name: 'lan-phone-urls',
    configureServer(server) {
      let last = ''
      const logUrls = (reason?: string) => {
        const rows = lanIPv4()
        const next = rows.map((row) => `${row.iface}:${row.address}`).sort().join(',')
        if (next === last) return
        last = next
        const logger = server.config.logger
        if (reason) {
          logger.info(`\n  Network changed (${reason}). New phone URLs:`)
        } else {
          logger.info('\n  Phone URLs (use the IP on the same network as the phone):')
        }
        if (!rows.length) {
          logger.warn('  No LAN address yet. Join Wi-Fi or plug in Ethernet.')
          return
        }
        const port = server.config.server.port ?? 5173
        for (const row of rows) {
          logger.info(`    https://${row.address}:${port}  (${row.iface})`)
        }
      }

      const listen = () => logUrls()
      if (server.httpServer?.listening) listen()
      else server.httpServer?.once('listening', listen)

      const timer = setInterval(() => logUrls('Wi-Fi / Ethernet'), 8000)
      timer.unref()
      const stop = () => clearInterval(timer)
      server.httpServer?.once('close', stop)
    },
  }
}

async function devCertificate() {
  const ips = lanIPv4().map((row) => row.address)
  const pems = await generate([{ name: 'commonName', value: 'localhost' }], {
    keySize: 2048,
    algorithm: 'sha256',
    extensions: [
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 7, ip: '127.0.0.1' },
          ...ips.map((ip) => ({ type: 7 as const, ip })),
        ],
      },
    ],
  })

  return { key: pems.private, cert: pems.cert }
}

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss(), lanPhonePlugin()],
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
    allowedHosts: true,
    // Phones only show the camera prompt on HTTPS. A LAN http:// address never asks.
    https: await devCertificate(),
    // Do not pin hmr.host. The browser uses the hostname it loaded
    // (localhost, Wi-Fi IP, or Ethernet IP).
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/sanctum': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
}))
