import Image from 'next/image'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import AccountPanel from '@/components/account-panel'
import {
    getAccountUnavailableReason,
    getCurrentAccountUser,
} from '@/lib/server/account-store'

export const metadata: Metadata = {
    title: 'Sign in | Learn Somali',
    description: 'Create an account or sign in to save Somali course progress.',
}

type Props = {
    searchParams?: {
        next?: string
    }
}

function getSafeNextPath(nextPath: string | undefined) {
    if (!nextPath || !nextPath.startsWith('/') || nextPath.startsWith('//')) {
        return '/en/courses/so'
    }

    return nextPath
}

export default function LoginPage({ searchParams }: Props) {
    const nextPath = getSafeNextPath(searchParams?.next)
    const accountsAreConfigured = getAccountUnavailableReason() === undefined

    if (accountsAreConfigured && getCurrentAccountUser()) {
        redirect(nextPath)
    }

    return (
        <main className="min-h-screen bg-[linear-gradient(180deg,#f2f7ff_0%,#e7f1ff_45%,#ffffff_100%)]">
            <div className="mx-auto grid min-h-screen w-full max-w-6xl gap-8 px-6 py-10 md:grid-cols-[0.9fr_1.1fr] md:items-center md:px-8">
                <section className="space-y-6">
                    <div className="inline-flex rounded-full bg-white px-4 py-2 text-sm font-semibold uppercase tracking-[0.22em] text-[#4189dd] shadow-sm ring-1 ring-[#dbe9fd]">
                        Learn Somali
                    </div>
                    <div className="space-y-4">
                        <h1 className="font-serif text-5xl leading-tight text-slate-950 md:text-6xl">
                            Sign in before you start learning.
                        </h1>
                        <p className="max-w-xl text-lg leading-8 text-slate-600">
                            Create a free account once, then your lesson progress,
                            streaks, and XP can follow you between devices.
                        </p>
                    </div>
                    <div className="overflow-hidden rounded-[2rem] border border-[#bfd7f8] bg-white shadow-[0_24px_80px_-45px_rgba(65,137,221,0.45)]">
                        <div className="relative min-h-[220px]">
                            <Image
                                src="/hero_banner.png"
                                alt="Somali course banner"
                                fill
                                className="object-cover"
                                priority
                            />
                        </div>
                    </div>
                </section>

                <section className="rounded-[2rem] border border-[#bfd7f8] bg-white/80 p-4 shadow-[0_24px_80px_-45px_rgba(65,137,221,0.45)] md:p-6">
                    <AccountPanel redirectAfterAuth={nextPath} />
                </section>
            </div>
        </main>
    )
}
