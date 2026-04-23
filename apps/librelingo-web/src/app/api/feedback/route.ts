import { NextResponse } from 'next/server'
import {
    AccountUnavailableError,
    canExportFeedback,
    createLessonFeedback,
    getCurrentAccountUser,
    listLessonFeedback,
} from '@/lib/server/account-store'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
    const user = getCurrentAccountUser()

    if (!user) {
        return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })
    }

    const body = (await request.json().catch(() => ({}))) as {
        courseId?: unknown
        moduleTitle?: unknown
        lessonTitle?: unknown
        practiceHref?: unknown
        message?: unknown
    }
    const payload = normalizeFeedbackPayload(body)

    if (!payload) {
        return NextResponse.json(
            { message: 'Please add a short feedback message.' },
            { status: 400 }
        )
    }

    try {
        await createLessonFeedback({
            user,
            ...payload,
        })

        return NextResponse.json({ ok: true })
    } catch (error) {
        if (error instanceof AccountUnavailableError) {
            return NextResponse.json({ message: error.message }, { status: 503 })
        }

        return NextResponse.json(
            { message: 'Could not save feedback right now.' },
            { status: 500 }
        )
    }
}

export async function GET() {
    const user = getCurrentAccountUser()

    if (!user) {
        return NextResponse.json({ message: 'Not signed in.' }, { status: 401 })
    }

    if (!canExportFeedback(user)) {
        return NextResponse.json({ message: 'Not allowed.' }, { status: 403 })
    }

    try {
        const feedback = await listLessonFeedback()

        return NextResponse.json({ feedback })
    } catch (error) {
        if (error instanceof AccountUnavailableError) {
            return NextResponse.json({ message: error.message }, { status: 503 })
        }

        return NextResponse.json(
            { message: 'Could not load feedback right now.' },
            { status: 500 }
        )
    }
}

function normalizeFeedbackPayload(body: {
    courseId?: unknown
    moduleTitle?: unknown
    lessonTitle?: unknown
    practiceHref?: unknown
    message?: unknown
}) {
    if (
        typeof body.courseId !== 'string' ||
        typeof body.moduleTitle !== 'string' ||
        typeof body.lessonTitle !== 'string' ||
        typeof body.practiceHref !== 'string' ||
        typeof body.message !== 'string'
    ) {
        return
    }

    const message = body.message.trim()

    if (message.length === 0) {
        return
    }

    return {
        courseId: body.courseId.slice(0, 120),
        moduleTitle: body.moduleTitle.slice(0, 200),
        lessonTitle: body.lessonTitle.slice(0, 200),
        practiceHref: body.practiceHref.slice(0, 160),
        message: message.slice(0, 2000),
    }
}
