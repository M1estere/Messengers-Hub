import { useEffect, useRef, useState } from 'react'
import { SOURCE_FILTERS } from '../../constants'
import SourceIcon from '../common/SourceIcon'

export default function SourceFilterSelect({ value, onChange }) {
    const [open, setOpen] = useState(false)
    const wrapRef = useRef(null)
    const selected = SOURCE_FILTERS.find((source) => source.value === value) || SOURCE_FILTERS[0]

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
        <div className="source-select" ref={wrapRef}>
            <button
                type="button"
                className="source-select-trigger"
                aria-label={`Источник: ${selected.label}`}
                aria-haspopup="listbox"
                aria-expanded={open}
                title={selected.label}
                onClick={() => setOpen((current) => !current)}
            >
                <span className="source-filter-icon"><SourceIcon source={selected.value} /></span>
                <span className="source-select-value">{selected.label}</span>
                <svg className="source-select-arrow" viewBox="0 0 20 20" aria-hidden="true">
                    <path d="m5 7.5 5 5 5-5" />
                </svg>
            </button>
            {open && (
                <div className="source-select-menu" role="listbox" aria-label="Источники">
                    {SOURCE_FILTERS.map((source) => (
                        <button
                            key={source.value}
                            type="button"
                            className={value === source.value ? 'active' : ''}
                            role="option"
                            aria-selected={value === source.value}
                            onClick={() => {
                                onChange(source.value)
                                setOpen(false)
                            }}
                        >
                            <span className="source-filter-icon"><SourceIcon source={source.value} /></span>
                            <span>{source.label}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
