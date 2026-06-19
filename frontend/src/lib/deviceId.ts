const STORAGE_KEY = 'llamadas_device_id'

export function getDeviceId(): string {
  let id = localStorage.getItem(STORAGE_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(STORAGE_KEY, id)
  }
  return id
}

export function detectPlatform(): 'desktop' | 'mobile' | 'tablet' {
  const ua = navigator.userAgent
  if (/tablet|ipad|playbook|silk/i.test(ua)) return 'tablet'
  if (/mobile|iphone|ipod|android|blackberry|opera mini/i.test(ua)) return 'mobile'
  return 'desktop'
}
