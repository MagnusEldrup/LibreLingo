'use client'

import { useEffect, useState } from 'react'
import {
    getProgressEventName,
    summarizeCourseProgress,
    type CourseProgressSummary,
} from '@/lib/progress'
import LevelAvatar from '@/components/level-avatar'
import LevelProgress from '@/components/level-progress'
import { getLevelProgress } from '@/lib/levels'

type Props = {
    courseId: string
    practiceHrefs: string[]
}

function createEmptySummary(): CourseProgressSummary {
    return {
        totalSkillsTracked: 0,
        completedSkills: 0,
        totalPoints: 0,
        totalChallengesCompleted: 0,
        overallAccuracy: 0,
        bestStreak: 0,
        completedRuns: 0,
        currentDailyStreak: 0,
        bestDailyStreak: 0,
        todayCompletedChallenges: 0,
        dailyGoal: 2,
        todayGoalReached: false,
    }
}

export default function CourseProgressSummary(props: Props) {
    const { courseId, practiceHrefs } = props
    const [summary, setSummary] = useState<CourseProgressSummary>(
        createEmptySummary()
    )

    useEffect(() => {
        const refresh = () => {
            setSummary(summarizeCourseProgress(courseId, practiceHrefs))
        }

        refresh()

        window.addEventListener('storage', refresh)
        window.addEventListener(getProgressEventName(), refresh)

        return () => {
            window.removeEventListener('storage', refresh)
            window.removeEventListener(getProgressEventName(), refresh)
        }
    }, [courseId, practiceHrefs])

    const hasProgress = summary.totalSkillsTracked > 0
    const levelProgress = getLevelProgress(summary.totalPoints)
    const todayProgressLabel = summary.todayGoalReached
        ? `Qualified today with ${summary.todayCompletedChallenges} exercise${summary.todayCompletedChallenges === 1 ? '' : 's'}.`
        : `${summary.todayCompletedChallenges}/${summary.dailyGoal} exercises today to keep your streak going.`

    return (
        <div className="space-y-4 text-sm leading-7 text-slate-700">
            <div className="grid gap-4 lg:grid-cols-[160px_minmax(0,1fr)]">
                <div className="rounded-[1.75rem] bg-white/80 p-4">
                    <LevelAvatar
                        totalPoints={summary.totalPoints}
                        alt="Course progress avatar"
                        width={140}
                        height={140}
                        className="mx-auto max-w-[120px]"
                    />
                </div>
                <div className="rounded-[1.75rem] bg-white/80 p-5">
                    <LevelProgress totalPoints={summary.totalPoints} />
                </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl bg-white/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#4189dd]">
                        Course title
                    </p>
                    <p className="mt-2 text-3xl font-semibold text-slate-900">
                        {levelProgress.title}
                    </p>
                </div>
                <div className="rounded-2xl bg-white/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#4189dd]">
                        Accuracy
                    </p>
                    <p className="mt-2 text-3xl font-semibold text-slate-900">
                        {summary.overallAccuracy}%
                    </p>
                </div>
                <div className="rounded-2xl bg-white/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#4189dd]">
                        Skills played
                    </p>
                    <p className="mt-2 text-3xl font-semibold text-slate-900">
                        {summary.totalSkillsTracked}
                    </p>
                </div>
                <div className="rounded-2xl bg-white/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#4189dd]">
                        Daily streak
                    </p>
                    <p className="mt-2 text-3xl font-semibold text-slate-900">
                        {summary.currentDailyStreak}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                        Best: {summary.bestDailyStreak} day
                        {summary.bestDailyStreak === 1 ? '' : 's'}
                    </p>
                </div>
            </div>

            <p>
                {hasProgress
                    ? `You have completed ${summary.completedRuns} run${summary.completedRuns === 1 ? '' : 's'} across ${summary.completedSkills} finished skill${summary.completedSkills === 1 ? '' : 's'} and reached the title ${levelProgress.title}. ${todayProgressLabel}`
                    : `No saved progress yet. Start a skill to begin tracking your overall course XP, accuracy, and daily streak. ${todayProgressLabel}`}
            </p>
        </div>
    )
}
