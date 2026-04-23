'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
    forgetAccountEmail,
    mergeLocalProgressWithAccount,
    rememberAccountEmail,
} from '@/lib/progress'

type AccountUser = {
    id: string
    email: string
}

type AuthMode = 'login' | 'register'

type Props = {
    redirectAfterAuth?: string
}

export default function AccountPanel({ redirectAfterAuth }: Props) {
    const router = useRouter()
    const [user, setUser] = useState<AccountUser | undefined>()
    const [accountsAvailable, setAccountsAvailable] = useState(true)
    const [unavailableMessage, setUnavailableMessage] = useState<string | undefined>()
    const [mode, setMode] = useState<AuthMode>('register')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [message, setMessage] = useState<string | undefined>()
    const [isLoading, setIsLoading] = useState(true)
    const [isSubmitting, setIsSubmitting] = useState(false)

    useEffect(() => {
        let isMounted = true

        async function loadAccount() {
            try {
                const response = await fetch('/api/auth/me', {
                    credentials: 'same-origin',
                })
                const body = (await response.json()) as {
                    accountsAvailable?: boolean
                    message?: string
                    user?: AccountUser
                }

                if (!isMounted) {
                    return
                }

                setAccountsAvailable(body.accountsAvailable ?? true)
                setUnavailableMessage(body.message)

                if (body.user) {
                    setUser(body.user)
                    rememberAccountEmail(body.user.email)
                    await mergeLocalProgressWithAccount()
                    setMessage('Signed in. Progress is syncing to your account.')
                    if (redirectAfterAuth) {
                        router.replace(redirectAfterAuth)
                    }
                } else {
                    forgetAccountEmail()
                }
            } catch {
                if (isMounted) {
                    setMessage('Could not check account status.')
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false)
                }
            }
        }

        void loadAccount()

        return () => {
            isMounted = false
        }
    }, [redirectAfterAuth, router])

    async function submitAuth(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setIsSubmitting(true)
        setMessage(undefined)

        try {
            const response = await fetch(`/api/auth/${mode}`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                credentials: 'same-origin',
                body: JSON.stringify({ email, password }),
            })
            const body = (await response.json()) as {
                message?: string
                user?: AccountUser
            }

            if (!response.ok || !body.user) {
                const firstTimeHint =
                    mode === 'login' && response.status === 401
                        ? ' If this is your first time here, choose Register first.'
                        : ''

                setMessage(`${body.message ?? 'Could not sign in.'}${firstTimeHint}`)
                return
            }

            setUser(body.user)
            rememberAccountEmail(body.user.email)
            await mergeLocalProgressWithAccount()
            setPassword('')
            setMessage('You are signed in. Progress is saved to your account.')
            if (redirectAfterAuth) {
                router.replace(redirectAfterAuth)
            }
        } catch {
            setMessage('Could not reach the account service.')
        } finally {
            setIsSubmitting(false)
        }
    }

    async function syncNow() {
        setIsSubmitting(true)
        setMessage(undefined)

        try {
            await mergeLocalProgressWithAccount()
            setMessage('Progress synced.')
        } catch {
            setMessage('Could not sync progress right now.')
        } finally {
            setIsSubmitting(false)
        }
    }

    async function logout() {
        setIsSubmitting(true)
        setMessage(undefined)

        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'same-origin',
            })
            forgetAccountEmail()
            setUser(undefined)
            setMessage('Signed out. Progress is still kept on this device.')
        } catch {
            setMessage('Could not sign out right now.')
        } finally {
            setIsSubmitting(false)
        }
    }

    if (isLoading) {
        return (
            <div className="rounded-3xl border border-[#bfd7f8] bg-white/80 p-5 text-sm text-slate-600">
                Checking account status...
            </div>
        )
    }

    if (!accountsAvailable) {
        return (
            <div className="rounded-3xl border border-[#f0c77a] bg-[#fff8e8] p-5 text-sm leading-7 text-slate-700">
                <p className="font-semibold text-slate-900">
                    Account progress is ready in the code, but needs Vercel setup.
                </p>
                <p>
                    Add Vercel Postgres and set LEARN_SOMALI_AUTH_SECRET to enable
                    email/password registration online. Current blocker:{' '}
                    {unavailableMessage}
                </p>
            </div>
        )
    }

    if (user) {
        return (
            <div className="flex flex-col gap-4 rounded-3xl border border-[#bfd7f8] bg-white/90 p-5 md:flex-row md:items-center md:justify-between">
                <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#4189dd]">
                        Account
                    </p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                        Signed in as {user.email}
                    </p>
                    <p className="text-sm leading-6 text-slate-600">
                        Lesson progress syncs automatically as you practice.
                    </p>
                    {message && (
                        <p className="mt-2 text-sm font-medium text-[#1f5ea6]">
                            {message}
                        </p>
                    )}
                </div>
                <div className="flex flex-wrap gap-3">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={syncNow}
                        disabled={isSubmitting}
                    >
                        Sync now
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={logout}
                        disabled={isSubmitting}
                    >
                        Sign out
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div className="rounded-3xl border border-[#bfd7f8] bg-white/90 p-5">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#4189dd]">
                        Save progress
                    </p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                        Register first, then sign in from any device
                    </p>
                </div>
                <div className="flex rounded-full bg-[#eef6ff] p-1">
                    <button
                        type="button"
                        className={`rounded-full px-4 py-2 text-sm font-semibold ${
                            mode === 'login'
                                ? 'bg-white text-[#1f5ea6] shadow-sm'
                                : 'text-slate-600'
                        }`}
                        onClick={() => setMode('login')}
                    >
                        Sign in
                    </button>
                    <button
                        type="button"
                        className={`rounded-full px-4 py-2 text-sm font-semibold ${
                            mode === 'register'
                                ? 'bg-white text-[#1f5ea6] shadow-sm'
                                : 'text-slate-600'
                        }`}
                        onClick={() => setMode('register')}
                    >
                        Register
                    </button>
                </div>
            </div>

            <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto]" onSubmit={submitAuth}>
                <label className="space-y-2 text-sm font-medium text-slate-700">
                    Email
                    <input
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        className="w-full rounded-2xl border border-[#bfd7f8] px-4 py-3 outline-none focus:ring-2 focus:ring-[#4189dd]"
                        required
                    />
                </label>
                <label className="space-y-2 text-sm font-medium text-slate-700">
                    Password
                    <input
                        type="password"
                        autoComplete={
                            mode === 'register' ? 'new-password' : 'current-password'
                        }
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className="w-full rounded-2xl border border-[#bfd7f8] px-4 py-3 outline-none focus:ring-2 focus:ring-[#4189dd]"
                        minLength={8}
                        required
                    />
                </label>
                <div className="flex items-end">
                    <Button
                        type="submit"
                        className="w-full md:w-auto"
                        disabled={isSubmitting}
                    >
                        {mode === 'register' ? 'Register' : 'Sign in'}
                    </Button>
                </div>
            </form>

            <p className="mt-3 text-sm leading-6 text-slate-600">
                Passwords are hashed on the server. Your existing browser progress
                will be merged into the account after sign-in.
            </p>
            {message && (
                <p className="mt-3 text-sm font-medium text-[#1f5ea6]">{message}</p>
            )}
        </div>
    )
}
