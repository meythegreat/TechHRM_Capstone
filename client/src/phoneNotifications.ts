import axios from 'axios'

const ENDPOINT_KEY = 'techhrm-push-endpoint'

function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index)
  return output
}

export function phoneNotificationsSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function enablePhoneNotifications() {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission

  const registration = await navigator.serviceWorker.ready
  const keyResponse = await axios.get('/api/push/vapid-public-key')
  const existing = await registration.pushManager.getSubscription()
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(keyResponse.data.public_key),
  })
  const body = subscription.toJSON()
  await axios.post('/api/push/subscribe', {
    endpoint: body.endpoint,
    keys: body.keys,
    contentEncoding: 'aes128gcm',
  })
  if (body.endpoint) localStorage.setItem(ENDPOINT_KEY, body.endpoint)
  return permission
}

export async function syncPhoneNotifications() {
  if (!localStorage.getItem('auth_token')) return
  if (!phoneNotificationsSupported() || Notification.permission !== 'granted') return
  try {
    await enablePhoneNotifications()
  } catch {
    // The app still works when the phone cannot refresh its notification registration.
  }
}

export async function unsubscribePhoneNotifications() {
  const endpoint = localStorage.getItem(ENDPOINT_KEY)
  if (!endpoint || !localStorage.getItem('auth_token')) return
  try {
    await axios.delete('/api/push/subscribe', { data: { endpoint } })
  } catch {
    // Sign-out should continue even if the phone could not be unregistered.
  }
  localStorage.removeItem(ENDPOINT_KEY)
}
