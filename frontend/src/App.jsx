import { useEffect, useRef, useState } from 'react'
import telegramIcon from './assets/telegram.png'

const chat_block = 'chat_block'

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

  const refreshChats = () => {
    fetch('/chats')
      .then((res) => res.json())
      .then((data) => setChats(data))
      .catch(() => {})
  }

  useEffect(() => {
    fetch('/chats')
      .then((res) => res.json())
      .then((data) => setChats(data))
      .catch((err) => setError(err.message))
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setSelectedChat(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (error) {
    return <div>Ошибка загрузки: {error}</div>
  }

  return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ width: '30vw', height: '100%' }}>
              <div style={{ width: '100%', height: 'fit-content', padding: '10px', textAlign: 'start' }}>
                  <h3 style={{ margin: '5px' }}>Чаты</h3>
              </div>
              {chats.length === 0 && <p>Пока нет чатов.</p>}

              <div style={{ width: '100%' }}>
                  {chats.map((chat) => (
                      <div key={chat.id} id={`${chat.platform}_chat_${chat.id}`} onClick={() => setSelectedChat(chat)} className={selectedChat && selectedChat.id === chat.id ? 'chat_block selected' : 'chat_block'}>
                          <Avatar chat={chat} />
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: 'column', width: '100%' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', textAlign: 'start' }}>
                                  <div>
                                      <span>{chat.username}</span>
                                  </div>

                                  <div>
                                      <span style={{ color: '#888', fontSize: 12, marginLeft: 6 }}>
                                          {fmtTime(chat.last_message.created_at)}
                                      </span>
                                  </div>
                              </div>
                              <div style={{ width: '100%', textAlign: 'start' }}>
                                  {chat.last_message && (
                                      <>
                                          {!chat.last_message.is_from_me && !chat.last_message.is_read && <span style={{ color: '#4da3ff' }}>● </span>}
                                          <b>{chat.last_message.is_from_me ? 'Вы' : chat.first_name}:</b> {chat.last_message.text}
                                      </>
                                  )}
                              </div>
                          </div>
                      </div>
                  ))}
              </div>
          </div>

          <div style={{ width: '70vw', height: '100%', borderLeft: '1px solid darkgray' }}>
              {selectedChat && <ChatView chat={selectedChat} onMessageSent={refreshChats} />}
          </div>
      </div>
  )
}

function Avatar({ chat }) {
  const [broken, setBroken] = useState(false)
  const letter = (chat.title || '?')[0]
  const avatar = broken || !chat.avatar_url ? (
    <span
      style={{
        display: 'inline-block',
        width: 50,
        height: 50,
        borderRadius: '50%',
        background: '#888',
        color: '#fff',
        textAlign: 'center',
        lineHeight: '50px',
        fontSize: 20,
        verticalAlign: 'middle',
      }}
    >
      {letter}
    </span>
  ) : (
    <img
      src={chat.avatar_url}
      alt=""
      width="50"
      height="50"
      onError={() => setBroken(true)}
      style={{ borderRadius: '50%', verticalAlign: 'middle' }}
    />
  )

  const badge =
    chat.platform === 'telegram' ? (
      <img
        src={telegramIcon}
        alt="Telegram"
        width="18"
        height="18"
        style={{
          position: 'absolute',
          bottom: -2,
          right: -2,
          borderRadius: '50%',
          background: '#fff',
          border: '1px solid #fff',
          boxSizing: 'content-box',
        }}
      />
    ) : null

  return (
    <span style={{ position: 'relative', display: 'inline-block', marginRight: 8, verticalAlign: 'middle' }}>
      {avatar}
      {badge}
    </span>
  )
}

function ChatView({ chat, onMessageSent }) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [file, setFile] = useState(null)
  const fileInputRef = useRef(null)
  const listRef = useRef(null)

  const load = () => {
    fetch(`/messages/${chat.id}`)
      .then((res) => res.json())
      .then((data) => setMessages(data))
  }

  useEffect(load, [chat.id])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages])

  const send = async () => {
    if (!text.trim() && !file) return
    const fd = new FormData()
    fd.append('text', text)
    if (file) fd.append('file', file)
    await fetch(`/messages/${chat.id}`, { method: 'POST', body: fd })
    setText('')
    setFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    load()
    onMessageSent && onMessageSent()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 15px', borderBottom: '1px solid darkgray' }}>
        <Avatar chat={chat} />
        <div style={{ textAlign: 'start' }}>
          <div style={{ fontWeight: 600 }}>{chat.username || chat.title}</div>
        </div>
      </div>

      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              alignSelf: m.is_from_me ? 'flex-end' : 'flex-start',
              maxWidth: '70%',
              padding: '6px 10px',
              borderRadius: 10,
              background: m.is_from_me ? '#4da3ff' : '#e0e0e0',
              color: m.is_from_me ? '#fff' : '#000',
              textAlign: 'start',
              wordBreak: 'break-word',
            }}
          >
            {m.media_type === 'image' && (
              <img src={m.media_url} alt="" style={{ maxWidth: 260, maxHeight: 260, borderRadius: 6, display: 'block' }} />
            )}
            {m.media_type === 'document' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
                <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.media_name}</span>
              </div>
            )}
            {m.text && <div>{m.text}</div>}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 15px', borderTop: '1px solid darkgray' }}>
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={(e) => setFile(e.target.files[0] || null)}
        />
        <button
          onClick={() => fileInputRef.current && fileInputRef.current.click()}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}
          title="Прикрепить файл"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        {file && (
          <span style={{ fontSize: 12, color: '#555', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {file.name}
          </span>
        )}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Сообщение"
          style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid #ccc' }}
        />
        <button
          onClick={send}
          disabled={!text.trim() && !file}
          style={{
            background: '#4da3ff',
            border: 'none',
            borderRadius: '50%',
            width: 36,
            height: 36,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: !text.trim() && !file ? 0.5 : 1,
          }}
          title="Отправить"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default App
