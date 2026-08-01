import { useEffect, useRef, useState } from 'react'
import telegramIcon from './assets/telegram.png'
import maxIcon from './assets/max.jpg'
import './App.css'

const MIN_LEFT_WIDTH = 90

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

function App() {
  const [chats, setChats] = useState([])
  const [error, setError] = useState(null)
  const [selectedChat, setSelectedChat] = useState(null)
  const [menu, setMenu] = useState(null)
  const [leftWidth, setLeftWidth] = useState(() => {
    const saved = localStorage.getItem('leftWidth')
    if (saved) {
      const w = parseInt(saved, 10)
      if (!isNaN(w) && w >= MIN_LEFT_WIDTH) return w
    }
    return Math.round(window.innerWidth * 0.3)
  })
  const [dragging, setDragging] = useState(false)

  const selectChat = (chat) => {
    setSelectedChat(chat)
    localStorage.setItem('selectedChatId', String(chat.id))
  }

  const refreshChats = () => {
    fetch('/chats')
      .then((res) => res.json())
      .then((data) => setChats(data))
      .catch(() => {})
  }

  useEffect(() => {
    fetch('/chats')
      .then((res) => res.json())
      .then((data) => {
        setChats(data)
        const savedId = localStorage.getItem('selectedChatId')
        if (savedId) {
          const found = data.find((c) => String(c.id) === savedId)
          if (found) setSelectedChat(found)
        }
      })
      .catch((err) => setError(err.message))
  }, [])

  useEffect(() => {
    const t = setInterval(refreshChats, 4000)
    return () => clearInterval(t)
  }, [])

  const deleteChat = async (id) => {
    if (!window.confirm('Удалить чат?')) return
    try {
      await fetch(`/chats/${id}`, { method: 'DELETE' })
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
      await fetch(`/chats/${chat.id}/pin?pinned=${!chat.is_pinned}`, { method: 'PATCH' })
    } catch (e) {}
    refreshChats()
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

  if (error) {
    return <div>Ошибка загрузки: {error}</div>
  }

  return (
    <div className="app">
      <div className="sidebar" style={{ width: leftWidth }}>
        <div className="sidebar-header">
          <h3 className="sidebar-title">Чаты</h3>
        </div>
        {chats.length === 0 && <p className="sidebar-empty">Пока нет чатов</p>}

        <div className="chat-list">
          {chats.map((chat) => (
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
                      {fmtTime(chat.last_message?.created_at)}
                    </span>
                  </div>
                </div>
                <div className="chat-block-preview">
                  {chat.last_message && (
                    <>
                      {!chat.last_message.is_from_me && !chat.last_message.is_read && <span className="unread-dot">● </span>}
                      <b>{chat.last_message.is_from_me ? 'Вы' : chat.first_name}:</b>{' '}
                      {chat.last_message.text || chat.last_message.media_name ||
                          (chat.last_message.media_type === 'image' ? 'Изображение' : 'Файл')}
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
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
    ) : null

  return (
    <span className="avatar-wrap">
      {avatar}
      {badge}
    </span>
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

  const previewText = (msg) =>
    msg?.text ||
    msg?.media_name ||
    (msg?.media_type === 'image' ? 'Изображение' : msg?.media_type === 'document' ? 'Файл' : '')

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
    fetch(`/messages/${chat.id}`)
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
    await fetch(`/messages/${id}`, { method: 'DELETE' })
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
    await fetch(`/messages/${chat.id}`, { method: 'POST', body: fd })
    setText('')
    setFile(null)
    setReplyTo(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    load()
    onMessageSent && onMessageSent()
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
        </div>
      </div>

      <div ref={listRef} className="message-list" onScroll={onScroll}>
        {messages.map((m) => (
          <div
            key={m.id}
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
            {m.text && <div>{m.text}</div>}
            {m.created_at && (
              <div className="message-time">{fmtTime(m.created_at)}</div>
            )}
          </div>
          </div>
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
