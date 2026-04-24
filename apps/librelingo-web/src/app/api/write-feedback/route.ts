import { NextResponse } from 'next/server'
import type { SkillChallenge, WriteFeedback, WritingRequirementCheck } from '@/data/course'
import {
    getOpenAIClient,
    WRITING_FEEDBACK_MODEL,
    WRITING_FEEDBACK_REASONING_EFFORT,
} from '@/lib/openai'
import { loadSkillChallenge } from '@/lib/server/course-files'

export const runtime = 'nodejs'

type WriteFeedbackRequest = {
    courseId: string
    practiceHref: string
    challengeId: string
    answer: string
    stage: 'draft' | 'final'
}

const requirementCheckSchema = {
    type: 'object',
    properties: {
        requirementId: {
            type: 'string',
        },
        label: {
            type: 'string',
        },
        status: {
            type: 'string',
            enum: ['met', 'partial', 'missing'],
        },
        feedback: {
            type: 'string',
        },
    },
    required: ['requirementId', 'label', 'status', 'feedback'],
    additionalProperties: false,
} as const

const draftFeedbackSchema = {
    type: 'object',
    properties: {
        score: {
            type: 'null',
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
        requirementChecks: {
            type: 'array',
            items: requirementCheckSchema,
        },
        suggestedAnswer: {
            type: 'string',
        },
    },
    required: [
        'score',
        'summary',
        'strengths',
        'improvements',
        'requirementChecks',
        'suggestedAnswer',
    ],
    additionalProperties: false,
} as const

const finalFeedbackSchema = {
    ...draftFeedbackSchema,
    properties: {
        ...draftFeedbackSchema.properties,
        score: {
            type: 'integer',
        },
    },
} as const

function isSafeIdentifier(value: string) {
    return /^[\dA-Za-z-]+$/.test(value)
}

function normalizeRequirementStatus(value: string) {
    if (value === 'met' || value === 'partial' || value === 'missing') {
        return value
    }

    return 'missing'
}

function normalizeRequirementChecks(
    challenge: Extract<SkillChallenge, { type: 'write' }>,
    requirementChecks: WritingRequirementCheck[]
) {
    return challenge.requirements.map((requirement) => {
        const matchingCheck = requirementChecks.find(
            (requirementCheck) =>
                requirementCheck.requirementId === requirement.id
        )

        return {
            requirementId: requirement.id,
            label: requirement.label,
            status: normalizeRequirementStatus(matchingCheck?.status ?? 'missing'),
            feedback: matchingCheck?.feedback?.trim()
                ? matchingCheck.feedback.trim()
                : `The draft still needs a clearer use of ${requirement.label.toLowerCase()}.`,
        } satisfies WritingRequirementCheck
    })
}

function normalizeFeedback(
    challenge: Extract<SkillChallenge, { type: 'write' }>,
    feedback: WriteFeedback,
    stage: 'draft' | 'final'
): WriteFeedback {
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
        .slice(0, 2)
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
        .slice(0, 3)

    return {
        score:
            stage === 'final'
                ? Math.min(5, Math.max(1, Math.round(feedback.score ?? 1)))
                : undefined,
        summary: feedback.summary.trim(),
        strengths,
        improvements,
        requirementChecks: normalizeRequirementChecks(
            challenge,
            feedback.requirementChecks
        ),
        suggestedAnswer: feedback.suggestedAnswer.trim(),
    }
}

function buildPrompt(
    challenge: Extract<SkillChallenge, { type: 'write' }>,
    answer: string,
    stage: 'draft' | 'final'
) {
    return [
        `Review stage: ${stage}`,
        `Instruction: ${challenge.instruction}`,
        'Prompt lines:',
        ...challenge.promptLines.map((line, index) => `${index + 1}. ${line}`),
        `Learner answer: ${answer}`,
        'Required targets:',
        ...challenge.requirements.map(
            (requirement, index) =>
                `${index + 1}. id=${requirement.id}; label=${requirement.label}; kind=${requirement.kind}; accepted forms=${requirement.expectedForms.join(' / ')}; note=${requirement.explanation}`
        ),
        'Grading notes:',
        ...challenge.gradingNotes.map((note, index) => `${index + 1}. ${note}`),
        challenge.sampleAnswer
            ? `Reference answer for internal comparison: ${challenge.sampleAnswer}`
            : 'Reference answer for internal comparison: none provided.',
        'Return a JSON object only.',
        'Write summary, strengths, improvements, and requirementChecks.feedback in English.',
        'Write suggestedAnswer in Somali.',
        'Return exactly one requirementChecks item for each requirement id.',
        'Each requirement check must keep the same requirementId and label from the prompt.',
        'Use status=met when the target is clearly present, partial when it is attempted but inaccurate, and missing when it is absent.',
        'Prioritize grammatical correctness and understandability over spelling perfection.',
        'Strengths rule: return at most 2 specific points.',
        'Improvements rule: return at most 3 concrete corrections.',
        'Do not invent problems just to fill the list.',
        'If a minor spelling issue does not block understanding, do not mention it in improvements and do not lower the score just for that.',
        'Treat errors in markers, sentence structure, agreement, tense, and meaning as more important than tiny spelling slips.',
        'When the main issue is a Somali pattern choice, explain the rule briefly in plain English instead of only giving a corrected sentence.',
        'If a contrast like `waan` versus `baan` is the real issue, mention that contrast directly and explain which structure fits the learner meaning.',
        'Prefer one high-impact grammar correction over multiple low-impact spelling notes.',
        stage === 'draft'
            ? 'Draft rule: score must be null.'
            : 'Final rule: score must be an integer from 1 to 5.',
        stage === 'draft'
            ? 'Draft scoring guidance: focus feedback on the most important grammar or requirement gaps first.'
            : 'Final scoring guide: use 4-5 when the answer is understandable and mostly grammatical, 3 when the meaning is clear but there is a notable grammar issue, and 1-2 only when the answer is hard to understand or misses the task.',
    ].join('\n')
}

export async function POST(request: Request) {
    let payload: WriteFeedbackRequest

    try {
        payload = (await request.json()) as WriteFeedbackRequest
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
    }

    const courseId = payload.courseId?.trim()
    const practiceHref = payload.practiceHref?.trim()
    const challengeId = payload.challengeId?.trim()
    const answer = payload.answer?.trim()
    const stage = payload.stage

    if (!courseId || !practiceHref || !challengeId || !answer || !stage) {
        return NextResponse.json(
            {
                error: 'courseId, practiceHref, challengeId, answer, and stage are required.',
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

    if (stage !== 'draft' && stage !== 'final') {
        return NextResponse.json({ error: 'Invalid review stage.' }, { status: 400 })
    }

    try {
        const challenge = await loadSkillChallenge(courseId, practiceHref, challengeId)

        if (!challenge || challenge.type !== 'write') {
            return NextResponse.json(
                { error: 'Structured writing challenge not found.' },
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
                'Review structured Somali writing tasks that have explicit vocabulary and grammar targets.',
                'Reward communicative success and correct use of current-course vocabulary.',
                'Focus on whether the Somali is grammatical and understandable, not on spelling perfection.',
                'Be lenient on punctuation, doubled letters, and minor spelling variation.',
                'Do not nitpick minor spelling if the intended Somali is still clear.',
                'Keep all feedback brief, practical, and encouraging.',
                'When a target is nearly right, mark it partial instead of missing.',
                'When a learner uses the wrong Somali structure, briefly explain the grammar pattern that should be used.',
                'Only mention real issues you can justify from the learner answer.',
            ].join(' '),
            input: buildPrompt(challenge, answer, stage),
            max_output_tokens: 500,
            text: {
                format: {
                    type: 'json_schema',
                    name: 'write_feedback',
                    strict: true,
                    schema: stage === 'draft' ? draftFeedbackSchema : finalFeedbackSchema,
                },
            },
        })

        if (
            response.status === 'incomplete' &&
            response.incomplete_details?.reason === 'max_output_tokens'
        ) {
            throw new Error('The writing feedback response was incomplete.')
        }

        if (response.output_text) {
            const parsedFeedback = JSON.parse(response.output_text) as WriteFeedback

            return NextResponse.json(
                normalizeFeedback(challenge, parsedFeedback, stage)
            )
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
                score: stage === 'final' ? 1 : undefined,
                summary: '',
                strengths: [],
                improvements: [],
                requirementChecks: [],
                suggestedAnswer: '',
                refusal: refusalContent.refusal,
            } satisfies WriteFeedback)
        }

        throw new Error('No response content was returned.')
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : 'Unable to review the writing response right now.'

        return NextResponse.json({ error: message }, { status: 500 })
    }
}
