import { NextResponse } from 'next/server'
import {
    AccountUnavailableError,
    createAccount,
    setSessionCookie,
    validateEmailAndPassword,
} from '@/lib/server/account-store'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
    const body = (await request.json().catch(() => ({}))) as {
        email?: unknown
        password?: unknown
    }
    const email = typeof body.email === 'string' ? body.email : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const validationError = validateEmailAndPassword(email, password)

    if (validationError) {
        return NextResponse.json({ message: validationError }, { status: 400 })
    }

    try {
        const user = await createAccount(email, password)
        setSessionCookie(user)

        return NextResponse.json({ user })
    } catch (error) {
        if (error instanceof AccountUnavailableError) {
            return NextResponse.json({ message: error.message }, { status: 503 })
        }

        const errorMessage =
            error instanceof Error ? error.message : 'Unknown database error.'

        return NextResponse.json(
            { message: `Could not create account: ${errorMessage}` },
            { status: 409 }
        )
    }
}
