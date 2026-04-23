import { NextResponse } from 'next/server'
import {
    getAccountUnavailableReason,
    getCurrentAccountUser,
} from '@/lib/server/account-store'

export const dynamic = 'force-dynamic'

export async function GET() {
    const unavailableReason = getAccountUnavailableReason()

    return NextResponse.json({
        accountsAvailable: unavailableReason === undefined,
        message: unavailableReason,
        user: getCurrentAccountUser(),
    })
}
