import { getLevelProgress } from '@/lib/levels'
import { cn } from '@/lib/utils'

type Props = {
    totalPoints: number
    compact?: boolean
    className?: string
}

export default function LevelProgress(props: Props) {
    const { totalPoints, compact = false, className } = props
    const levelProgress = getLevelProgress(totalPoints)

    return (
        <div className={cn('space-y-2', className)}>
            <div className="flex items-center justify-between gap-3">
                <div>
                    <p
                        className={cn(
                            'font-semibold text-slate-900',
                            compact ? 'text-sm' : 'text-base'
                        )}
                    >
                        Level {levelProgress.level}
                    </p>
                    <p
                        className={cn(
                            'font-medium text-[#2f6db8]',
                            compact ? 'text-xs' : 'text-sm'
                        )}
                    >
                        {levelProgress.title}
                    </p>
                </div>
                <p
                    className={cn(
                        'text-slate-500',
                        compact ? 'text-xs' : 'text-sm'
                    )}
                >
                    {levelProgress.totalPoints} XP
                </p>
            </div>
            <div
                className={cn(
                    'overflow-hidden rounded-full bg-[#d7e7fc]',
                    compact ? 'h-2' : 'h-3'
                )}
            >
                <div
                    className="h-full rounded-full bg-[#4189dd] transition-all"
                    style={{ width: `${levelProgress.progressPercent}%` }}
                />
            </div>
            <p
                className={cn(
                    'text-slate-600',
                    compact ? 'text-xs' : 'text-sm'
                )}
            >
                {levelProgress.xpToNextLevel} XP to level{' '}
                {levelProgress.level + 1}
            </p>
        </div>
    )
}
