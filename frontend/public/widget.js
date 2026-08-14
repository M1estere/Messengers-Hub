(() => {
  const script = document.currentScript
  const scriptUrl = new URL(script.src)
  const apiBase = `${scriptUrl.origin}/connect-hub/api/widget`
  const title = script.dataset.title || 'Напишите нам'
  const color = script.dataset.color || '#2563eb'
  const storageKey = 'connect_hub_visitor_id'
  let visitorId = localStorage.getItem(storageKey)
  let opened = false
  let lastSignature = ''

  const el = (tag, className, text) => {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined) node.textContent = text
    return node
  }

  const start = async () => {
    const host = el('div')
    host.id = 'connect-hub-widget'
    document.body.appendChild(host)
    const root = host.attachShadow({ mode: 'open' })
    root.innerHTML = `<style>
      :host{all:initial}*{box-sizing:border-box;font-family:Inter,Arial,sans-serif}
      .bubble{position:fixed;right:20px;bottom:20px;width:58px;height:58px;border:0;border-radius:50%;background:${color};color:#fff;cursor:pointer;box-shadow:0 8px 26px #0004;z-index:2147483647;font-size:25px}
      .panel{position:fixed;right:20px;bottom:90px;width:360px;height:520px;max-width:calc(100vw - 24px);max-height:calc(100dvh - 110px);display:none;flex-direction:column;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 14px 45px #0004;z-index:2147483647;color:#171717}
      .panel.open{display:flex}.header{height:62px;flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;padding:0 18px;background:${color};color:#fff;font-weight:700}.close{border:0;background:transparent;color:#fff;font-size:25px;cursor:pointer}
      .messages{flex:1;overflow:auto;padding:14px;background:#f4f6f8;display:flex;flex-direction:column;gap:8px}.empty{margin:auto;color:#6b7280;text-align:center;font-size:14px}
      .msg{max-width:82%;padding:9px 12px;border-radius:12px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px;line-height:1.35}.mine{align-self:end;background:${color};border:1px solid #e5e7eb;color:#fff}.operator{align-self:flex-start;background:#fff;}
      .form{display:flex;gap:8px;padding:10px;border-top:1px solid #e5e7eb;background:#fff}.input{min-width:0;flex:1;border:1px solid #d1d5db;border-radius:10px;padding:10px 12px;color:#111;background:#fff;font-size:14px;outline:none}.send{border:0;border-radius:10px;padding:0 15px;background:${color};color:#fff;cursor:pointer;font-weight:600}.status{min-height:18px;padding:0 12px 6px;color:#b42318;background:#fff;font-size:12px}
      @media(max-width:480px){.panel{right:6px;bottom:76px;width:calc(100vw - 12px);height:calc(100dvh - 84px);max-height:none;border-radius:14px}.bubble{right:14px;bottom:14px}}
    </style>`

    const panel = el('section', 'panel')
    const header = el('div', 'header')
    header.append(el('span', '', title))
    const close = el('button', 'close', '×')
    close.type = 'button'
    close.setAttribute('aria-label', 'Закрыть чат')
    header.append(close)
    const messages = el('div', 'messages')
    const form = el('form', 'form')
    const input = el('input', 'input')
    input.placeholder = 'Введите сообщение…'
    input.maxLength = 4000
    const send = el('button', 'send', 'Отправить')
    send.type = 'submit'
    form.append(input, send)
    const status = el('div', 'status')
    panel.append(header, messages, form, status)
    const bubble = el('button', 'bubble', '💬')
    bubble.type = 'button'
    bubble.setAttribute('aria-label', 'Открыть чат')
    root.append(panel, bubble)

    let load = async () => {}
    bubble.addEventListener('click', () => {
      opened = !opened
      panel.classList.toggle('open', opened)
      if (opened) {
        load()
        input.focus()
        window.requestAnimationFrame(() => {
          messages.scrollTop = messages.scrollHeight
        })
      }
    })
    close.addEventListener('click', () => {
      opened = false
      panel.classList.remove('open')
    })

    const createSession = () => fetch(`${apiBase}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitor_id: visitorId, page_url: location.href, referrer: document.referrer || null }),
    })
    let sessionResponse = await createSession()
    if (!sessionResponse.ok && visitorId) {
      localStorage.removeItem(storageKey)
      visitorId = null
      sessionResponse = await createSession()
    }
    if (!sessionResponse.ok) throw new Error('Не удалось подключить чат')
    const session = await sessionResponse.json()
    visitorId = session.visitorId
    localStorage.setItem(storageKey, visitorId)

    load = async () => {
      try {
        const response = await fetch(`${apiBase}/messages/${encodeURIComponent(visitorId)}`)
        if (!response.ok) throw new Error('Ошибка загрузки сообщений')
        const items = await response.json()
        const signature = items.map((item) => `${item.id}:${item.text}`).join('|')
        if (signature === lastSignature) return
        lastSignature = signature
        messages.replaceChildren()
        if (!items.length) messages.append(el('div', 'empty', 'Оставьте сообщение — оператор ответит здесь.'))
        for (const item of items) messages.append(el('div', `msg ${item.is_from_me ? 'operator' : 'mine'}`, item.text || ''))
        messages.scrollTop = messages.scrollHeight
        status.textContent = ''
      } catch (error) {
        status.textContent = error.message
      }
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault()
      const text = input.value.trim()
      if (!text) return
      send.disabled = true
      status.textContent = ''
      try {
        const response = await fetch(`${apiBase}/messages/${encodeURIComponent(visitorId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        })
        if (!response.ok) throw new Error('Не удалось отправить сообщение')
        input.value = ''
        await load()
      } catch (error) {
        status.textContent = error.message
      } finally {
        send.disabled = false
      }
    })
    await load()
    window.setInterval(() => { if (opened) load() }, 2500)
  }

  const boot = () => start().catch((error) => console.error('[Connect Hub widget]', error))
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true })
  else boot()
})()
