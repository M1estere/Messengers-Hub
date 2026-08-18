import { useState } from 'react'
import { API_BASE } from '../../constants'

export default function AuthForm({ onAuthenticated }) {
    const [mode, setMode] = useState('login')
    const [login, setLogin] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [pending, setPending] = useState(false)

    const submit = async (e) => {
        e.preventDefault()
        setError('')
        setPending(true)
        try {
            const body = mode === 'login' ? { login, password } : { email, password }
            const res = await fetch(`${API_BASE}/auth/${mode}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.detail || 'Ошибка авторизации')
            onAuthenticated(data)
        } catch (err) {
            setError(err.message)
        } finally {
            setPending(false)
        }
    }

    return (
        <div className="auth-page">
            <form className="auth-card" onSubmit={submit}>
                <p>{mode === 'login' ? 'Вход' : 'Регистрация'}</p>
                {mode === 'login' ? (
                    <input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="Логин или email" autoComplete="username" required />
                ) : (
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" autoComplete="email" required />
                )}
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Пароль" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 6 : undefined} required />
                {error && <div className="auth-error">{error}</div>}
                <button type="submit" disabled={pending}>{pending ? 'Загрузка…' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}</button>
                <button type="button" className="auth-switch" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}>
                    {mode === 'login' ? 'Регистрация по email' : 'Уже есть аккаунт'}
                </button>
            </form>
        </div>
    )
}
