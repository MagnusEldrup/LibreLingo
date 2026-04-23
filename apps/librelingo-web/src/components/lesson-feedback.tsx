'use client'

import { FormEvent, useState } from 'react'
import { Button } from '@/components/ui/button'

type Props = {
    courseId: string
    moduleTitle: string
    lessonTitle: string
    practiceHref: string
}

export default function LessonFeedback(props: Props) {
    const { courseId, moduleTitle, lessonTitle, practiceHref } = props
    const [isOpen, setIsOpen] = useState(false)
    const [message, setMessage] = useState('')
    const [status, setStatus] = useState<string | undefined>()
    const [isSubmitting, setIsSubmitting] = useState(false)

    async function submitFeedback(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setIsSubmitting(true)
        setStatus(undefined)

        try {
            const response = await fetch('/api/feedback', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                credentials: 'same-origin',
                body: JSON.stringify({
                    courseId,
                    moduleTitle,
                    lessonTitle,
                    practiceHref,
                    message,
                }),
            })
            const body = (await response.json().catch(() => ({}))) as {
                message?: string
            }

            if (!response.ok) {
                setStatus(body.message ?? 'Could not save feedback.')
                return
            }

            setMessage('')
            setIsOpen(false)
            setStatus('Feedback saved. Thank you.')
        } catch {
            setStatus('Could not reach the feedback service.')
        } finally {
            setIsSubmitting(false)
        }
    }

    if (!isOpen) {
        return (
            <div className="space-y-2">
                <Button
                    type="button"
                    variant="ghost"
                    className="w-full justify-center text-[#1f5ea6]"
                    onClick={() => setIsOpen(true)}
                >
                    Give feedback on this lesson
                </Button>
                {status && (
                    <p className="text-center text-sm font-medium text-[#1f5ea6]">
                        {status}
                    </p>
                )}
            </div>
        )
    }

    return (
        <form
            className="space-y-3 rounded-2xl border border-[#d6e6fb] bg-[#f7fbff] p-4"
            onSubmit={submitFeedback}
        >
            <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">
                    Feedback for {lessonTitle}
                </p>
                <p className="text-xs leading-5 text-slate-600">
                    Tell me what is wrong, missing, confusing, or worth improving.
                </p>
            </div>
            <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                className="min-h-[110px] w-full rounded-2xl border border-[#bfd7f8] bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none focus:ring-2 focus:ring-[#4189dd]"
                maxLength={2000}
                placeholder="Example: This answer should also accept..."
                required
            />
            <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={isSubmitting}>
                    Save feedback
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setIsOpen(false)}
                    disabled={isSubmitting}
                >
                    Cancel
                </Button>
            </div>
            {status && <p className="text-sm font-medium text-[#1f5ea6]">{status}</p>}
        </form>
    )
}
