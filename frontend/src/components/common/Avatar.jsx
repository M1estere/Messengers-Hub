import { useEffect, useState } from 'react'
import telegramIcon from '../../assets/telegram.png'
import maxIcon from '../../assets/max.jpg'

export default function Avatar({ chat }) {
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
