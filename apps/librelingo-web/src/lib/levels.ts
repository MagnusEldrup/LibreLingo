const BASE_XP_PER_LEVEL = 360
const XP_STEP_PER_LEVEL = 180

export const MAX_AVATAR_LEVEL = 7
export const LEVEL_TITLES = [
    'Carruur',
    'Dhalinyaro',
    'Arday',
    'Macallin',
    'Madaxweyne',
    'Geesi',
    'Aqoonyahan',
] as const

export type LevelProgress = {
    totalPoints: number
    level: number
    title: string
    avatarLevel: number
    currentLevelStartXp: number
    nextLevelXp: number
    xpIntoLevel: number
    xpNeededForLevel: number
    xpToNextLevel: number
    progressPercent: number
    avatarSrc: string
}

export function getLevelStartXp(level: number) {
    if (level <= 1) {
        return 0
    }

    const completedLevels = level - 1

    return Math.floor(
        (completedLevels *
            (2 * BASE_XP_PER_LEVEL +
                (completedLevels - 1) * XP_STEP_PER_LEVEL)) /
            2
    )
}

export function getLevelProgress(totalPoints: number): LevelProgress {
    const safePoints = Math.max(0, Math.floor(totalPoints))
    let level = 1

    while (getLevelStartXp(level + 1) <= safePoints) {
        level += 1
    }

    const currentLevelStartXp = getLevelStartXp(level)
    const nextLevelXp = getLevelStartXp(level + 1)
    const xpNeededForLevel = nextLevelXp - currentLevelStartXp
    const xpIntoLevel = safePoints - currentLevelStartXp
    const xpToNextLevel = nextLevelXp - safePoints
    const avatarLevel = Math.min(level, MAX_AVATAR_LEVEL)

    return {
        totalPoints: safePoints,
        level,
        title:
            LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)],
        avatarLevel,
        currentLevelStartXp,
        nextLevelXp,
        xpIntoLevel,
        xpNeededForLevel,
        xpToNextLevel,
        progressPercent: Math.max(
            0,
            Math.min(100, Math.round((xpIntoLevel / xpNeededForLevel) * 100))
        ),
        avatarSrc: `/level-avatars/lvl${avatarLevel}.png`,
    }
}
