'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import SkillProgressSummary from '@/components/skill-progress-summary'
import { cn } from '@/lib/utils'
import {
    getProgressEventName,
    readProgressStore,
    type StoredSkillProgress,
} from '@/lib/progress'
import type { CourseModule, CourseSkill } from '@/data/course'

type Props = {
    courseId: string
    modules: CourseModule[]
    sourceLanguageCode: string
    targetLanguageCode: string
}

type ModuleProgressMeta = {
    completedSkillCount: number
    hasStarted: boolean
    isCompleted: boolean
}

function SkillCard({
    courseId,
    sourceLanguageCode,
    targetLanguageCode,
    skill,
}: {
    courseId: string
    sourceLanguageCode: string
    targetLanguageCode: string
    skill: CourseSkill
}) {
    const practiceUrl = `/${sourceLanguageCode}/courses/${targetLanguageCode}/${skill.practiceHref}`
    const skillKind = skill.kind ?? 'standard'
    const isGrammarSkill = skillKind === 'grammar'
    const isHistorySkill = skillKind === 'history'
    let cardClasses = 'h-full border-[#bfd7f8] bg-white/95 shadow-sm'
    let moduleLabelClasses = 'text-[#4189dd]'

    if (isGrammarSkill) {
        cardClasses =
            'h-full border-[#4189dd] bg-[linear-gradient(180deg,#e4f0ff_0%,#f7fbff_100%)] shadow-[0_18px_50px_-36px_rgba(65,137,221,0.6)]'
        moduleLabelClasses = 'text-[#1f5ea6]'
    } else if (isHistorySkill) {
        cardClasses =
            'h-full border-[#caa25b] bg-[linear-gradient(180deg,#fff7e8_0%,#fffdf8_100%)] shadow-[0_18px_50px_-36px_rgba(202,162,91,0.55)]'
        moduleLabelClasses = 'text-[#8b5e1a]'
    }

    const buttonVariant = isGrammarSkill ? 'default' : 'outline'

    return (
        <Card className={cardClasses}>
            <CardHeader className="space-y-3">
                <div className="flex items-start justify-between gap-4">
                    <CardTitle className="text-xl text-slate-900">
                        {skill.title}
                    </CardTitle>
                    <div className="flex flex-col items-end gap-2">
                        {isGrammarSkill && (
                            <div className="rounded-full bg-[#0f4f97] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-white">
                                Grammar lesson
                            </div>
                        )}
                        {isHistorySkill && (
                            <div className="rounded-full bg-[#8b5e1a] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-white">
                                History lesson
                            </div>
                        )}
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <SkillProgressSummary
                    courseId={courseId}
                    practiceHref={skill.practiceHref}
                />
                <div className="flex flex-wrap gap-2">
                    {skill.summary.slice(0, 1).map((item) => (
                        <p
                            key={item}
                            className={cn(
                                'text-sm leading-6',
                                moduleLabelClasses
                            )}
                        >
                            {item}
                        </p>
                    ))}
                </div>
                <Button
                    asChild
                    variant={buttonVariant}
                    className="w-full justify-center"
                >
                    <Link href={practiceUrl}>Open practice</Link>
                </Button>
            </CardContent>
        </Card>
    )
}

function getSkillProgressByHref(
    courseId: string,
    progressByKey: Record<string, StoredSkillProgress>,
    practiceHref: string
) {
    return progressByKey[`${courseId}::${practiceHref}`]
}

function getModuleProgressMeta(
    courseId: string,
    module: CourseModule,
    progressByKey: Record<string, StoredSkillProgress>
): ModuleProgressMeta {
    const completedSkillCount = module.skills.filter((skill) => {
        const progress = getSkillProgressByHref(
            courseId,
            progressByKey,
            skill.practiceHref
        )

        return (progress?.completedRuns ?? 0) > 0
    }).length

    const hasStarted = module.skills.some((skill) => {
        const progress = getSkillProgressByHref(
            courseId,
            progressByKey,
            skill.practiceHref
        )

        return progress !== undefined
    })

    return {
        completedSkillCount,
        hasStarted,
        isCompleted:
            module.skills.length > 0 &&
            completedSkillCount === module.skills.length,
    }
}

function HeadlineOnlyModule({
    module,
    meta,
    isFirstLockedModule,
}: {
    module: CourseModule
    meta: ModuleProgressMeta
    isFirstLockedModule: boolean
}) {
    return (
        <section className="rounded-3xl border border-dashed border-[#cfe0f7] bg-white/70 px-6 py-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-2xl font-semibold text-slate-900">
                            {module.title}
                        </h2>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                            Headline only
                        </span>
                    </div>
                    <p className="text-sm leading-6 text-slate-600">
                        {isFirstLockedModule
                            ? 'This module will open up once the next module is completed.'
                            : 'Keep moving through the current path to unlock the lesson details here.'}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2 text-sm text-slate-600">
                    <span className="rounded-full bg-white px-3 py-1 ring-1 ring-[#d6e6fb]">
                        {module.skills.length} lesson
                        {module.skills.length === 1 ? '' : 's'}
                    </span>
                    <span className="rounded-full bg-white px-3 py-1 ring-1 ring-[#d6e6fb]">
                        {meta.completedSkillCount}/{module.skills.length} done
                    </span>
                    {meta.hasStarted && (
                        <span className="rounded-full bg-[#fff7e8] px-3 py-1 font-medium text-[#8b5e1a] ring-1 ring-[#f2dfb6]">
                            Started already
                        </span>
                    )}
                </div>
            </div>
        </section>
    )
}

function ExpandedModule({
    courseId,
    module,
    sourceLanguageCode,
    targetLanguageCode,
    meta,
    isNextUp,
}: {
    courseId: string
    module: CourseModule
    sourceLanguageCode: string
    targetLanguageCode: string
    meta: ModuleProgressMeta
    isNextUp: boolean
}) {
    return (
        <section className="space-y-5">
            <div className="flex flex-col gap-3 border-b border-[#d6e6fb] pb-3 md:flex-row md:items-end md:justify-between">
                <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-3xl font-semibold text-slate-900">
                            {module.title}
                        </h2>
                        {meta.isCompleted && (
                            <span className="rounded-full bg-[#daf3e2] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#1e6c40]">
                                Completed
                            </span>
                        )}
                        {!meta.isCompleted && isNextUp && (
                            <span className="rounded-full bg-[#eef5ff] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#1f5ea6]">
                                Next up
                            </span>
                        )}
                    </div>
                    <p className="text-sm leading-6 text-slate-600">
                        {meta.completedSkillCount} of {module.skills.length} lesson
                        {module.skills.length === 1 ? '' : 's'} completed.
                    </p>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                {module.skills.map((skill) => (
                    <SkillCard
                        key={skill.id}
                        courseId={courseId}
                        sourceLanguageCode={sourceLanguageCode}
                        targetLanguageCode={targetLanguageCode}
                        skill={skill}
                    />
                ))}
            </div>
        </section>
    )
}

export default function CourseModuleList(props: Props) {
    const {
        courseId,
        modules,
        sourceLanguageCode,
        targetLanguageCode,
    } = props
    const [progressByKey, setProgressByKey] = useState<
        Record<string, StoredSkillProgress>
    >({})

    useEffect(() => {
        const refresh = () => {
            setProgressByKey(readProgressStore().skills)
        }

        refresh()

        window.addEventListener('storage', refresh)
        window.addEventListener(getProgressEventName(), refresh)

        return () => {
            window.removeEventListener('storage', refresh)
            window.removeEventListener(getProgressEventName(), refresh)
        }
    }, [])

    const moduleMeta = modules.map((module) =>
        getModuleProgressMeta(courseId, module, progressByKey)
    )
    const nextUpIndex = moduleMeta.findIndex((meta) => !meta.isCompleted)

    return (
        <div className="space-y-8">
            {modules.map((module, index) => {
                const meta = moduleMeta[index]
                const isNextUp = nextUpIndex === index
                const shouldExpand = meta.isCompleted || isNextUp

                if (!shouldExpand) {
                    return (
                        <HeadlineOnlyModule
                            key={module.title}
                            module={module}
                            meta={meta}
                            isFirstLockedModule={index === nextUpIndex + 1}
                        />
                    )
                }

                return (
                    <ExpandedModule
                        key={module.title}
                        courseId={courseId}
                        module={module}
                        sourceLanguageCode={sourceLanguageCode}
                        targetLanguageCode={targetLanguageCode}
                        meta={meta}
                        isNextUp={isNextUp}
                    />
                )
            })}
        </div>
    )
}
