import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
    title: 'Learn Somali',
    description: 'Practice Somali from English',
}

export default function Home() {
    redirect('/login')
}
