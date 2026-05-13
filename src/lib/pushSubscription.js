import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

export async function subscribePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { error: 'unsupported' }
  }
  if (Notification.permission !== 'granted') return { error: 'permission_denied' }
  if (!VAPID_PUBLIC_KEY) return { error: 'no_vapid_key' }

  try {
    const reg = await navigator.serviceWorker.ready
    const existing = await reg.pushManager.getSubscription()
    const sub = existing ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { error: 'unauthenticated' }

    const { data: biz } = await supabase
      .from('businesses').select('id').eq('user_id', session.user.id).maybeSingle()
    if (!biz) return { error: 'no_business' }

    const { error } = await supabase.from('push_subscriptions').upsert({
      user_id: session.user.id,
      business_id: biz.id,
      endpoint: sub.endpoint,
      subscription: sub.toJSON(),
    }, { onConflict: 'user_id,endpoint' })

    if (error) return { error: error.message }
    return { ok: true }
  } catch (err) {
    return { error: err.message }
  }
}

export async function unsubscribePush() {
  if (!('serviceWorker' in navigator)) return

  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return

  const endpoint = sub.endpoint
  await sub.unsubscribe()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return

  await supabase.from('push_subscriptions')
    .delete()
    .eq('user_id', session.user.id)
    .eq('endpoint', endpoint)
}

export async function isPushSubscribed() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  return sub !== null
}
