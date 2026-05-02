import { NextResponse } from 'next/server'
import type {
    SkillChallenge,
    YourLifeFeedback,
    YourLifeFragment,
    YourLifeScaffold,
} from '@/data/course'
import {
    getOpenAIClient,
    WRITING_FEEDBACK_MODEL,
    WRITING_FEEDBACK_REASONING_EFFORT,
} from '@/lib/openai'
import { loadSkillChallenge } from '@/lib/server/course-files'

export const runtime = 'nodejs'

type YourLifeFeedbackRequest = {
    courseId: string
    practiceHref: string
    challengeId: string
    stage: 'scaffold' | 'feedback'
    englishAnswer: string
    somaliAnswer?: string
}

const fragmentSchema = {
    type: 'object',
    properties: {
        somali: {
            type: 'string',
        },
        english: {
            type: 'string',
        },
        note: {
            type: 'string',
        },
    },
    required: ['somali', 'english', 'note'],
    additionalProperties: false,
} as const

const scaffoldSchema = {
    type: 'object',
    properties: {
        summary: {
            type: 'string',
        },
        fragments: {
            type: 'array',
            items: fragmentSchema,
        },
        starterFrames: {
            type: 'array',
            items: {
                type: 'string',
            },
        },
    },
    required: ['summary', 'fragments', 'starterFrames'],
    additionalProperties: false,
} as const

const feedbackSchema = {
    type: 'object',
    properties: {
        score: {
            type: 'integer',
        },
        summary: {
            type: 'string',
        },
        strengths: {
            type: 'array',
            items: {
                type: 'string',
            },
        },
        improvements: {
            type: 'array',
            items: {
                type: 'string',
            },
        },
        hints: {
            type: 'array',
            items: {
                type: 'string',
            },
        },
        correctedVersion: {
            type: 'string',
        },
    },
    required: [
        'score',
        'summary',
        'strengths',
        'improvements',
        'hints',
        'correctedVersion',
    ],
    additionalProperties: false,
} as const

const YOUR_LIFE_MAX_OUTPUT_TOKENS = 900

function isSafeIdentifier(value: string) {
    return /^[\dA-Za-z-]+$/.test(value)
}

function normalizeForComparison(value: string) {
    return value
        .toLowerCase()
        .replace(/[`'".,!?;:()[\]{}]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function countWords(value: string) {
    return normalizeForComparison(value).split(' ').filter(Boolean).length
}

function normalizeFragments(fragments: YourLifeFragment[]) {
    return fragments
        .map((fragment) => ({
            somali: fragment.somali.trim(),
            english: fragment.english.trim(),
            note: fragment.note.trim(),
        }))
        .filter((fragment) => fragment.somali && fragment.english)
        .slice(0, 14)
}

function normalizeScaffold(scaffold: YourLifeScaffold): YourLifeScaffold {
    return {
        summary: scaffold.summary.trim(),
        fragments: normalizeFragments(scaffold.fragments),
        starterFrames: scaffold.starterFrames
            .map((frame) => frame.trim())
            .filter(Boolean)
            .slice(0, 6),
    }
}

function normalizeFeedback(feedback: YourLifeFeedback): YourLifeFeedback {
    const score = Math.min(5, Math.max(1, Math.round(feedback.score)))

    return {
        score,
        summary: feedback.summary.trim(),
        strengths: feedback.strengths
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, 1),
        improvements: feedback.improvements
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, 2),
        hints:
            score >= 4
                ? []
                : feedback.hints
                      .map((item) => item.trim())
                      .filter(Boolean)
                      .slice(0, 4),
        correctedVersion: feedback.correctedVersion.trim(),
    }
}

function buildFallbackScaffold(
    challenge: Extract<SkillChallenge, { type: 'yourLife' }>,
    englishAnswer: string
): YourLifeScaffold {
    return normalizeScaffold({
        summary:
            countWords(englishAnswer) > 0
                ? 'Use these simple Somali pieces to turn your English notes into short beginner sentences.'
                : 'Start with a few true English sentences, then use these Somali pieces.',
        fragments: challenge.starterFragments,
        starterFrames: [
            'Maanta ...',
            'Waan ...',
            'Waxaan rabaa ...',
            'Somali baan ...',
        ],
    })
}

function buildFallbackFeedback(
    challenge: Extract<SkillChallenge, { type: 'yourLife' }>,
    somaliAnswer: string
): YourLifeFeedback {
    const wordCount = countWords(somaliAnswer)
    const score = wordCount >= 28 ? 3 : wordCount >= 14 ? 2 : 1

    return normalizeFeedback({
        score,
        summary:
            score >= 3
                ? 'Your Somali draft has a useful start, but it needs one more careful revision.'
                : 'Your Somali draft needs more simple complete sentences.',
        strengths:
            wordCount > 0
                ? ['You started turning your real-life notes into Somali.']
                : [],
        improvements: [
            'Use short beginner sentences with one idea in each sentence.',
            'Reuse more of the fragments from the hint box.',
        ],
        hints: challenge.starterFragments
            .slice(0, 4)
            .map(
                (fragment) =>
                    `Try adding ${fragment.somali} for "${fragment.english}".`
            ),
        correctedVersion: somaliAnswer.trim(),
    })
}

function extractRefusal(response: {
    output?: Array<{
        type: string
        content?: Array<{
            type: string
            refusal?: string
        }>
    }>
}) {
    return response.output
        ?.filter((item) => item.type === 'message')
        .flatMap((item) => item.content ?? [])
        .find((item) => item.type === 'refusal')
}

function buildScaffoldPrompt(
    challenge: Extract<SkillChallenge, { type: 'yourLife' }>,
    englishAnswer: string
) {
    return [
        `Instruction: ${challenge.instruction}`,
        'Learner English life notes:',
        englishAnswer,
        'Scaffold notes:',
        ...challenge.scaffoldNotes.map(
            (note, index) => `${index + 1}. ${note}`
        ),
        'Available starter fragments:',
        ...challenge.starterFragments.map(
            (fragment, index) =>
                `${index + 1}. ${fragment.somali} = ${fragment.english}; note=${fragment.note}`
        ),
        'Return a JSON object only.',
        'Give the learner Somali words and phrase fragments that get them about 50% of the way to a very simple Somali description.',
        'Do not translate the whole English text into complete Somali paragraphs.',
        'Prefer reusable beginner pieces over full polished sentences.',
        'Include 8-14 fragments and 3-6 starterFrames.',
        'Base the fragments on the learner English notes when possible.',
        'Keep every note short and practical.',
    ].join('\n')
}

function buildFeedbackPrompt(
    challenge: Extract<SkillChallenge, { type: 'yourLife' }>,
    englishAnswer: string,
    somaliAnswer: string
) {
    return [
        `Instruction: ${challenge.instruction}`,
        'Learner English life notes:',
        englishAnswer,
        'Learner Somali draft:',
        somaliAnswer,
        'Grading notes:',
        ...challenge.gradingNotes.map((note, index) => `${index + 1}. ${note}`),
        'Return a JSON object only.',
        'Score from 1 to 5.',
        'Use 4-5 only when the Somali draft is understandable, simple, and covers most of the learner English notes.',
        'Use 1-3 when the learner should revise before completing the lesson.',
        'Every improvement must refer to a specific word, phrase, sentence, or missing idea in the learner Somali draft.',
        'If score is below 4, include concrete extra hints that help the learner revise.',
        'If score is 4 or 5, hints must be an empty array.',
        'Write correctedVersion in Somali as a corrected version of what the learner wrote.',
        'Preserve the learner ideas; do not replace them with unrelated sample content.',
        'Keep summary, strengths, improvements, and hints in English.',
    ].join('\n')
}

async function requestScaffold(
    client: Awaited<ReturnType<typeof getOpenAIClient>>,
    challenge: Extract<SkillChallenge, { type: 'yourLife' }>,
    englishAnswer: string
): Promise<{ scaffold: YourLifeScaffold } | { refusal: string }> {
    try {
        const response = await client.responses.create({
            model: WRITING_FEEDBACK_MODEL,
            reasoning: {
                effort: WRITING_FEEDBACK_REASONING_EFFORT,
            },
            store: false,
            instructions: [
                'You are a warm Somali tutor for beginners.',
                'You help learners write about their real life in very simple Somali.',
                'First read their English notes to understand what they actually want to say.',
                'Then provide useful Somali words and phrase fragments, not a full translation.',
                'Keep the help practical, concrete, and beginner-friendly.',
            ].join(' '),
            input: buildScaffoldPrompt(challenge, englishAnswer),
            max_output_tokens: YOUR_LIFE_MAX_OUTPUT_TOKENS,
            text: {
                format: {
                    type: 'json_schema',
                    name: 'your_life_scaffold',
                    strict: true,
                    schema: scaffoldSchema,
                },
            },
        })

        const refusalContent = extractRefusal(response)

        if (refusalContent?.refusal) {
            return { refusal: refusalContent.refusal }
        }

        if (response.output_text) {
            return {
                scaffold: normalizeScaffold(
                    JSON.parse(response.output_text) as YourLifeScaffold
                ),
            }
        }
    } catch {
        return {
            scaffold: buildFallbackScaffold(challenge, englishAnswer),
        }
    }

    return {
        scaffold: buildFallbackScaffold(challenge, englishAnswer),
    }
}

async function requestFeedback(
    client: Awaited<ReturnType<typeof getOpenAIClient>>,
    challenge: Extract<SkillChallenge, { type: 'yourLife' }>,
    englishAnswer: string,
    somaliAnswer: string
): Promise<{ feedback: YourLifeFeedback } | { refusal: string }> {
    try {
        const response = await client.responses.create({
            model: WRITING_FEEDBACK_MODEL,
            reasoning: {
                effort: WRITING_FEEDBACK_REASONING_EFFORT,
            },
            store: false,
            instructions: [
                'You are a warm Somali writing tutor for beginners.',
                'Review the learner Somali draft against the learner English life notes.',
                'Reward simple, understandable Somali that preserves the learner actual meaning.',
                'Focus on grammar, word order, and meaning more than tiny spelling issues.',
                'When the score is below 4, give extra hints and invite revision.',
                'Only mention real issues you can justify from the learner draft.',
            ].join(' '),
            input: buildFeedbackPrompt(challenge, englishAnswer, somaliAnswer),
            max_output_tokens: YOUR_LIFE_MAX_OUTPUT_TOKENS,
            text: {
                format: {
                    type: 'json_schema',
                    name: 'your_life_feedback',
                    strict: true,
                    schema: feedbackSchema,
                },
            },
        })

        const refusalContent = extractRefusal(response)

        if (refusalContent?.refusal) {
            return { refusal: refusalContent.refusal }
        }

        if (response.output_text) {
            return {
                feedback: normalizeFeedback(
                    JSON.parse(response.output_text) as YourLifeFeedback
                ),
            }
        }
    } catch {
        return {
            feedback: buildFallbackFeedback(challenge, somaliAnswer),
        }
    }

    return {
        feedback: buildFallbackFeedback(challenge, somaliAnswer),
    }
}

export async function POST(request: Request) {
    let payload: YourLifeFeedbackRequest

    try {
        payload = (await request.json()) as YourLifeFeedbackRequest
    } catch {
        return NextResponse.json(
            { error: 'Invalid JSON body.' },
            { status: 400 }
        )
    }

    const courseId = payload.courseId?.trim()
    const practiceHref = payload.practiceHref?.trim()
    const challengeId = payload.challengeId?.trim()
    const englishAnswer = payload.englishAnswer?.trim()
    const somaliAnswer = payload.somaliAnswer?.trim()

    if (!courseId || !practiceHref || !challengeId || !englishAnswer) {
        return NextResponse.json(
            {
                error: 'courseId, practiceHref, challengeId, and englishAnswer are required.',
            },
            { status: 400 }
        )
    }

    if (
        !isSafeIdentifier(courseId) ||
        !isSafeIdentifier(practiceHref) ||
        !isSafeIdentifier(challengeId)
    ) {
        return NextResponse.json(
            { error: 'Invalid challenge identifiers.' },
            { status: 400 }
        )
    }

    if (payload.stage !== 'scaffold' && payload.stage !== 'feedback') {
        return NextResponse.json(
            { error: 'Invalid feedback stage.' },
            { status: 400 }
        )
    }

    if (payload.stage === 'feedback' && !somaliAnswer) {
        return NextResponse.json(
            { error: 'somaliAnswer is required for feedback.' },
            { status: 400 }
        )
    }

    try {
        const challenge = await loadSkillChallenge(
            courseId,
            practiceHref,
            challengeId
        )

        if (!challenge || challenge.type !== 'yourLife') {
            return NextResponse.json(
                { error: 'Your Life challenge not found.' },
                { status: 404 }
            )
        }

        const client = await getOpenAIClient()
        const result =
            payload.stage === 'scaffold'
                ? await requestScaffold(client, challenge, englishAnswer)
                : await requestFeedback(
                      client,
                      challenge,
                      englishAnswer,
                      somaliAnswer ?? ''
                  )

        if ('refusal' in result) {
            return NextResponse.json({ refusal: result.refusal })
        }

        return NextResponse.json(result)
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : 'Unable to review this Your Life response right now.'

        return NextResponse.json({ error: message }, { status: 500 })
    }
}
