import { useEffect, useState } from 'react'
import { API_BASE } from '../../constants'
import { urlBase64ToUint8Array, withTimeout } from '../../utils/push'

export default function PwaControls({ onAction }) {
    const [installPrompt, setInstallPrompt] = useState(null)
    const [pushEnabled, setPushEnabled] = useState(false)
    const [pushBusy, setPushBusy] = useState(false)
    const [pushStatus, setPushStatus] = useState('')
    const isStandalone = ['standalone', 'fullscreen', 'minimal-ui'].some((mode) => window.matchMedia(`(display-mode: ${mode})`).matches) || window.navigator.standalone === true
    const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent)

    const saveSubscription = async (subscription) => {
        const res = await fetch(`${API_BASE}/push/subscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(subscription.toJSON()),
        })
        if (!res.ok) throw new Error('Не удалось сохранить push-подписку')
    }

    useEffect(() => {
        const onInstallPrompt = (event) => {
            event.preventDefault()
            setInstallPrompt(event)
        }
        const onInstalled = () => setInstallPrompt(null)
        window.addEventListener('beforeinstallprompt', onInstallPrompt)
        window.addEventListener('appinstalled', onInstalled)

        if (window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window) {
            navigator.serviceWorker.ready
                .then((registration) => registration.pushManager.getSubscription())
                .then((subscription) => {
                    setPushEnabled(Boolean(subscription))
                    if (subscription) return saveSubscription(subscription)
                })
                .catch(() => {})
        }
        return () => {
            window.removeEventListener('beforeinstallprompt', onInstallPrompt)
            window.removeEventListener('appinstalled', onInstalled)
        }
    }, [])

    const installApp = async () => {
        if (!installPrompt) {
            window.alert(isIos
                ? 'На iPhone: нажмите «Поделиться», затем «На экран Домой». После установки откройте приложение с иконки.'
                : 'Откройте меню браузера и выберите «Установить приложение» или «Добавить на главный экран».')
            return
        }
        await installPrompt.prompt()
        await installPrompt.userChoice
        setInstallPrompt(null)
    }

    const togglePush = async () => {
        setPushStatus('')
        if (!window.isSecureContext) {
            setPushStatus('Перехожу на защищённый адрес…')
            window.location.href = `https://130-17-17-201.sslip.io${window.location.pathname}${window.location.search}`
            return
        }
        if (isIos && !isStandalone) {
            setPushStatus('На iPhone сначала добавьте сайт на экран «Домой», затем откройте его с иконки.')
            return
        }
        if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
            setPushStatus('Этот браузер не поддерживает Web Push. Используйте установленное PWA в Chrome или Safari.')
            return
        }
        setPushBusy(true)
        setPushStatus('Подключаю уведомления…')
        try {
            await navigator.serviceWorker.register('/connect-hub/sw.js', { scope: '/connect-hub/' })
            const registration = await withTimeout(
                navigator.serviceWorker.ready,
                10000,
                'Service worker не запустился. Перезапустите установленное приложение.',
            )
            const existing = await registration.pushManager.getSubscription()
            if (existing) {
                await fetch(`${API_BASE}/push/subscribe`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(existing.toJSON()),
                })
                await existing.unsubscribe()
                setPushEnabled(false)
                setPushStatus('Уведомления отключены')
                return
            }
            const permission = await Notification.requestPermission()
            if (permission !== 'granted') throw new Error('Доступ к уведомлениям запрещён в настройках приложения')
            const keyResponse = await fetch(`${API_BASE}/push/public-key`)
            const keyData = await keyResponse.json()
            if (!keyResponse.ok) throw new Error(keyData.detail || 'Push не настроен')
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
            })
            await saveSubscription(subscription)
            setPushEnabled(true)
            setPushStatus('Уведомления включены')
        } catch (error) {
            setPushStatus(error?.message || 'Не удалось включить уведомления')
        } finally {
            setPushBusy(false)
        }
    }

    return (
        <div className="pwa-controls">
            {!isStandalone && (
                <button className="logout-btn" onClick={async () => { await installApp(); onAction?.() }} title="Установить приложение" aria-label="Установить приложение">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16l5-5h-3V3h-4v8H7l5 5zm-7 2v3h14v-3h2v5H3v-5h2z" /></svg>
                    <span className="sidebar-action-label">Установить PWA</span>
                </button>
            )}
            <button className={`logout-btn ${pushEnabled ? 'active' : ''}`} onClick={async () => { await togglePush(); onAction?.() }} disabled={pushBusy} title={pushEnabled ? 'Отключить уведомления' : 'Включить уведомления'} aria-label={pushEnabled ? 'Отключить уведомления' : 'Включить уведомления'}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22zm7-6v-5a7 7 0 0 0-5-6.71V3a2 2 0 0 0-4 0v1.29A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2z" /></svg>
                <span className="sidebar-action-label">{pushEnabled ? 'Отключить уведомления' : 'Включить уведомления'}</span>
            </button>
            {pushStatus && <div className={`push-status ${pushEnabled ? 'success' : ''}`} role="status">{pushStatus}</div>}
        </div>
    )
}
