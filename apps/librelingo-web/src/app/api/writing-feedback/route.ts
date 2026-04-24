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

function isSafeIdentifier(value: string) {
    return /^[\dA-Za-z-]+$/.test(value)
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
        'Write suggestedAnswer in Somali.',
        'Prioritize grammatical correctness and understandability over spelling perfection.',
        'Strengths rule: return at most 1 specific, non-redundant point.',
        'Improvements rule: return 0-2 targeted corrections only.',
        'Each improvement must point to a concrete word, phrase, or structure in the learner answer and say what to change.',
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
        const response = await client.responses.create({
            model: WRITING_FEEDBACK_MODEL,
            reasoning: {
                effort: WRITING_FEEDBACK_REASONING_EFFORT,
            },
            store: false,
            instructions: [
                'You are a warm Somali writing tutor for beginners.',
                'Grade beginner Somali writing on a 1-5 scale.',
                'Reward communicative success and correct use of current-module vocabulary.',
                'Focus on whether the Somali is grammatical and understandable, not on spelling perfection.',
                'Be lenient on punctuation, doubled letters, and minor spelling variation.',
                'Do not nitpick minor spelling if the intended Somali is still clear.',
                'Do not punish beginner grammar too harshly if meaning is clear.',
                'When a learner uses the wrong Somali structure, briefly explain the grammar pattern that should be used.',
                'Keep all feedback brief, practical, and encouraging.',
                'Only mention real issues you can justify from the learner answer.',
                'When giving corrections, be concrete and phrase-level.',
            ].join(' '),
            input: buildPrompt(challenge, answer),
            max_output_tokens: 300,
            text: {
                format: {
                    type: 'json_schema',
                    name: 'writing_feedback',
                    strict: true,
                    schema: feedbackSchema,
                },
            },
        })

        if (
            response.status === 'incomplete' &&
            response.incomplete_details?.reason === 'max_output_tokens'
        ) {
            throw new Error('The feedback response was incomplete.')
        }

        if (response.output_text) {
            const parsedFeedback = JSON.parse(response.output_text) as FreeWritingFeedback

            return NextResponse.json(normalizeFeedback(parsedFeedback))
        }

        const messageOutputs = response.output as Array<{
            type: string
            content?: Array<{
                type: string
                refusal?: string
                text?: string
            }>
        }>
        const refusalContent = messageOutputs
            .filter((item) => item.type === 'message')
            .flatMap((item) => item.content ?? [])
            .find((item) => item.type === 'refusal')

        if (refusalContent) {
            return NextResponse.json({
                score: 1,
                summary: '',
                strengths: [],
                improvements: [],
                suggestedAnswer: '',
                refusal: refusalContent.refusal,
            } satisfies FreeWritingFeedback)
        }
        
        throw new Error('No response content was returned.')
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
