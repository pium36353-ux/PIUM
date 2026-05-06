const scheduled = new Map() // appointmentId -> timeoutId

export async function requestPermission() {
  if (!('Notification' in window)) return 'unsupported'
  return await Notification.requestPermission()
}

export function cancelNotification(appointmentId) {
  const key = String(appointmentId)
  const tid = scheduled.get(key)
  if (tid != null) { clearTimeout(tid); scheduled.delete(key) }
}

async function showViaServiceWorker(title, body, data = {}) {
  if (!('serviceWorker' in navigator)) return
  try {
    const reg = await navigator.serviceWorker.ready
    await reg.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      actions: [{ action: 'complete', title: '✓ Fatto' }],
      data,
      tag: data.appointmentId ? `apt-${data.appointmentId}` : undefined,
    })
  } catch {
    // fallback se SW non supporta showNotification
    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/icon-192.png' })
    }
  }
}

export function scheduleAppointmentNotification(appointment, minutesBefore) {
  if (!appointment?.id || !appointment?.date || !appointment?.start_time) return
  if (Notification.permission !== 'granted') return

  cancelNotification(appointment.id)

  const [h, m] = appointment.start_time.split(':').map(Number)
  const aptTime = new Date(`${appointment.date}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`)
  const notifyAt = new Date(aptTime.getTime() - minutesBefore * 60 * 1000)
  const delay = notifyAt.getTime() - Date.now()

  if (delay < 0) return

  const tid = setTimeout(() => {
    scheduled.delete(String(appointment.id))
    const clientName = appointment.client_name ?? 'Cliente'
    const timeStr = appointment.start_time.slice(0, 5)
    showViaServiceWorker(
      `Appuntamento tra ${minutesBefore} min`,
      `${clientName} alle ${timeStr}`,
      { appointmentId: appointment.id }
    )
  }, delay)

  scheduled.set(String(appointment.id), tid)
}

export async function testNotification() {
  if (Notification.permission !== 'granted') return false
  await showViaServiceWorker(
    'PIUM — Notifica di prova ✓',
    'Le notifiche funzionano correttamente.',
    {}
  )
  return true
}

export function notifyNextAppointment(appointments) {
  const raw = localStorage.getItem('pium_notification_settings')
  const settings = raw ? JSON.parse(raw) : {}
  if (!settings.notifyNextOnComplete) return
  if (Notification.permission !== 'granted') return

  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const timeNow = now.toTimeString().slice(0, 5)

  const next = (appointments ?? [])
    .filter(a => !a.completed)
    .filter(a => a.date > today || (a.date === today && a.start_time > timeNow))
    .sort((a, b) => a.date !== b.date ? a.date.localeCompare(b.date) : a.start_time.localeCompare(b.start_time))[0]

  if (!next) return

  const minutesBefore = Number(settings.appointmentMinutesBefore ?? 15)
  scheduleAppointmentNotification(next, minutesBefore)
}
