import { Fragment, useEffect, useRef, useState } from 'react'
import telegramIcon from './assets/telegram.png'
import maxIcon from './assets/max.jpg'
import './App.css'

const MIN_LEFT_WIDTH = 90
const API_BASE = '/connect-hub/api'
const SOURCE_FILTERS = [
  { value: 'all', label: 'Все' },
  { value: 'telegram', label: 'Телеграм' },
  { value: 'max', label: 'Макс' },
  { value: 'website', label: 'Сайты' },
]

function SourceFilterIcon({ source }) {
  if (source === 'telegram') return <img src={telegramIcon} alt="" />
  if (source === 'max') return <img src={maxIcon} alt="" />
  if (source === 'website') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.3 2.5 3.5 5.5 3.5 9S14.3 18.5 12 21M12 3C9.7 5.5 8.5 8.5 8.5 12S9.7 18.5 12 21" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

function SourceFilterSelect({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const selected = SOURCE_FILTERS.find((source) => source.value === value) || SOURCE_FILTERS[0]

  useEffect(() => {
    if (!open) return
    const onOutsideClick = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('click', onOutsideClick)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('click', onOutsideClick)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="source-select" ref={wrapRef}>
      <button
        type="button"
        className="source-select-trigger"
        aria-label={`Источник: ${selected.label}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={selected.label}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="source-filter-icon"><SourceFilterIcon source={selected.value} /></span>
        <span className="source-select-value">{selected.label}</span>
        <svg className="source-select-arrow" viewBox="0 0 20 20" aria-hidden="true">
          <path d="m5 7.5 5 5 5-5" />
        </svg>
      </button>
      {open && (
        <div className="source-select-menu" role="listbox" aria-label="Источники">
          {SOURCE_FILTERS.map((source) => (
            <button
              key={source.value}
              type="button"
              className={value === source.value ? 'active' : ''}
              role="option"
              aria-selected={value === source.value}
              onClick={() => {
                onChange(source.value)
                setOpen(false)
              }}
            >
              <span className="source-filter-icon"><SourceFilterIcon source={source.value} /></span>
              <span>{source.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)))
}

function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => window.setTimeout(() => reject(new Error(message)), timeoutMs)),
  ])
}

function WebsiteSource({ pageUrl }) {
  let websiteUrl = null
  try {
    const parsed = new URL(pageUrl)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') websiteUrl = parsed
  } catch {
    websiteUrl = null
  }

  return (
    <span className="chat-source">
      Источник: сайт
      {websiteUrl && (
        <>
          {' - '}
          <a href={websiteUrl.href} target="_blank" rel="noopener noreferrer" title={websiteUrl.href}>
            {websiteUrl.hostname}
          </a>
        </>
      )}
    </span>
  )
}

function PwaControls({ onAction }) {
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

function SidebarOptions({ user, onLogout }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onOutsideClick = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('click', onOutsideClick)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('click', onOutsideClick)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="sidebar-options" ref={wrapRef}>
      <button
        type="button"
        className="sidebar-options-trigger"
        title="Опции"
        aria-label="Опции"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </button>
      <div className={`sidebar-options-menu ${open ? 'open' : ''}`} role="menu">
        <PwaControls onAction={() => setOpen(false)} />
        <button className="logout-btn" title={`Выйти: ${user.username}`} onClick={() => { setOpen(false); onLogout() }} aria-label="Выйти">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M10 17l5-5-5-5v3H3v4h7v3zm9-14h-8a2 2 0 0 0-2 2v3h2V5h8v14h-8v-3H9v3a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z" />
          </svg>
          <span className="sidebar-action-label">Выйти</span>
        </button>
      </div>
    </div>
  )
}

function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login')
  const [login, setLogin] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setPending(true)
    try {
      const body = mode === 'login' ? { login, password } : { email, password }
      const res = await fetch(`${API_BASE}/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Ошибка авторизации')
      onAuthenticated(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <p>{mode === 'login' ? 'Вход' : 'Регистрация'}</p>
        {mode === 'login' ? (
          <input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="Логин или email" autoComplete="username" required />
        ) : (
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" autoComplete="email" required />
        )}
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Пароль" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 6 : undefined} required />
        {error && <div className="auth-error">{error}</div>}
        <button type="submit" disabled={pending}>{pending ? 'Загрузка…' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}</button>
        <button type="button" className="auth-switch" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}>
          {mode === 'login' ? 'Регистрация по email' : 'Уже есть аккаунт'}
        </button>
      </form>
    </div>
  )
}

const EMOJIS = [
  '😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😋','😎','😍','🥰','😘','😜',
  '🤪','🤩','🥳','😇','🤗','🤔','😐','😴','😢','😭','😤','😡','🤬','🥺','😱','🤯',
  '😳','🥵','🥶','😷','🤒','🤕','🤠','🤑','😈','👻','💀','👽','🤖','💩','👍','👎',
  '👌','✌️','🤞','🤙','👋','🙏','💪','🫶','🤝','👏','🙌','🎉','🎊','❤️','🧡','💛',
  '💚','💙','💜','🖤','🤍','💔','💕','💞','💗','💖','💘','💝','🔥','⭐','✨','⚡',
  '☀️','🌙','⚠️','✅','❌','❗','❓','💯','🔔','🎁','🎈','📎','📌','📍','💬','💭'
]

function fmtTime(iso) {
    if (!iso) return ''
    const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z')
    return d.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Moscow'
    })
}

function parseMessageDate(iso) {
    if (!iso) return null
    const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z')
    return Number.isNaN(d.getTime()) ? null : d
}

function messageDateKey(iso) {
    const d = parseMessageDate(iso)
    if (!d) return ''
    return new Intl.DateTimeFormat('ru-RU', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: 'Europe/Moscow',
    }).format(d)
}

function fmtMessageDay(iso) {
    const d = parseMessageDate(iso)
    if (!d) return ''
    return new Intl.DateTimeFormat('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Europe/Moscow',
    }).format(d)
}

function fmtSidebarDateTime(iso) {
    const d = parseMessageDate(iso)
    if (!d) return ''
    const dateFormatter = new Intl.DateTimeFormat('en-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: 'Europe/Moscow',
    })
    const calendarDay = (value) => {
        const parts = Object.fromEntries(dateFormatter.formatToParts(value).map((part) => [part.type, part.value]))
        return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day))
    }
    const daysAgo = Math.round((calendarDay(new Date()) - calendarDay(d)) / 86400000)

    if (daysAgo === 0) return fmtTime(iso)
    if (daysAgo >= 1 && daysAgo <= 7) {
        return new Intl.DateTimeFormat('ru-RU', {
            weekday: 'short',
            timeZone: 'Europe/Moscow',
        }).format(d).replace('.', '').slice(0, 2)
    }
    return new Intl.DateTimeFormat('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'Europe/Moscow',
    }).format(d)
}

function fmtDuration(sec) {
    if (!sec || isNaN(sec)) return '0:00'
    const s = Math.round(sec)
    const m = Math.floor(s / 60)
    const r = s % 60
    return `${m}:${String(r).padStart(2, '0')}`
}

const mediaLabel = (m) =>
    m?.media_type === 'image' ? 'Изображение'
    : m?.media_type === 'document' ? 'Файл'
    : m?.media_type === 'voice' ? 'Голосовое сообщение'
    : m?.media_type === 'audio' ? 'Аудио'
    : m?.media_name || ''

function App() {
  const [user, setUser] = useState(undefined)
  const [chats, setChats] = useState([])
  const [error, setError] = useState(null)
  const [selectedChat, setSelectedChat] = useState(null)
  const [menu, setMenu] = useState(null)
  const [sourceFilter, setSourceFilter] = useState(() => localStorage.getItem('chatSourceFilter') || 'all')
  const [readFilter, setReadFilter] = useState(() => localStorage.getItem('chatReadFilter') || 'all')
  const [leftWidth, setLeftWidth] = useState(() => {
    const saved = localStorage.getItem('leftWidth')
    if (saved) {
      const w = parseInt(saved, 10)
      if (!isNaN(w) && w >= MIN_LEFT_WIDTH) return w
    }
    return Math.round(window.innerWidth * 0.3)
  })
  const [dragging, setDragging] = useState(false)

  const filteredChats = chats.filter((chat) => {
    const sourceMatches = sourceFilter === 'all' || chat.platform === sourceFilter
    const hasUnread = (chat.unread_count || 0) > 0
    const readMatches = readFilter === 'all' || (readFilter === 'unread' ? hasUnread : !hasUnread)
    return sourceMatches && readMatches
  })

  const changeSourceFilter = (value) => {
    setSourceFilter(value)
    localStorage.setItem('chatSourceFilter', value)
  }

  const changeReadFilter = (event) => {
    const value = event.target.value
    setReadFilter(value)
    localStorage.setItem('chatReadFilter', value)
  }

  useEffect(() => {
    fetch(`${API_BASE}/auth/me`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => setUser(data))
      .catch(() => setUser(null))
  }, [])

  const selectChat = (chat) => {
    setSelectedChat(chat)
    localStorage.setItem('selectedChatId', String(chat.id))
  }

  const refreshChats = () => {
    if (!user) return
    fetch(`${API_BASE}/chats`)
      .then((res) => res.json())
      .then((data) => setChats(data))
      .catch(() => {})
  }

  useEffect(() => {
    if (!user) return
    fetch(`${API_BASE}/chats`)
      .then((res) => res.json())
      .then((data) => {
        setChats(data)
        const url = new URL(window.location.href)
        const linkedId = url.searchParams.get('chat')
        const savedId = localStorage.getItem('selectedChatId')
        const targetId = linkedId || savedId
        if (targetId) {
          const found = data.find((c) => String(c.id) === targetId)
          if (found) {
            setSelectedChat(found)
            localStorage.setItem('selectedChatId', String(found.id))
          }
        }
        if (linkedId) {
          url.searchParams.delete('chat')
          window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
        }
      })
      .catch((err) => setError(err.message))
  }, [user])

  useEffect(() => {
    if (!user) return
    const t = setInterval(refreshChats, 4000)
    return () => clearInterval(t)
  }, [user])

  const deleteChat = async (id) => {
    if (!window.confirm('Удалить чат?')) return
    try {
      await fetch(`${API_BASE}/chats/${id}`, { method: 'DELETE' })
    } catch (e) {}
    setMenu(null)
    if (selectedChat && selectedChat.id === id) {
      setSelectedChat(null)
      localStorage.removeItem('selectedChatId')
    }
    refreshChats()
  }

  const togglePin = async (chat) => {
    setMenu(null)
    try {
      await fetch(`${API_BASE}/chats/${chat.id}/pin?pinned=${!chat.is_pinned}`, { method: 'PATCH' })
    } catch (e) {}
    refreshChats()
  }

  const logout = async () => {
    await fetch(`${API_BASE}/auth/logout`, { method: 'POST' })
    setChats([])
    setSelectedChat(null)
    setUser(null)
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setSelectedChat(null)
        localStorage.removeItem('selectedChatId')
        setMenu(null)
      }
    }
    const onClick = () => setMenu(null)
    window.addEventListener('keydown', onKey)
    window.addEventListener('click', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('click', onClick)
    }
  }, [])

  const onDividerDown = (e) => {
    e.preventDefault()
    setDragging(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    const move = (ev) => {
      const w = Math.max(MIN_LEFT_WIDTH, Math.min(window.innerWidth - 200, ev.clientX))
      setLeftWidth(w)
      localStorage.setItem('leftWidth', String(w))
    }
    const up = () => {
      setDragging(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  if (user === undefined) {
    return <div className="auth-page"><div className="auth-card">Загрузка…</div></div>
  }

  if (!user) {
    return <AuthScreen onAuthenticated={setUser} />
  }

  if (error) {
    return <div>Ошибка загрузки: {error}</div>
  }

  return (
    <div className="app">
      <div className="sidebar" style={{ width: leftWidth }}>
        <div className="sidebar-header">
          <h3 className="sidebar-title">Чаты</h3>
          <div className="sidebar-filters">
            <div className="chat-filter source-filter">
              <span className="chat-filter-label">Источник</span>
              <SourceFilterSelect value={sourceFilter} onChange={changeSourceFilter} />
            </div>
            <label className="chat-filter">
              <span className="chat-filter-label">Статус</span>
              <select value={readFilter} onChange={changeReadFilter} aria-label="Фильтр по прочитанности">
                <option value="all">Все</option>
                <option value="unread">Непрочитанные</option>
                <option value="read">Прочитанные</option>
              </select>
            </label>
          </div>
        </div>
        {chats.length === 0 && <p className="sidebar-empty">Пока нет чатов</p>}
        {chats.length > 0 && filteredChats.length === 0 && <p className="sidebar-empty">Нет чатов по фильтру</p>}

        <div className="chat-list">
          {filteredChats.map((chat) => (
            <div
              key={chat.id}
              id={`${chat.platform}_chat_${chat.id}`}
              onClick={() => selectChat(chat)}
              onContextMenu={(e) => { e.preventDefault(); setMenu({ chat, x: e.clientX, y: e.clientY }) }}
              className={selectedChat && selectedChat.id === chat.id ? 'chat_block selected' : 'chat_block'}
            >
              <Avatar chat={chat} />
              <div className="chat-block-info">
                <div className="chat-block-top">
                  <div className="chat-block-title">
                    {chat.is_pinned && (
                      <svg className="pin-icon" viewBox="0 0 24 24">
                        <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5v6l1 1 1-1v-6h5v-2z" />
                      </svg>
                    )}
                    {(chat.username && chat.username.length > 0) ? chat.username : chat.first_name}
                  </div>
                  <div>
                    <span className="chat-block-time">
                      {fmtSidebarDateTime(chat.last_message?.created_at)}
                    </span>
                  </div>
                </div>
                <div className="chat-block-preview">
                  {chat.last_message && (
                    <>
                      {!chat.last_message.is_from_me && !chat.last_message.is_read && <span className="unread-dot">● </span>}
                      <b>{chat.last_message.is_from_me ? 'Вы' : chat.first_name}:</b>{' '}
                      {chat.last_message.text || mediaLabel(chat.last_message)}
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="sidebar-footer">
          <SidebarOptions user={user} onLogout={logout} />
        </div>
      </div>

      <div className={dragging ? 'divider dragging' : 'divider'} onMouseDown={onDividerDown} />

      {menu && (
        <div
          className="context-menu"
          onMouseDown={(e) => e.stopPropagation()}
          style={{ left: menu.x, top: menu.y }}
        >
          <div className="context-menu-item" onClick={() => togglePin(menu.chat)}>
            {menu.chat.is_pinned ? 'Открепить чат' : 'Закрепить чат'}
          </div>
          <div className="context-menu-item danger" onClick={() => deleteChat(menu.chat.id)}>
            Удалить чат
          </div>
        </div>
      )}

      <div className={selectedChat ? 'chat-panel open' : 'chat-panel'}>
        {selectedChat && (
          <ChatView
            chat={selectedChat}
            onMessageSent={refreshChats}
            onBack={() => {
              setSelectedChat(null)
              localStorage.removeItem('selectedChatId')
            }}
          />
        )}
      </div>
    </div>
  )
}

function Avatar({ chat }) {
  const [broken, setBroken] = useState(false)
  useEffect(() => {
    setBroken(false)
  }, [chat.id])
  const letter = (chat.title || '?')[0]
  const avatar = broken || !chat.avatar_url ? (
    <span className="avatar-letter">{letter}</span>
  ) : (
    <img
      src={chat.avatar_url}
      alt=""
      onError={() => setBroken(true)}
      className="avatar-img"
    />
  )

  const badge =
    chat.platform === 'telegram' ? (
      <img className="avatar-badge" src={telegramIcon} alt="Telegram" />
    ) : chat.platform === 'max' ? (
      <img className="avatar-badge" src={maxIcon} alt="MAX" />
    ) : chat.platform === 'website' ? (
      <span className="avatar-badge website-badge" title="Сайт" aria-label="Сайт">W</span>
    ) : null

  return (
    <span className="avatar-wrap">
      {avatar}
      {badge}
    </span>
  )
}

function VoicePlayer({ src, duration }) {
  const audioRef = useRef(null)
  const retryRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [total, setTotal] = useState(duration || 0)
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    const onTime = () => setCurrent(el.currentTime)
    const onMeta = () => {
      setRetrying(false)
      if (el.duration && isFinite(el.duration)) setTotal(el.duration)
    }
    const onEnd = () => setPlaying(false)
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onError = () => {
      setRetrying(true)
      clearTimeout(retryRef.current)
      retryRef.current = setTimeout(() => {
        if (el) el.load()
      }, 5000)
    }
    el.addEventListener('timeupdate', onTime)
    el.addEventListener('loadedmetadata', onMeta)
    el.addEventListener('ended', onEnd)
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    el.addEventListener('error', onError)
    el.load()
    return () => {
      clearTimeout(retryRef.current)
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('loadedmetadata', onMeta)
      el.removeEventListener('ended', onEnd)
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
      el.removeEventListener('error', onError)
      el.pause()
    }
  }, [src])

  const toggle = () => {
    const el = audioRef.current
    if (!el) return
    if (el.paused) {
      document.querySelectorAll('.voice-audio').forEach((a) => {
        if (a !== el) a.pause()
      })
      el.play().catch(() => {})
    } else {
      el.pause()
    }
    console.log("Playback status: ", !el.paused)
  }

  const seek = (e) => {
    const el = audioRef.current
    const bar = e.currentTarget
    const rect = bar.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    if (el) el.currentTime = ratio * (el.duration || total || 0)
  }

  const pct = total ? Math.min(100, (current / total) * 100) : 0

  return (
    <div className="voice-player">
      <audio ref={audioRef} className="voice-audio" preload="metadata" src={src} />
      <button
        className="voice-play"
        onClick={toggle}
        title={playing ? 'Пауза' : 'Слушать'}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          {playing ? (
            <>
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </>
          ) : (
            <path d="M8 5v14l11-7z" />
          )}
        </svg>
      </button>
      <div className="voice-track" onClick={seek}>
        <div className="voice-track-fill" style={{ width: pct + '%' }} />
      </div>
      <span className="voice-time">
        {retrying ? '…' : playing || current > 0 ? fmtDuration(current) : fmtDuration(total)}
      </span>
    </div>
  )
}

function ChatView({ chat, onMessageSent, onBack }) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [file, setFile] = useState(null)
  const [viewer, setViewer] = useState(null)
  const [scale, setScale] = useState(1)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [replyTo, setReplyTo] = useState(null)
  const [msgMenu, setMsgMenu] = useState(null)
  const [highlightId, setHighlightId] = useState(null)
  const [yougileState, setYougileState] = useState({ pending: false, message: '', error: false })
  const fileInputRef = useRef(null)
  const inputRef = useRef(null)
  const emojiWrapRef = useRef(null)
  const listRef = useRef(null)
  const overlayRef = useRef(null)
  const highlightTimer = useRef(null)
  const stickToBottom = useRef(true)

  useEffect(() => {
    return () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!yougileState.message) return
    const timer = setTimeout(() => {
      setYougileState((state) => ({ ...state, message: '', error: false }))
    }, 2500)
    return () => clearTimeout(timer)
  }, [yougileState.message])

  useEffect(() => {
    const el = overlayRef.current
    if (!viewer || !el) return
    const onWheel = (e) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
      setScale((s) => Math.min(8, Math.max(0.5, +(s * factor).toFixed(2))))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [viewer])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && viewer) {
        setViewer(null)
        e.stopPropagation()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [viewer])

  useEffect(() => {
    if (!emojiOpen) return
    const onClick = (e) => {
      if (emojiWrapRef.current && !emojiWrapRef.current.contains(e.target)) {
        setEmojiOpen(false)
      }
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setEmojiOpen(false)
    }
    window.addEventListener('click', onClick)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', onClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [emojiOpen])

  useEffect(() => {
    if (!msgMenu) return
    const onClick = () => setMsgMenu(null)
    const onKey = (e) => {
      if (e.key === 'Escape') setMsgMenu(null)
    }
    window.addEventListener('click', onClick)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', onClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [msgMenu])

  const previewText = (msg) => msg?.text || mediaLabel(msg)

  const authorName = (msg) =>
    msg?.is_from_me ? 'Вы' : (msg?.sender_name || chat.first_name || chat.title || '')

  const insertEmoji = (emoji) => {
    const el = inputRef.current
    if (el) {
      const start = el.selectionStart ?? text.length
      const end = el.selectionEnd ?? text.length
      const next = text.slice(0, start) + emoji + text.slice(end)
      setText(next)
      requestAnimationFrame(() => {
        el.focus()
        const pos = start + emoji.length
        el.setSelectionRange(pos, pos)
      })
    } else {
      setText((t) => t + emoji)
    }
  }

  const load = () => {
    fetch(`${API_BASE}/messages/${chat.id}`)
      .then((res) => res.json())
      .then((data) => {
        setMessages((prev) => {
          if (
            prev.length === data.length &&
            (prev.length === 0 || prev[prev.length - 1].id === data[data.length - 1].id)
          ) {
            return prev
          }
          return data
        })
      })
  }

  useEffect(() => {
    setMessages([])
    setReplyTo(null)
    setMsgMenu(null)
    stickToBottom.current = true
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.id])

  useEffect(() => {
    const t = setInterval(load, 4000)
    return () => clearInterval(t)
  }, [chat.id])

  const scrollToBottomIfStuck = () => {
    const el = listRef.current
    if (!el) return
    if (stickToBottom.current) el.scrollTop = el.scrollHeight
  }

  useEffect(() => {
    scrollToBottomIfStuck()
  }, [messages])

  const onScroll = () => {
    const el = listRef.current
    if (!el) return
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
  }

  const scrollToMessage = (id) => {
    const el = document.getElementById(`msg-${id}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightId(id)
    if (highlightTimer.current) clearTimeout(highlightTimer.current)
    highlightTimer.current = setTimeout(() => setHighlightId(null), 2000)
  }

  const downloadMedia = (msg) => {
    if (!msg?.media_url) return
    const a = document.createElement('a')
    a.href = `${msg.media_url}?download=1`
    a.download = msg.media_name || 'file'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const deleteMessage = async (id) => {
    if (!window.confirm('Удалить сообщение?')) return
    await fetch(`${API_BASE}/messages/${id}`, { method: 'DELETE' })
    setMsgMenu(null)
    load()
    onMessageSent && onMessageSent()
  }

  const send = async () => {
    if (!text.trim() && !file) return
    const fd = new FormData()
    fd.append('text', text)
    if (file) fd.append('file', file)
    if (replyTo) fd.append('reply_to_id', String(replyTo.id))
    await fetch(`${API_BASE}/messages/${chat.id}`, { method: 'POST', body: fd })
    setText('')
    setFile(null)
    setReplyTo(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    load()
    onMessageSent && onMessageSent()
  }

  const addToYougile = async () => {
    const yougileTab = window.open('about:blank', '_blank')
    if (yougileTab) yougileTab.opener = null
    setYougileState({ pending: true, message: '', error: false })
    try {
      const res = await fetch(`${API_BASE}/chats/${chat.id}/yougile`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Ошибка YouGile')
      if (data.task?.url && yougileTab) {
        yougileTab.location.replace(data.task.url)
        setYougileState({ pending: false, message: 'Добавлено в YouGile', error: false })
      } else {
        if (yougileTab) yougileTab.close()
        setYougileState({ pending: false, message: 'Добавлено. Новая вкладка заблокирована браузером', error: true })
      }
    } catch (err) {
      if (yougileTab) yougileTab.close()
      setYougileState({ pending: false, message: err.message, error: true })
    }
  }

  return (
    <div className="chat-view">
      <div className="chat-view-header">
        <button className="chat-view-back" onClick={onBack} title="Назад">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <Avatar chat={chat} />
        <div className="chat-view-name-wrap">
          {chat.platform === 'website' ? (
            <>
              <span className="chat-view-title">{chat.title}</span>
              <WebsiteSource pageUrl={chat.user_external_id} />
            </>
          ) : (
            <a
              className="chat-view-title"
              href={
                chat.platform === 'max'
                  ? `max://user/${chat.user_external_id || chat.external_id}`
                  : chat.username
                    ? `https://t.me/${chat.username}`
                    : `tg://user?id=${chat.external_id}`
              }
              target="_blank"
              rel="noopener noreferrer"
              title="Открыть профиль"
            >
              {chat.username || chat.title}
            </a>
          )}
        </div>
        <button className="yougile-btn" onClick={addToYougile} disabled={yougileState.pending} title="Добавить пользователя в YouGile">
          <span className="yougile-btn-mark">Y</span>
          <span className="yougile-btn-text">{yougileState.pending ? 'Добавление…' : 'В YouGile'}</span>
        </button>
        {yougileState.message && (
          <div className={`yougile-status ${yougileState.error ? 'error' : ''}`}>{yougileState.message}</div>
        )}
      </div>

      <div ref={listRef} className="message-list" onScroll={onScroll}>
        {messages.map((m, index) => (
          <Fragment key={m.id}>
          {(index === 0 || messageDateKey(messages[index - 1]?.created_at) !== messageDateKey(m.created_at)) && (
            <div className="message-date-separator">{fmtMessageDay(m.created_at)}</div>
          )}
          <div
            id={`msg-${m.id}`}
            className={`message-row ${m.is_from_me ? 'mine' : 'theirs'}${m.id === highlightId ? ' highlight' : ''}`}
            onContextMenu={(e) => {
              e.preventDefault()
              const menuH = m.is_from_me ? 96 : 52
              const menuW = 170
              setMsgMenu({
                message: m,
                x: Math.min(e.clientX, window.innerWidth - menuW - 8),
                y: Math.min(e.clientY, window.innerHeight - menuH - 8),
              })
            }}
          >
          <div className={`message ${m.is_from_me ? 'mine' : 'theirs'}`}>
            {m.reply_to_id && (() => {
              const target = messages.find((mm) => mm.id === m.reply_to_id)
              if (!target) return null
              return (
                <div
                  className="message-reply"
                  onClick={(e) => { e.stopPropagation(); scrollToMessage(m.reply_to_id) }}
                >
                  <div className="message-reply-name">{authorName(target)}</div>
                  <div className="message-reply-text">{previewText(target)}</div>
                </div>
              )
            })()}
            {m.media_type === 'image' && (
              <img
                src={m.media_url}
                alt=""
                className="message-image"
                onClick={() => { setViewer(m.media_url); setScale(1) }}
                onLoad={scrollToBottomIfStuck}
              />
            )}
            {m.media_type === 'document' && (
              <div
                className="message-document"
                title="Скачать"
                onClick={() => downloadMedia(m)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
                <span className="message-doc-name">{m.media_name}</span>
              </div>
            )}
            {(m.media_type === 'voice' || m.media_type === 'audio') && (
              <VoicePlayer src={m.media_url} duration={m.duration} />
            )}
            {m.text && <div>{m.text}</div>}
            {m.created_at && (
              <div className="message-time">{fmtTime(m.created_at)}</div>
            )}
          </div>
          </div>
          </Fragment>
        ))}
      </div>

      <div className="composer-wrap">
        {replyTo && (
          <div className="reply-bar">
            <div className="reply-bar-info">
              <div className="reply-bar-name">{authorName(replyTo)}</div>
              <div className="reply-bar-text">{previewText(replyTo)}</div>
            </div>
            <button className="reply-bar-close" onClick={() => setReplyTo(null)} title="Отменить ответ">
              ×
            </button>
          </div>
        )}
        <div className="composer">
          <input
          type="file"
          ref={fileInputRef}
          className="file-input-hidden"
          onChange={(e) => setFile(e.target.files[0] || null)}
        />
        <button
          className="composer-btn"
          onClick={() => fileInputRef.current && fileInputRef.current.click()}
          title="Прикрепить файл"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        <div className="emoji-wrap" ref={emojiWrapRef}>
          <button
            className={emojiOpen ? 'composer-btn active' : 'composer-btn'}
            onClick={() => setEmojiOpen((v) => !v)}
            title="Выбрать эмодзи"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2" />
              <line x1="9" y1="9" x2="9.01" y2="9" />
              <line x1="15" y1="9" x2="15.01" y2="9" />
            </svg>
          </button>
          {emojiOpen && (
            <div className="emoji-panel">
              {EMOJIS.map((e) => (
                <button key={e} className="emoji-cell" onClick={() => insertEmoji(e)}>
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
        {file && (
          <span className="composer-file-name">{file.name}</span>
        )}
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Сообщение"
          className="composer-input"
        />
        <button
          className="send-btn"
          onClick={send}
          disabled={!text.trim() && !file}
          title="Отправить"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>
      </div>

      {msgMenu && (
        <div
          className="context-menu"
          onMouseDown={(e) => e.stopPropagation()}
          style={{ left: msgMenu.x, top: msgMenu.y }}
        >
          <div
            className="context-menu-item"
            onClick={() => { setReplyTo(msgMenu.message); setMsgMenu(null) }}
          >
            Ответить
          </div>
          {msgMenu.message.is_from_me && (
            <div
              className="context-menu-item danger"
              onClick={() => deleteMessage(msgMenu.message.id)}
            >
              Удалить
            </div>
          )}
        </div>
      )}

      {viewer && (
        <div ref={overlayRef} className="lightbox" onClick={() => setViewer(null)}>
          <img
            src={viewer}
            alt=""
            className="lightbox-img"
            onClick={(e) => e.stopPropagation()}
            style={{ transform: `scale(${scale})` }}
          />
        </div>
      )}
    </div>
  )
}

export default App
