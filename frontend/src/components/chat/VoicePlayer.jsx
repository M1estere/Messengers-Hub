import { useEffect, useRef, useState } from 'react'
import { fmtDuration } from '../../utils/messages'

export default function VoicePlayer({ src, duration }) {
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
      document.querySelectorAll('.voice-audio').forEach((audio) => {
        if (audio !== el) audio.pause()
      })
      el.play().catch(() => {})
    } else {
      el.pause()
    }
  }

  const seek = (event) => {
    const el = audioRef.current
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    if (el) el.currentTime = ratio * (el.duration || total || 0)
  }

  const percent = total ? Math.min(100, (current / total) * 100) : 0
  return (
    <div className="voice-player">
      <audio ref={audioRef} className="voice-audio" preload="metadata" src={src} />
      <button className="voice-play" onClick={toggle} title={playing ? 'Пауза' : 'Слушать'}>
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
        <div className="voice-track-fill" style={{ width: `${percent}%` }} />
      </div>
      <span className="voice-time">
        {retrying ? '…' : playing || current > 0 ? fmtDuration(current) : fmtDuration(total)}
      </span>
    </div>
  )
}
