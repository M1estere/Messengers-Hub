import { useEffect, useState } from 'react'
import telegramIcon from './assets/telegram.png'

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

  useEffect(() => {
    fetch('/chats')
      .then((res) => res.json())
      .then((data) => setChats(data))
      .catch((err) => setError(err.message))
  }, [])

  if (error) {
    return <div>Ошибка загрузки: {error}</div>
  }

  if (selectedChat) {
    return <ChatView chat={selectedChat} onBack={() => setSelectedChat(null)} />
  }

  return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ width: '30vw', height: '100%' }}>
              <div style={{ width: '100%', height: 'fit-content', padding: '10px', textAlign: 'start' }}>
                  <h3 style={{ margin: '5px' }}>Чаты</h3>
              </div>
              {chats.length === 0 && <p>Пока нет чатов. Напиши боту в Telegram.</p>}

              <div style={{ width: '100%' }}>
                  {chats.map((chat) => (
                      <div key={chat.id} id={`${chat.platform}_chat_${chat.id}`} onClick={() => setSelectedChat(chat)} style={{ width: '100%', padding: '10px 15px', boxSizing: 'border-box', display: 'flex', justifyContent: 'start', gap: '5px', alignItems: 'center' }}>
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

function ChatView({ chat, onBack }) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')

  const load = () => {
    fetch(`/messages/${chat.id}`)
      .then((res) => res.json())
      .then((data) => setMessages(data))
  }

  useEffect(load, [chat.id])

  const send = async () => {
    if (!text.trim()) return
    await fetch(`/messages/${chat.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    setText('')
    load()
  }

  return (
    <div>
      <button onClick={onBack}>← Назад</button>
      <h3>
        <Avatar chat={chat} /> {chat.title}
      </h3>
      <ul>
        {messages.map((m) => (
          <li key={m.id}>
            {m.is_from_me ? 'Вы' : m.sender_name || 'Пользователь'}: {m.text}
          </li>
        ))}
      </ul>
      <div>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Сообщение"
        />
        <button onClick={send}>Отправить</button>
      </div>
    </div>
  )
}

export default App
