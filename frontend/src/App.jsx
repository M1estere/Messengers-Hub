import { useEffect, useRef, useState } from 'react'
import AuthForm from './components/auth/AuthForm'
import ChatView from './components/chat/ChatView'
import Avatar from './components/common/Avatar'
import SourceIcon from './components/common/SourceIcon'
import PwaControls from './components/sidebar/PwaControls'
import SourceFilterSelect from './components/sidebar/SourceFilterSelect'
import { API_BASE } from './constants'
import { fmtSidebarDateTime, mediaLabel } from './utils/messages'
import './App.css'

const MIN_LEFT_WIDTH = 90
const MAX_LEFT_WIDTH = 620

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

function App() {
  const [user, setUser] = useState(undefined)
  const [chats, setChats] = useState([])
  const [error, setError] = useState(null)
  const [selectedChat, setSelectedChat] = useState(null)
  const [targetMessageId, setTargetMessageId] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchPending, setSearchPending] = useState(false)
  const [menu, setMenu] = useState(null)
  const [sourceFilter, setSourceFilter] = useState(() => localStorage.getItem('chatSourceFilter') || 'all')
  const [readFilter, setReadFilter] = useState(() => localStorage.getItem('chatReadFilter') || 'all')
  const [leftWidth, setLeftWidth] = useState(() => {
    const saved = localStorage.getItem('leftWidth')
    if (saved) {
      const w = parseInt(saved, 10)
      if (!isNaN(w) && (w >= MIN_LEFT_WIDTH && w <= MAX_LEFT_WIDTH)) return w
    }
    return Math.max(
      MIN_LEFT_WIDTH,
      Math.min(MAX_LEFT_WIDTH, Math.round(window.innerWidth * 0.3)),
    )
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

  const selectChat = (chat, messageId = null) => {
    setSelectedChat(chat)
    setTargetMessageId(messageId)
    localStorage.setItem('selectedChatId', String(chat.id))
  }

  useEffect(() => {
    const query = searchQuery.trim()
    if (query.length < 2) {
      setSearchResults([])
      setSearchPending(false)
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setSearchPending(true)
      const platform = sourceFilter === 'all' ? '' : `&platform=${encodeURIComponent(sourceFilter)}`
      fetch(`${API_BASE}/search/messages?q=${encodeURIComponent(query)}&limit=50${platform}`, { signal: controller.signal })
        .then((res) => res.ok ? res.json() : Promise.reject(new Error('Ошибка поиска')))
        .then((data) => setSearchResults(data.items || []))
        .catch((err) => {
          if (err.name !== 'AbortError') setSearchResults([])
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearchPending(false)
        })
    }, 350)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [searchQuery, sourceFilter])

  const openSearchResult = (result) => {
    const chat = chats.find((item) => item.id === result.chat_id)
    if (!chat) return
    selectChat(chat, result.id)
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
        if (searchQuery.trim()) {
          e.preventDefault()
          e.stopPropagation()
          setSearchQuery('')
          setSearchResults([])
          setSearchPending(false)
          setMenu(null)
          return
        }
        setSelectedChat(null)
        localStorage.removeItem('selectedChatId')
        setMenu(null)
      }
    }
    const onClick = () => setMenu(null)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('click', onClick)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('click', onClick)
    }
  }, [searchQuery])

  const onDividerDown = (e) => {
    e.preventDefault()
    setDragging(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    const move = (ev) => {
      const w = Math.max(
        MIN_LEFT_WIDTH,
        Math.min(MAX_LEFT_WIDTH, window.innerWidth - 200, ev.clientX),
      )
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
    return <AuthForm onAuthenticated={setUser} />
  }

  if (error) {
    return <div>Ошибка загрузки: {error}</div>
  }

  return (
    <div className="app">
      <div className="sidebar" style={{ width: leftWidth }}>
        <div className="sidebar-header">
          <h3 className="sidebar-title">Чаты</h3>
          <div className="message-search-wrap">
            <svg className="message-search-icon" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m16.5 16.5 4 4" />
            </svg>
            <input
              className="message-search-input"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.stopPropagation()
                  setSearchQuery('')
                }
              }}
              placeholder="Поиск по сообщениям"
              aria-label="Поиск по сообщениям"
            />
            {searchQuery && (
              <button className="message-search-clear" onClick={() => setSearchQuery('')} title="Очистить поиск">×</button>
            )}
          </div>
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
        {!searchQuery.trim() && chats.length === 0 && <p className="sidebar-empty">Пока нет чатов</p>}
        {!searchQuery.trim() && chats.length > 0 && filteredChats.length === 0 && <p className="sidebar-empty">Нет чатов по фильтру</p>}

        <div className="chat-list">
          {searchQuery.trim().length >= 2 ? (
            <div className="message-search-results">
              {searchPending && <div className="message-search-state">Поиск…</div>}
              {!searchPending && searchResults.length === 0 && <div className="message-search-state">Ничего не найдено</div>}
              {searchResults.map((result) => (
                <button key={result.id} className="message-search-result" onClick={() => openSearchResult(result)}>
                  <Avatar chat={{
                    id: result.chat_id,
                    title: result.chat_title || result.chat_username || `Чат ${result.chat_id}`,
                    platform: result.platform,
                    avatar_url: `${API_BASE}/chats/${result.chat_id}/avatar`,
                  }} />
                  <span className="message-search-result-content">
                    <span className="message-search-result-top">
                      <span className="message-search-result-chat">{result.chat_title || result.chat_username || `Чат ${result.chat_id}`}</span>
                      <span className="message-search-result-date">{result.created_at_iso ? fmtSidebarDateTime(result.created_at_iso) : ''}</span>
                    </span>
                    <span className="message-search-result-text">
                      <span className="message-search-result-author">
                        {result.is_from_me ? 'Вы' : (result.sender_name || result.chat_title || result.chat_username || 'Пользователь')}:
                      </span>{' '}
                      {result.text || mediaLabel(result)}
                    </span>
                    <span className="message-search-result-source">
                      <SourceIcon source={result.platform} />
                      <span className="message-search-result-source-label">{result.platform === 'telegram' ? 'Telegram' : result.platform === 'max' ? 'MAX' : 'Сайт'}</span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : filteredChats.map((chat) => (
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
        {selectedChat ? (
            <ChatView
              chat={selectedChat}
              targetMessageId={targetMessageId}
              onTargetHandled={() => setTargetMessageId(null)}
              onMessageSent={refreshChats}
              onBack={() => {
                setSelectedChat(null)
                localStorage.removeItem('selectedChatId')
              }}
            />
          ) : (
            <div className={'no-selected-chat'} style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              width: '100%',
              color: '#999',
              fontSize: '18px'
            }}>
              Выберите чат, чтобы начать общение
            </div>
          )}
      </div>
    </div>
  )
}



export default App
