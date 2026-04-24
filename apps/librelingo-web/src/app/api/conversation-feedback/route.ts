import { NextResponse } from 'next/server'
import type { ConversationTurnFeedback, SkillChallenge } from '@/data/course'
import {
    getOpenAIClient,
    WRITING_FEEDBACK_MODEL,
    WRITING_FEEDBACK_REASONING_EFFORT,
} from '@/lib/openai'
import { loadSkillChallenge } from '@/lib/server/course-files'

export const runtime = 'nodejs'

type ConversationFeedbackRequest = {
    courseId: string
    practiceHref: string
    challengeId: string
    turnId: string
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
        suggestedReply: {
            type: 'string',
        },
    },
    required: ['score', 'summary', 'strengths', 'improvements', 'suggestedReply'],
    additionalProperties: false,
} as const

function isSafeIdentifier(value: string) {
    return /^[\dA-Za-z-]+$/.test(value)
}

function normalizeFeedback(feedback: ConversationTurnFeedback) {
    const strengths = feedback.strengths
        .map((item) => item.trim())
        .filter(Boolean)
        .filter((item, index, items) => {
            const normalizedItem = item.toLowerCase()
            return (
                items.findIndex(
                    (candidate) => candidate.toLowerCase() === normalizedItem
                ) === index
            )
        })
        .slice(0, 1)
    const improvements = feedback.improvements
        .map((item) => item.trim())
        .filter(Boolean)
        .filter((item, index, items) => {
            const normalizedItem = item.toLowerCase()
            return (
                items.findIndex(
                    (candidate) => candidate.toLowerCase() === normalizedItem
                ) === index
            )
        })
        .slice(0, 2)

    return {
        score: Math.min(5, Math.max(1, Math.round(feedback.score))),
        summary: feedback.summary.trim(),
        strengths,
        improvements,
        suggestedReply: feedback.suggestedReply.trim(),
    } satisfies ConversationTurnFeedback
}

function buildPrompt(
    challenge: Extract<SkillChallenge, { type: 'conversation' }>,
    turn: Extract<SkillChallenge, { type: 'conversation' }>['turns'][number],
    answer: string
) {
    return [
        `Conversation instruction: ${challenge.instruction}`,
        `Partner message in Somali: ${turn.partnerMessage}`,
        `Meaning hint in English: ${turn.partnerMessageHint}`,
        `Learner should express this in English: ${turn.englishReplyPrompt}`,
        `Learner reply in Somali: ${answer}`,
        `Expected Somali replies: ${turn.expectedReplies.join(' | ')}`,
        turn.sampleReply
            ? `Reference Somali reply: ${turn.sampleReply}`
            : 'Reference Somali reply: none provided.',
        'Global grading notes:',
        ...challenge.gradingNotes.map((note, index) => `${index + 1}. ${note}`),
        'Return a JSON object only.',
        'Write summary, strengths, and improvements in English.',
        'Write suggestedReply in Somali.',
        'Reward communicative success more than perfect grammar.',
        'Be lenient with punctuation, spacing, and minor spelling variation.',
        'Strengths rule: return at most 1 specific point.',
        'Improvements rule: return 0-2 practical corrections only.',
        'Score rule: return an integer from 1 to 5.',
    ].join('\n')
}

export async function POST(request: Request) {
    let payload: ConversationFeedbackRequest

    try {
        payload = (await request.json()) as ConversationFeedbackRequest
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
    }

    const courseId = payload.courseId?.trim()
    const practiceHref = payload.practiceHref?.trim()
    const challengeId = payload.challengeId?.trim()
    const turnId = payload.turnId?.trim()
    const answer = payload.answer?.trim()

    if (!courseId || !practiceHref || !challengeId || !turnId || !answer) {
        return NextResponse.json(
            {
                error: 'courseId, practiceHref, challengeId, turnId, and answer are required.',
            },
            { status: 400 }
        )
    }

    if (
        !isSafeIdentifier(courseId) ||
        !isSafeIdentifier(practiceHref) ||
        !isSafeIdentifier(challengeId) ||
        !isSafeIdentifier(turnId)
    ) {
        return NextResponse.json(
            { error: 'Invalid challenge identifiers.' },
            { status: 400 }
        )
    }

    try {
        const challenge = await loadSkillChallenge(courseId, practiceHref, challengeId)

        if (!challenge || challenge.type !== 'conversation') {
            return NextResponse.json(
                { error: 'Conversation challenge not found.' },
                { status: 404 }
            )
        }

        const turn = challenge.turns.find((candidateTurn) => candidateTurn.id === turnId)

        if (!turn) {
            return NextResponse.json(
                { error: 'Conversation turn not found.' },
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
                'You are a warm Somali conversation tutor for beginners.',
                'Review one short Somali reply in context.',
                'Reward replies that fit the meaning and tone of the exchange.',
                'Be lenient on punctuation, doubled letters, and minor spelling variation.',
                'Keep all feedback brief, practical, and encouraging.',
                'If the learner reply is understandable, do not over-correct.',
            ].join(' '),
            input: buildPrompt(challenge, turn, answer),
            max_output_tokens: 300,
            text: {
                format: {
                    type: 'json_schema',
                    name: 'conversation_feedback',
                    strict: true,
                    schema: feedbackSchema,
                },
            },
        })

        if (
            response.status === 'incomplete' &&
            response.incomplete_details?.reason === 'max_output_tokens'
        ) {
            throw new Error('The conversation feedback response was incomplete.')
        }

        if (response.output_text) {
            const parsedFeedback = JSON.parse(
                response.output_text
            ) as ConversationTurnFeedback

            return NextResponse.json(normalizeFeedback(parsedFeedback))
        }

        const messageOutputs = response.output as Array<{
            type: string
            content?: Array<{
                type: string
                refusal?: string
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
                suggestedReply: '',
                refusal: refusalContent.refusal,
            } satisfies ConversationTurnFeedback)
        }

        throw new Error('No response content was returned.')
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : 'Unable to review the conversation response right now.'

        return NextResponse.json({ error: message }, { status: 500 })
    }
}
