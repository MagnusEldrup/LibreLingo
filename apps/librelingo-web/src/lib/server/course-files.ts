import fs from 'node:fs/promises'
import path from 'node:path'
import type { SkillChallenge, SkillChallengeFile } from '@/data/course'
import { normalizeChallengeFile } from '@/lib/course-challenge-normalization'

function getCourseRoot(courseId: string) {
    return path.join(process.cwd(), 'src', 'courses', courseId)
}

function getChallengePath(courseId: string, practiceHref: string) {
    return path.join(getCourseRoot(courseId), 'challenges', `${practiceHref}.json`)
}

export async function loadCourseChallengeFile(
    courseId: string,
    practiceHref: string
): Promise<SkillChallengeFile> {
    const challengePath = getChallengePath(courseId, practiceHref)
    const rawContent = await fs.readFile(challengePath, 'utf8')

    return normalizeChallengeFile(
        courseId,
        JSON.parse(rawContent) as SkillChallengeFile
    )
}

export async function loadSkillChallenge(
    courseId: string,
    practiceHref: string,
    challengeId: string
): Promise<SkillChallenge | undefined> {
    const challengeFile = await loadCourseChallengeFile(courseId, practiceHref)

    return challengeFile.challenges.find((challenge) => challenge.id === challengeId)
}
