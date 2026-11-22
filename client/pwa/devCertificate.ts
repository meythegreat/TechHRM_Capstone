import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { X509Certificate } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { generate } from 'selfsigned'

export const DEV_CA_PORT = 5174

const certDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.cert')
const caKeyPath = path.join(certDir, 'ca.key')
const caCertPath = path.join(certDir, 'ca.crt')
const caIdPath = path.join(certDir, 'ca.id')
const serverKeyPath = path.join(certDir, 'server.key')
const serverCertPath = path.join(certDir, 'server.crt')

type SetupState = {
  caCert: string
  generation: number
  server?: http.Server
}

const setupSlot = '__wospisDevCa'

export function lanIPv4() {
  const rows: { iface: string; address: string }[] = []
  for (const [iface, addrs] of Object.entries(os.networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) {
        rows.push({ iface, address: addr.address })
      }
    }
  }
  return rows
}

function daysFromNow(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}

function readText(file: string) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return undefined
  }
}

function usableCa(pem: string | undefined): pem is string {
  if (!pem) return false
  try {
    const cert = new X509Certificate(pem)
    return cert.ca && new Date(cert.validTo).getTime() > Date.now()
  } catch {
    return false
  }
}

function serverIsCurrent(pem: string | undefined, caPem: string, ips: string[]) {
  if (!pem) return false
  try {
    const cert = new X509Certificate(pem)
    const ca = new X509Certificate(caPem)
    const week = 7 * 24 * 60 * 60 * 1000
    if (new Date(cert.validTo).getTime() - Date.now() < week) return false
    if (!cert.checkIssued(ca) || !cert.verify(ca.publicKey)) return false
    const san = cert.subjectAltName ?? ''
    const names = ['DNS:localhost', 'IP Address:127.0.0.1', ...ips.map((ip) => `IP Address:${ip}`)]
    return names.every((name) => san.includes(name))
  } catch {
    return false
  }
}

async function createCa() {
  const pems = await generate([{ name: 'commonName', value: 'WoSPIS Dev CA' }], {
    keySize: 2048,
    algorithm: 'sha256',
    notBeforeDate: new Date(Date.now() - 5 * 60 * 1000),
    notAfterDate: daysFromNow(3650),
    extensions: [
      { name: 'basicConstraints', cA: true, pathLenConstraint: 0, critical: true },
      { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true },
    ],
  })
  fs.mkdirSync(certDir, { recursive: true })
  fs.writeFileSync(caKeyPath, pems.private, { mode: 0o600 })
  fs.writeFileSync(caCertPath, pems.cert, { mode: 0o644 })
  fs.writeFileSync(caIdPath, `${cryptoRandom()}\n${cryptoRandom()}\n`, { mode: 0o644 })
  return { key: pems.private, cert: pems.cert }
}

function cryptoRandom() {
  return globalThis.crypto.randomUUID()
}

async function createServerCert(caKey: string, caCert: string, ips: string[]) {
  const pems = await generate([{ name: 'commonName', value: 'localhost' }], {
    keySize: 2048,
    algorithm: 'sha256',
    notBeforeDate: new Date(Date.now() - 5 * 60 * 1000),
    // iOS rejects a server certificate whose lifetime is longer than 398 days.
    notAfterDate: daysFromNow(397),
    ca: { key: caKey, cert: caCert },
    extensions: [
      { name: 'basicConstraints', cA: false, critical: true },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
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
  fs.mkdirSync(certDir, { recursive: true })
  fs.writeFileSync(serverKeyPath, pems.private, { mode: 0o600 })
  fs.writeFileSync(serverCertPath, pems.cert, { mode: 0o644 })
  return { key: pems.private, cert: pems.cert }
}

export async function loadDevHttps() {
  const ips = lanIPv4().map((row) => row.address)
  let caKey = readText(caKeyPath)
  let caCert = readText(caCertPath)
  if (!caKey || !usableCa(caCert)) {
    const created = await createCa()
    caKey = created.key
    caCert = created.cert
  }
  let key = readText(serverKeyPath)
  let cert = readText(serverCertPath)
  if (!key || !serverIsCurrent(cert, caCert, ips)) {
    const created = await createServerCert(caKey, caCert, ips)
    key = created.key
    cert = created.cert
  }
  return { key, cert, caCert }
}

function profileIds() {
  const saved = readText(caIdPath)?.split('\n').map((line) => line.trim()).filter(Boolean) ?? []
  const certId = saved[0] || cryptoRandom()
  const profileId = saved[1] || cryptoRandom()
  if (saved.length < 2) {
    fs.mkdirSync(certDir, { recursive: true })
    fs.writeFileSync(caIdPath, `${certId}\n${profileId}\n`, { mode: 0o644 })
  }
  return { certId, profileId }
}

function mobileconfig(caCert: string) {
  const { certId, profileId } = profileIds()
  const body = caCert
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s+/g, '')
    .replace(/.{1,64}/g, '$&\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>PayloadCertificateFileName</key>
      <string>wospis-dev-ca.cer</string>
      <key>PayloadContent</key>
      <data>
${body}      </data>
      <key>PayloadDescription</key>
      <string>WoSPIS development certificate for this computer.</string>
      <key>PayloadDisplayName</key>
      <string>WoSPIS Dev CA</string>
      <key>PayloadIdentifier</key>
      <string>dev.wospis.ca.certificate</string>
      <key>PayloadType</key>
      <string>com.apple.security.root</string>
      <key>PayloadUUID</key>
      <string>${certId}</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
    </dict>
  </array>
  <key>PayloadDisplayName</key>
  <string>WoSPIS Dev</string>
  <key>PayloadIdentifier</key>
  <string>dev.wospis.ca</string>
  <key>PayloadRemovalDisallowed</key>
  <false/>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>${profileId}</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
</dict>
</plist>
`
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    if (char === '&') return '&amp;'
    if (char === '<') return '&lt;'
    if (char === '>') return '&gt;'
    if (char === '"') return '&quot;'
    return '&#39;'
  })
}

function phoneHost(header: string | undefined) {
  const host = header?.split(':')[0] ?? ''
  if (host === 'localhost' || /^(\d{1,3}\.){3}\d{1,3}$/.test(host)) return host
  return lanIPv4()[0]?.address ?? ''
}

function setupPage(host: string) {
  const appUrl = host ? `https://${host}:5173` : ''
  const appLink = appUrl
    ? `<a href="${escapeHtml(appUrl)}">${escapeHtml(appUrl)}</a>`
    : 'the https address printed in the terminal, port 5173'
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Trust this computer</title>
  <style>
    body { margin: 0; font: 17px/1.45 -apple-system, BlinkMacSystemFont, sans-serif; background: #f4f1ea; color: #1c1915; }
    main { max-width: 34rem; margin: 0 auto; padding: 1.5rem 1.25rem 3rem; }
    h1 { font-size: 1.6rem; line-height: 1.2; margin: 0 0 0.75rem; }
    ol { padding-left: 1.2rem; }
    li { margin: 0.7rem 0; }
    a.button { display: block; margin: 1.25rem 0; padding: 0.9rem 1rem; background: #1f4b3a; color: white; text-align: center; text-decoration: none; border-radius: 0.7rem; font-weight: 650; }
    code { font-size: 0.95em; }
  </style>
</head>
<body>
  <main>
    <h1>Trust this computer once</h1>
    <p>Chrome and Safari on the phone both refuse the site until this certificate is trusted. Open this page in Safari.</p>
    <a class="button" href="/wospis-dev.mobileconfig">Install certificate</a>
    <ol>
      <li>Allow the profile download, then open Settings → General → VPN &amp; Device Management and install <strong>WoSPIS Dev</strong>.</li>
      <li>Open Settings → General → About → Certificate Trust Settings and turn on full trust for <strong>WoSPIS Dev CA</strong>.</li>
      <li>Open the app: ${appLink}</li>
    </ol>
    <p>Use the computer’s address, such as <code>${escapeHtml(host || '192.168.x.x')}</code>. <code>localhost</code> on the phone is the phone itself.</p>
  </main>
</body>
</html>
`
}

function serveSetup(req: http.IncomingMessage, res: http.ServerResponse, caCert: string) {
  const url = req.url?.split('?')[0]
  if (url === '/wospis-dev.mobileconfig') {
    const body = mobileconfig(caCert)
    res.writeHead(200, {
      'Content-Type': 'application/x-apple-aspen-config',
      'Cache-Control': 'no-store',
    })
    res.end(body)
    return
  }
  const host = phoneHost(req.headers.host)
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(setupPage(host))
}

function ensureDevCaSite(caCert: string) {
  const root = globalThis as typeof globalThis & { [setupSlot]?: SetupState }
  const previous = root[setupSlot]
  const state: SetupState = { caCert, generation: (previous?.generation ?? 0) + 1 }
  root[setupSlot] = state
  const start = () => {
    if (root[setupSlot]?.generation !== state.generation) return
    const server = http.createServer((req, res) => {
      const current = root[setupSlot]
      if (!current) {
        res.writeHead(503)
        res.end()
        return
      }
      serveSetup(req, res, current.caCert)
    })
    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE' && root[setupSlot]?.generation === state.generation) {
        setTimeout(start, 200)
        return
      }
      console.error(`Phone certificate page is not available: ${error.message}`)
    })
    server.listen(DEV_CA_PORT, '0.0.0.0')
    state.server = server
  }
  if (previous?.server) previous.server.close(() => start())
  else start()
}

export function devCaPlugin(caCert: string): Plugin {
  return {
    name: 'wospis-dev-ca',
    configureServer() {
      ensureDevCaSite(caCert)
    },
  }
}
