import { NextResponse } from 'next/server'
import { clearSessionCookie } from '@/lib/server/account-store'

export const dynamic = 'force-dynamic'

export async function POST() {
    clearSessionCookie()

    return NextResponse.json({ ok: true })
}
