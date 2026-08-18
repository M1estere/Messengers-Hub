import { Fragment, useEffect, useRef, useState } from 'react'
import { API_BASE, EMOJIS } from '../../constants'
import { fmtMessageDay, fmtTime, mediaLabel, messageDateKey } from '../../utils/messages'
import Avatar from '../common/Avatar'
import WebsiteSource from '../common/WebsiteSource'
import VoicePlayer from './VoicePlayer'

export default function ChatView({ chat, targetMessageId, onTargetHandled, onMessageSent, onBack }) {
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
        const frame = requestAnimationFrame(() => inputRef.current?.focus())
        return () => cancelAnimationFrame(frame)
    }, [chat.id])

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

    const startReply = (message) => {
        setReplyTo(message)
        setMsgMenu(null)
        requestAnimationFrame(() => inputRef.current?.focus())
    }

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

    useEffect(() => {
        if (!targetMessageId || messages.length === 0) return
        const exists = messages.some((message) => message.id === targetMessageId)
        if (!exists) return
        stickToBottom.current = false
        requestAnimationFrame(() => scrollToMessage(targetMessageId))
        onTargetHandled && onTargetHandled()
    }, [messages, targetMessageId])

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
                                {m.media_type === 'sticker' && (
                                    <div className="message-sticker-wrap">
                                        {m.media_url && m.media_name?.toLowerCase().endsWith('.webm') ? (
                                            <video
                                                src={m.media_url}
                                                className="message-sticker"
                                                autoPlay
                                                loop
                                                muted
                                                playsInline
                                                onLoadedData={scrollToBottomIfStuck}
                                                onError={(event) => {
                                                    event.currentTarget.style.display = 'none'
                                                    event.currentTarget.nextElementSibling.style.display = 'flex'
                                                }}
                                            />
                                        ) : m.media_url && !m.media_name?.toLowerCase().endsWith('.tgs') ? (
                                            <img
                                                src={m.media_url}
                                                alt="Стикер"
                                                className="message-sticker"
                                                onLoad={scrollToBottomIfStuck}
                                                onError={(event) => {
                                                    event.currentTarget.style.display = 'none'
                                                    event.currentTarget.nextElementSibling.style.display = 'flex'
                                                }}
                                            />
                                        ) : null}
                                        <span className={`message-sticker-fallback${!m.media_url || m.media_name?.toLowerCase().endsWith('.tgs') ? ' visible' : ''}`}>Стикер</span>
                                    </div>
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
                        onClick={() => startReply(msgMenu.message)}
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
