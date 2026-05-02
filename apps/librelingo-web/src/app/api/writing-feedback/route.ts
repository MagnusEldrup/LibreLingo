import { NextResponse } from 'next/server'
import type { FreeWritingFeedback, SkillChallenge } from '@/data/course'
import { getOpenAIClient, WRITING_FEEDBACK_MODEL, WRITING_FEEDBACK_REASONING_EFFORT } from '@/lib/openai'
import { loadSkillChallenge } from '@/lib/server/course-files'

export const runtime = 'nodejs'

type WritingFeedbackRequest = {
    courseId: string
    practiceHref: string
    challengeId: string
    answer: string
}

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
        suggestedAnswer: {
            type: 'string',
        },
    },
    required: ['score', 'summary', 'strengths', 'improvements', 'suggestedAnswer'],
    additionalProperties: false,
} as const

const WRITING_FEEDBACK_MAX_OUTPUT_TOKENS = 450

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
    return normalizeForComparison(value)
        .split(' ')
        .filter(Boolean).length
}

function normalizeFeedback(feedback: FreeWritingFeedback): FreeWritingFeedback {
    const strengths = feedback.strengths
        .map((item) => item.trim())
        .filter(Boolean)
        .filter((item, index, items) => {
            const normalizedItem = item.toLowerCase()
            return items.findIndex((candidate) => candidate.toLowerCase() === normalizedItem) === index
        })
        .slice(0, 1)
    const improvements = feedback.improvements
        .map((item) => item.trim())
        .filter(Boolean)
        .filter((item, index, items) => {
            const normalizedItem = item.toLowerCase()
            return items.findIndex((candidate) => candidate.toLowerCase() === normalizedItem) === index
        })
        .slice(0, 2)

    return {
        score: Math.min(5, Math.max(1, Math.round(feedback.score))),
        summary: feedback.summary.trim(),
        strengths,
        improvements,
        suggestedAnswer: feedback.suggestedAnswer.trim(),
    }
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

function buildFallbackWritingFeedback(
    challenge: Extract<SkillChallenge, { type: 'freeWriting' }>,
    answer: string
): FreeWritingFeedback {
    const trimmedAnswer = answer.trim()
    const wordCount = countWords(trimmedAnswer)
    const summary =
        wordCount >= 6
            ? 'Your answer attempts the task, but it still needs a fuller grammar check.'
            : 'Your answer is a start, but it still needs more Somali to complete the task well.'
    const strengths =
        wordCount > 0
            ? ['You tried to answer in Somali instead of leaving the response blank.']
            : []
    const improvements = [
        challenge.gradingNotes[0]?.trim()
            ? `Check this lesson target again: ${challenge.gradingNotes[0].trim()}`
            : 'Check that your Somali answer covers each part of the prompt with complete phrases.',
        challenge.sampleAnswer
            ? 'Compare your sentence pattern to the suggested Somali answer and copy the key structure.'
            : 'Check the sentence structure and make sure the Somali is grammatical and understandable.',
    ].filter(Boolean)

    return normalizeFeedback({
        score: wordCount >= 8 ? 3 : wordCount >= 3 ? 2 : 1,
        summary,
        strengths,
        improvements,
        suggestedAnswer: trimmedAnswer || challenge.sampleAnswer?.trim() || '',
    })
}

async function requestWritingFeedback(
    client: Awaited<ReturnType<typeof getOpenAIClient>>,
    challenge: Extract<SkillChallenge, { type: 'freeWriting' }>,
    answer: string
): Promise<
    | { feedback: FreeWritingFeedback }
    | { refusal: string }
> {
    try {
        const response = await client.responses.create({
            model: WRITING_FEEDBACK_MODEL,
            reasoning: {
                effort: WRITING_FEEDBACK_REASONING_EFFORT,
            },
            store: false,
            instructions: [
                'You are a warm Somali writing tutor for beginners.',
                'Grade beginner Somali writing on a 1-5 scale.',
                'Use the task only as context for what the learner was trying to express.',
                'Base the review on the learner answer, not on a new answer you invent.',
                'Your suggestedAnswer must be a grammatically corrected version of the learner answer.',
                'Preserve the learner answer sentence by sentence: do not skip a sentence, drop an idea, or replace it with the reference answer.',
                'Reward communicative success and correct use of current-module vocabulary.',
                'Focus on grammatical and understandable Somali, not spelling perfection.',
                'Be lenient on punctuation, doubled letters, and minor spelling variation.',
                'Do not nitpick minor spelling if the intended Somali is still clear.',
                'When a learner uses the wrong Somali structure, briefly explain the grammar pattern that should be used.',
                'Keep all feedback brief, practical, and encouraging.',
                'Only mention real issues you can justify from the learner answer.',
                'Tie every improvement to a specific word, phrase, sentence, or omitted target in the learner answer.',
                'Keep summary to one short sentence.',
                'Return at most 1 strength and at most 2 improvements.',
                'Keep each strength or improvement to one short sentence.',
            ].join(' '),
            input: buildPrompt(challenge, answer),
            max_output_tokens: WRITING_FEEDBACK_MAX_OUTPUT_TOKENS,
            text: {
                format: {
                    type: 'json_schema',
                    name: 'writing_feedback',
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
            try {
                return {
                    feedback: JSON.parse(response.output_text) as FreeWritingFeedback,
                }
            } catch {
                return {
                    feedback: buildFallbackWritingFeedback(challenge, answer),
                }
            }
        }

        return {
            feedback: buildFallbackWritingFeedback(challenge, answer),
        }
    } catch {
        return {
            feedback: buildFallbackWritingFeedback(challenge, answer),
        }
    }
}

function buildPrompt(
    challenge: Extract<SkillChallenge, { type: 'freeWriting' }>,
    answer: string
) {
    return [
        `Challenge kind: ${challenge.promptKind}`,
        `Instruction: ${challenge.instruction}`,
        'Prompt lines:',
        ...challenge.promptLines.map((line, index) => `${index + 1}. ${line}`),
        `Learner answer: ${answer}`,
        'Grading notes:',
        ...challenge.gradingNotes.map((note, index) => `${index + 1}. ${note}`),
        challenge.sampleAnswer
            ? `Reference answer for internal comparison: ${challenge.sampleAnswer}`
            : 'Reference answer for internal comparison: none provided.',
        'Return a JSON object only.',
        'Write summary, strengths, and improvements in English.',
        'Write suggestedAnswer in Somali as a corrected version of what the learner actually wrote.',
        'SuggestedAnswer rule: preserve every distinct idea and sentence from the learner answer unless a sentence must be split or merged for Somali grammar.',
        'SuggestedAnswer rule: do not use the reference answer as the suggestedAnswer unless it truly matches the learner answer content.',
        'SuggestedAnswer rule: if the learner wrote two sentences, correct both sentences; do not return only the first one.',
        'Prioritize grammatical correctness and understandability over spelling perfection.',
        'Strengths rule: return at most 1 specific, non-redundant point.',
        'Improvements rule: return 0-2 targeted corrections only.',
        'Each improvement must point to a concrete word, phrase, or structure in the learner answer and say what to change.',
        'Do not give unrelated advice or feedback on a sentence the learner did not attempt.',
        'Do not invent weaknesses just to fill the field.',
        'If the answer is already very good, improvements may be an empty array or one tiny polish point.',
        'Avoid generic praise like repeating that the answer was clear in multiple ways.',
        'Prefer corrections like "use X instead of Y" over abstract advice.',
        'If a minor spelling issue does not block understanding, do not mention it in improvements and do not lower the score just for that.',
        'Treat errors in markers, sentence structure, agreement, tense, and meaning as more important than tiny spelling slips.',
        'When the main issue is a Somali pattern choice, explain the rule briefly in plain English instead of only giving a corrected sentence.',
        'If a contrast like `waan` versus `baan` is the real issue, mention that contrast directly and explain which structure fits the learner meaning.',
        'Prefer one high-impact grammar correction over multiple low-impact spelling notes.',
        'Scoring guide: use 4-5 when the answer is understandable and mostly grammatical, 3 when the meaning is clear but there is a notable grammar issue, and 1-2 only when the answer is hard to understand or misses the task.',
    ].join('\n')
}

export async function POST(request: Request) {
    let payload: WritingFeedbackRequest

    try {
        payload = (await request.json()) as WritingFeedbackRequest
    } catch {
        return NextResponse.json(
            { error: 'Invalid JSON body.' },
            { status: 400 }
        )
    }

    const courseId = payload.courseId?.trim()
    const practiceHref = payload.practiceHref?.trim()
    const challengeId = payload.challengeId?.trim()
    const answer = payload.answer?.trim()

    if (!courseId || !practiceHref || !challengeId || !answer) {
        return NextResponse.json(
            { error: 'courseId, practiceHref, challengeId, and answer are required.' },
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

    try {
        const challenge = await loadSkillChallenge(courseId, practiceHref, challengeId)

        if (!challenge || challenge.type !== 'freeWriting') {
            return NextResponse.json(
                { error: 'Free writing challenge not found.' },
                { status: 404 }
            )
        }

        const client = await getOpenAIClient()
        const result = await requestWritingFeedback(client, challenge, answer)

        if ('refusal' in result) {
            return NextResponse.json({
                score: 1,
                summary: '',
                strengths: [],
                improvements: [],
                suggestedAnswer: '',
                refusal: result.refusal,
            } satisfies FreeWritingFeedback)
        }

        if (!('feedback' in result)) {
            throw new Error('Writing feedback was not returned.')
        }

        return NextResponse.json(normalizeFeedback(result.feedback))
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : 'Unable to grade the writing response right now.'

        return NextResponse.json(
            { error: message },
            { status: 500 }
        )
    }
}
