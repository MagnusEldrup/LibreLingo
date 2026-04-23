'use client'

import { useEffect, useState } from 'react'
import {
    getProgressEventName,
    getSkillProgress,
    type StoredSkillProgress,
} from '@/lib/progress'
import { cn } from '@/lib/utils'

type Props = {
    courseId: string
    practiceHref: string
}

type SkillProgressState = 'notStarted' | 'practicing' | 'completed'

function formatCount(count: number, singular: string, plural: string) {
    return `${count} ${count === 1 ? singular : plural}`
}

function getSkillProgressState(
    progress: StoredSkillProgress | undefined
): SkillProgressState {
    if (!progress) {
        return 'notStarted'
    }

    if (progress.completedRuns > 0) {
        return 'completed'
    }

    return 'practicing'
}

function getStatePresentation(state: SkillProgressState) {
    if (state === 'completed') {
        return {
            wrapperClasses: 'border-[#84c3a0] bg-[linear-gradient(180deg,#f1fcf4_0%,#fbfffc_100%)]',
            badgeClasses: 'bg-[#daf3e2] text-[#1e6c40]',
            statClasses: 'bg-white/90 ring-1 ring-[#d8efe0]',
            title: 'Completed',
            subtitle: 'This lesson is finished and counts toward course progress.',
        }
    }

    if (state === 'practicing') {
        return {
            wrapperClasses: 'border-[#f0c77a] bg-[linear-gradient(180deg,#fff8e8_0%,#fffdf8_100%)]',
            badgeClasses: 'bg-[#fde7b8] text-[#8b5e1a]',
            statClasses: 'bg-white/90 ring-1 ring-[#f5e2bc]',
            title: 'Practicing',
            subtitle: 'A run has started, but it is not marked complete yet.',
        }
    }

    return {
        wrapperClasses: 'border-[#d6e6fb] bg-[#f7fbff]',
        badgeClasses: 'bg-[#eef5ff] text-[#4189dd]',
        statClasses: 'bg-white ring-1 ring-[#d6e6fb]',
        title: 'Not started',
        subtitle: 'Start this lesson to begin tracking completions, XP, and accuracy.',
    }
}

export default function SkillProgressSummary(props: Props) {
    const { courseId, practiceHref } = props
    const [progress, setProgress] = useState<StoredSkillProgress | undefined>()

    useEffect(() => {
        const refresh = () => {
            setProgress(getSkillProgress(courseId, practiceHref))
        }

        refresh()

        window.addEventListener('storage', refresh)
        window.addEventListener(getProgressEventName(), refresh)

        return () => {
            window.removeEventListener('storage', refresh)
            window.removeEventListener(getProgressEventName(), refresh)
        }
    }, [courseId, practiceHref])

    const state = getSkillProgressState(progress)
    const presentation = getStatePresentation(state)
    const completedRuns = progress?.completedRuns ?? 0
    const completionLabel =
        completedRuns === 0
            ? '0 completions'
            : formatCount(completedRuns, 'completion', 'completions')
    const repeatLabel =
        completedRuns > 1
            ? `Repeated ${completedRuns} times`
            : (completedRuns === 1 ? 'Finished once' : 'No completed runs yet')
    const lastAccuracy = progress?.lastAccuracy ?? 0
    const bestRunScore = progress?.bestRunScore ?? 0
    const totalChallenges = progress?.totalChallengesCompleted ?? 0

    return (
        <div
            className={cn(
                'space-y-4 rounded-2xl border p-4',
                presentation.wrapperClasses
            )}
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                    <span
                        className={cn(
                            'inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]',
                            presentation.badgeClasses
                        )}
                    >
                        {presentation.title}
                    </span>
                    <div>
                        <p className="text-base font-semibold text-slate-900">
                            {completionLabel}
                        </p>
                        <p className="text-sm leading-6 text-slate-600">
                            {presentation.subtitle}
                        </p>
                    </div>
                </div>
                <div className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-black/5">
                    {repeatLabel}
                </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
                <div className={cn('rounded-2xl p-3', presentation.statClasses)}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Last accuracy
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">
                        {lastAccuracy}%
                    </p>
                </div>
                <div className={cn('rounded-2xl p-3', presentation.statClasses)}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Best run
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">
                        {bestRunScore} XP
                    </p>
                </div>
                <div className={cn('rounded-2xl p-3', presentation.statClasses)}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Challenges
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">
                        {totalChallenges}
                    </p>
                </div>
            </div>
        </div>
    )
}
