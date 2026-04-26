import type { SkillChallenge, SkillChallengeFile } from '@/data/course'

const WORD_CARD_MAX_WORDS = 3
const SOMALI_COURSE_ID = 'somali-from-english'

function countWords(value: string) {
    return value
        .trim()
        .split(/\s+/)
        .filter(Boolean).length
}

function shouldConvertCardToOptions(
    courseId: string,
    challenge: Extract<SkillChallenge, { type: 'cards' }>
) {
    return (
        courseId === SOMALI_COURSE_ID &&
        countWords(challenge.formInTargetLanguage) > WORD_CARD_MAX_WORDS
    )
}

function normalizeChallenge(courseId: string, challenge: SkillChallenge): SkillChallenge {
    if (
        challenge.type === 'cards' &&
        shouldConvertCardToOptions(courseId, challenge)
    ) {
        return {
            type: 'options',
            id: challenge.id,
            priority: challenge.priority,
            group: challenge.group,
            formInTargetLanguage: challenge.formInTargetLanguage,
            meaningInSourceLanguage: challenge.meaningInSourceLanguage,
        }
    }

    return challenge
}

export function normalizeChallengeFile(
    courseId: string,
    challengeFile: SkillChallengeFile
): SkillChallengeFile {
    return {
        ...challengeFile,
        challenges: challengeFile.challenges.map((challenge) =>
            normalizeChallenge(courseId, challenge)
        ),
    }
}
