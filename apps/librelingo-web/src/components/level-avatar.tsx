import Image from 'next/image'
import { getLevelProgress } from '@/lib/levels'
import { cn } from '@/lib/utils'

type Props = {
    totalPoints: number
    alt: string
    width: number
    height: number
    className?: string
    priority?: boolean
}

export default function LevelAvatar(props: Props) {
    const { totalPoints, alt, width, height, className, priority } = props
    const { avatarSrc, level } = getLevelProgress(totalPoints)

    return (
        <Image
            src={avatarSrc}
            alt={`${alt} for level ${level}`}
            width={width}
            height={height}
            className={cn('h-auto w-full object-contain', className)}
            priority={priority}
        />
    )
}
