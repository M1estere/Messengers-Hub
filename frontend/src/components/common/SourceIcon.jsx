import telegramIcon from '../../assets/telegram.png'
import maxIcon from '../../assets/max.jpg'

export default function SourceIcon({ source }) {
    if (source === 'telegram') {
        return <img src={telegramIcon} alt="Telegram" />
    }

    if (source === 'max') {
        return <img src={maxIcon} alt="MAX" />
    }

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
