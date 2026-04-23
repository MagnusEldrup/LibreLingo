import { NextResponse } from 'next/server'
import {
    AccountUnavailableError,
    setSessionCookie,
    validateEmailAndPassword,
    verifyAccount,
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
        const user = await verifyAccount(email, password)

        if (!user) {
            return NextResponse.json(
                { message: 'Email or password is incorrect.' },
                { status: 401 }
            )
        }

        setSessionCookie(user)

        return NextResponse.json({ user })
    } catch (error) {
        if (error instanceof AccountUnavailableError) {
            return NextResponse.json({ message: error.message }, { status: 503 })
        }

        return NextResponse.json(
            { message: 'Could not sign in right now.' },
            { status: 500 }
        )
    }
}
