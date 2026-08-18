function parseMessageDate(iso) {
  if (!iso) return null
  const date = new Date(iso.endsWith('Z') ? iso : `${iso}Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

export function fmtTime(iso) {
  const date = parseMessageDate(iso)
  if (!date) return ''
  return date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  })
}

export function messageDateKey(iso) {
  const date = parseMessageDate(iso)
  if (!date) return ''
  return new Intl.DateTimeFormat('ru-RU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Europe/Moscow',
  }).format(date)
}

export function fmtMessageDay(iso) {
  const date = parseMessageDate(iso)
  if (!date) return ''
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Moscow',
  }).format(date)
}

export function fmtSidebarDateTime(iso) {
  const date = parseMessageDate(iso)
  if (!date) return ''
  const formatter = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Europe/Moscow',
  })
  const calendarDay = (value) => {
    const parts = Object.fromEntries(formatter.formatToParts(value).map((part) => [part.type, part.value]))
    return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day))
  }
  const daysAgo = Math.round((calendarDay(new Date()) - calendarDay(date)) / 86400000)
  if (daysAgo === 0) return fmtTime(iso)
  if (daysAgo >= 1 && daysAgo <= 7) {
    return new Intl.DateTimeFormat('ru-RU', {
      weekday: 'short',
      timeZone: 'Europe/Moscow',
    }).format(date).replace('.', '').slice(0, 2)
  }
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Moscow',
  }).format(date)
}

export function fmtDuration(seconds) {
  if (!seconds || Number.isNaN(Number(seconds))) return '0:00'
  const value = Math.round(seconds)
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`
}

export function mediaLabel(message) {
  if (message?.media_type === 'image') return 'Изображение'
  if (message?.media_type === 'document') return 'Файл'
  if (message?.media_type === 'voice') return 'Голосовое сообщение'
  if (message?.media_type === 'audio') return 'Аудио'
  if (message?.media_type === 'sticker') return 'Стикер'
  return message?.media_name || ''
}
