import { NextResponse } from 'next/server'
import {
    AccountUnavailableError,
    getCurrentAccountUser,
    readAccountProgress,
    writeAccountProgress,
} from '@/lib/server/account-store'
import type { ProgressStore } from '@/lib/progress'

export const dynamic = 'force-dynamic'

export async function GET() {
    const user = getCurrentAccountUser()

    if (!user) {
        return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })
    }

    try {
        const progress = await readAccountProgress(user.id)

        return NextResponse.json({ progress })
    } catch (error) {
        if (error instanceof AccountUnavailableError) {
            return NextResponse.json({ message: error.message }, { status: 503 })
        }

        return NextResponse.json(
            { message: 'Could not load progress.' },
            { status: 500 }
        )
    }
}

export async function PUT(request: Request) {
    const user = getCurrentAccountUser()

    if (!user) {
        return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })
    }

    const body = (await request.json().catch(() => ({}))) as {
        progress?: unknown
    }
    const progress = normalizeProgressPayload(body.progress)

    if (!progress) {
        return NextResponse.json(
            { message: 'Invalid progress payload.' },
            { status: 400 }
        )
    }

    try {
        await writeAccountProgress(user.id, progress)

        return NextResponse.json({ ok: true })
    } catch (error) {
        if (error instanceof AccountUnavailableError) {
            return NextResponse.json({ message: error.message }, { status: 503 })
        }

        return NextResponse.json(
            { message: 'Could not save progress.' },
            { status: 500 }
        )
    }
}

function normalizeProgressPayload(value: unknown): ProgressStore | undefined {
    if (!value || typeof value !== 'object') {
        return undefined
    }

    const candidate = value as Partial<ProgressStore>

    return {
        skills:
            candidate.skills && typeof candidate.skills === 'object'
                ? candidate.skills
                : {},
        dailyActivityByCourse:
            candidate.dailyActivityByCourse &&
            typeof candidate.dailyActivityByCourse === 'object'
                ? candidate.dailyActivityByCourse
                : {},
    }
}
