import { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import {
    getAccountUnavailableReason,
    getCurrentAccountUser,
} from '@/lib/server/account-store'

export const dynamic = 'force-dynamic'

type Props = {
    children: ReactNode
    params: {
        sourceLanguageCode: string
        targetLanguageCode: string
    }
}

export default function CourseAuthLayout({ children, params }: Props) {
    const accountsAreConfigured = getAccountUnavailableReason() === undefined

    if (accountsAreConfigured && !getCurrentAccountUser()) {
        redirect(
            `/login?next=/${params.sourceLanguageCode}/courses/${params.targetLanguageCode}`
        )
    }

    return children
}
