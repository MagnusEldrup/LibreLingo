export type StoredSkillProgress = {
    courseId: string
    practiceHref: string
    skillTitle: string
    moduleTitle: string
    totalChallengesCompleted: number
    totalAttempts: number
    totalSolved: number
    firstTrySolved: number
    totalPoints: number
    completedRuns: number
    bestRunScore: number
    lastRunScore: number
    bestAccuracy: number
    lastAccuracy: number
    bestStreak: number
    lastPlayedAt: string
}

type CourseDailyActivity = {
    challengeCountsByDate: Record<string, number>
}

type ProgressStore = {
    skills: Record<string, StoredSkillProgress>
    dailyActivityByCourse: Record<string, CourseDailyActivity>
}

export type CourseProgressSummary = {
    totalSkillsTracked: number
    completedSkills: number
    totalPoints: number
    totalChallengesCompleted: number
    overallAccuracy: number
    bestStreak: number
    completedRuns: number
    currentDailyStreak: number
    bestDailyStreak: number
    todayCompletedChallenges: number
    dailyGoal: number
    todayGoalReached: boolean
    lastPlayedAt?: string
}

const STORAGE_KEY = 'learnsomali-progress-v1'
const PROGRESS_EVENT_NAME = 'learnsomali-progress-updated'
const DAILY_STREAK_GOAL = 2

function getSkillKey(courseId: string, practiceHref: string) {
    return `${courseId}::${practiceHref}`
}

function createEmptyCourseSummary(): CourseProgressSummary {
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
        dailyGoal: DAILY_STREAK_GOAL,
        todayGoalReached: false,
    }
}

function isBrowser() {
    return typeof window !== 'undefined'
}

function createEmptyStore(): ProgressStore {
    return {
        skills: {},
        dailyActivityByCourse: {},
    }
}

export function readProgressStore(): ProgressStore {
    if (!isBrowser()) {
        return createEmptyStore()
    }

    const rawValue = window.localStorage.getItem(STORAGE_KEY)

    if (!rawValue) {
        return createEmptyStore()
    }

    try {
        return normalizeProgressStore(JSON.parse(rawValue))
    } catch {
        return createEmptyStore()
    }
}

function writeProgressStore(store: ProgressStore) {
    if (!isBrowser()) {
        return
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
    window.dispatchEvent(new CustomEvent(PROGRESS_EVENT_NAME))
}

export function getProgressEventName() {
    return PROGRESS_EVENT_NAME
}

export function getSkillProgress(courseId: string, practiceHref: string) {
    const store = readProgressStore()
    return store.skills[getSkillKey(courseId, practiceHref)]
}

export function saveSkillProgress(
    progress: StoredSkillProgress,
    options?: {
        recordExerciseCompletion?: boolean
        completedAt?: Date
    }
) {
    const store = readProgressStore()
    store.skills[getSkillKey(progress.courseId, progress.practiceHref)] = progress

    if (options?.recordExerciseCompletion) {
        const dateKey = getLocalDateKey(options.completedAt ?? new Date())
        const courseActivity = getOrCreateCourseDailyActivity(store, progress.courseId)

        courseActivity.challengeCountsByDate[dateKey] =
            (courseActivity.challengeCountsByDate[dateKey] ?? 0) + 1
    }

    writeProgressStore(store)
}

export function summarizeCourseProgress(
    courseId: string,
    practiceHrefs: string[]
): CourseProgressSummary {
    const store = readProgressStore()
    const trackedSkills = practiceHrefs
        .map((practiceHref) => store.skills[getSkillKey(courseId, practiceHref)])
        .filter((progress): progress is StoredSkillProgress => progress !== undefined)

    return summarizeTrackedSkills(store, courseId, trackedSkills)
}

export function summarizeStoredCourseProgress(
    courseId: string
): CourseProgressSummary {
    const store = readProgressStore()
    const trackedSkills = Object.values(store.skills).filter(
        (progress) => progress.courseId === courseId
    )

    return summarizeTrackedSkills(store, courseId, trackedSkills)
}

function summarizeTrackedSkills(
    store: ProgressStore,
    courseId: string,
    trackedSkills: StoredSkillProgress[]
): CourseProgressSummary {
    const dailySummary = summarizeCourseDailyActivity(store, courseId)

    if (trackedSkills.length === 0) {
        return {
            ...createEmptyCourseSummary(),
            ...dailySummary,
        }
    }

    let totalChallengesCompleted = 0
    let firstTrySolved = 0
    let totalPoints = 0
    let bestStreak = 0
    let completedRuns = 0

    for (const progress of trackedSkills) {
        totalChallengesCompleted += progress.totalChallengesCompleted
        firstTrySolved += progress.firstTrySolved
        totalPoints += progress.totalPoints
        completedRuns += progress.completedRuns
        bestStreak = Math.max(bestStreak, progress.bestStreak)
    }

    const latestPlayedAt = trackedSkills
        .map((progress) => progress.lastPlayedAt)
        .sort()
        .at(-1)

    return {
        totalSkillsTracked: trackedSkills.length,
        completedSkills: trackedSkills.filter((progress) => progress.completedRuns > 0)
            .length,
        totalPoints,
        totalChallengesCompleted,
        overallAccuracy:
            totalChallengesCompleted === 0
                ? 0
                : Math.round((firstTrySolved / totalChallengesCompleted) * 100),
        bestStreak,
        completedRuns,
        lastPlayedAt: latestPlayedAt,
        ...dailySummary,
    }
}

function normalizeProgressStore(value: unknown): ProgressStore {
    if (!value || typeof value !== 'object') {
        return createEmptyStore()
    }

    const candidate = value as Partial<ProgressStore>

    return {
        skills:
            candidate.skills && typeof candidate.skills === 'object'
                ? candidate.skills
                : {},
        dailyActivityByCourse: normalizeDailyActivityByCourse(
            candidate.dailyActivityByCourse
        ),
    }
}

function normalizeDailyActivityByCourse(
    value: ProgressStore['dailyActivityByCourse'] | undefined
) {
    if (!value || typeof value !== 'object') {
        return {}
    }

    return Object.fromEntries(
        Object.entries(value).map(([courseId, activity]) => [
            courseId,
            {
                challengeCountsByDate:
                    activity?.challengeCountsByDate &&
                    typeof activity.challengeCountsByDate === 'object'
                        ? activity.challengeCountsByDate
                        : {},
            },
        ])
    )
}

function getOrCreateCourseDailyActivity(store: ProgressStore, courseId: string) {
    const existingActivity = store.dailyActivityByCourse[courseId]

    if (existingActivity) {
        return existingActivity
    }

    const emptyActivity: CourseDailyActivity = {
        challengeCountsByDate: {},
    }
    store.dailyActivityByCourse[courseId] = emptyActivity
    return emptyActivity
}

function getLocalDateKey(date: Date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function getDateFromKey(dateKey: string) {
    const [year, month, day] = dateKey.split('-').map(Number)

    return new Date(year, (month ?? 1) - 1, day ?? 1)
}

function addDays(date: Date, days: number) {
    const nextDate = new Date(date)
    nextDate.setDate(nextDate.getDate() + days)
    return nextDate
}

function getQualifiedChallengeCount(count: number | undefined) {
    return (count ?? 0) >= DAILY_STREAK_GOAL
}

function calculateCurrentDailyStreak(
    challengeCountsByDate: Record<string, number>,
    referenceDate: Date
) {
    const today = new Date(
        referenceDate.getFullYear(),
        referenceDate.getMonth(),
        referenceDate.getDate()
    )
    const todayKey = getLocalDateKey(today)
    const yesterday = addDays(today, -1)
    const yesterdayKey = getLocalDateKey(yesterday)

    let cursor =
        getQualifiedChallengeCount(challengeCountsByDate[todayKey])
            ? today
            : (getQualifiedChallengeCount(challengeCountsByDate[yesterdayKey])
                  ? yesterday
                  : undefined)

    if (!cursor) {
        return 0
    }

    let streak = 0

    while (
        getQualifiedChallengeCount(
            challengeCountsByDate[getLocalDateKey(cursor)]
        )
    ) {
        streak += 1
        cursor = addDays(cursor, -1)
    }

    return streak
}

function calculateBestDailyStreak(challengeCountsByDate: Record<string, number>) {
    const qualifiedDates = Object.entries(challengeCountsByDate)
        .filter(([, count]) => getQualifiedChallengeCount(count))
        .map(([dateKey]) => dateKey)
        .sort()

    let bestStreak = 0
    let currentStreak = 0
    let previousDate: Date | undefined

    for (const dateKey of qualifiedDates) {
        const currentDate = getDateFromKey(dateKey)

        if (previousDate) {
            const expectedNextDateKey = getLocalDateKey(addDays(previousDate, 1))
            currentStreak =
                expectedNextDateKey === dateKey ? currentStreak + 1 : 1
        } else {
            currentStreak = 1
        }

        bestStreak = Math.max(bestStreak, currentStreak)
        previousDate = currentDate
    }

    return bestStreak
}

function summarizeCourseDailyActivity(
    store: ProgressStore,
    courseId: string
): Pick<
    CourseProgressSummary,
    | 'currentDailyStreak'
    | 'bestDailyStreak'
    | 'todayCompletedChallenges'
    | 'dailyGoal'
    | 'todayGoalReached'
> {
    const challengeCountsByDate =
        store.dailyActivityByCourse[courseId]?.challengeCountsByDate ?? {}
    const todayKey = getLocalDateKey(new Date())
    const todayCompletedChallenges = challengeCountsByDate[todayKey] ?? 0

    return {
        currentDailyStreak: calculateCurrentDailyStreak(
            challengeCountsByDate,
            new Date()
        ),
        bestDailyStreak: calculateBestDailyStreak(challengeCountsByDate),
        todayCompletedChallenges,
        dailyGoal: DAILY_STREAK_GOAL,
        todayGoalReached: todayCompletedChallenges >= DAILY_STREAK_GOAL,
    }
}
