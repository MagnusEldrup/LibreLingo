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

type ModelWritingRequirementCheck = Omit<WritingRequirementCheck, 'label'>
type ModelWriteFeedback = Omit<WriteFeedback, 'requirementChecks'> & {
    requirementChecks: ModelWritingRequirementCheck[]
}

const requirementCheckSchema = {
    type: 'object',
    properties: {
        requirementId: {
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
    required: ['requirementId', 'status', 'feedback'],
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

const STRUCTURED_WRITE_FEEDBACK_MAX_OUTPUT_TOKENS = 900

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

function tokenize(value: string) {
    return normalizeForComparison(value)
        .split(' ')
        .filter(Boolean)
}

function normalizeRequirementStatus(value: string) {
    if (value === 'met' || value === 'partial' || value === 'missing') {
        return value
    }

    return 'missing'
}

function normalizeRequirementChecks(
    challenge: Extract<SkillChallenge, { type: 'write' }>,
    requirementChecks: ModelWritingRequirementCheck[]
) {
    return challenge.requirements.map((requirement) => {
        const matchingCheck = requirementChecks.find(
            (requirementCheck) => requirementCheck.requirementId === requirement.id
        )

        return {
            requirementId: requirement.id,
            label: requirement.label,
            status: normalizeRequirementStatus(matchingCheck?.status ?? 'missing'),
            feedback: matchingCheck?.feedback?.trim()
                ? matchingCheck.feedback.trim()
                : `Use ${requirement.label.toLowerCase()} more clearly. ${requirement.explanation}`,
        } satisfies WritingRequirementCheck
    })
}

function detectRequirementStatus(
    normalizedAnswer: string,
    answerTokens: string[],
    expectedForms: string[]
): 'met' | 'partial' | 'missing' {
    for (const expectedForm of expectedForms) {
        const normalizedForm = normalizeForComparison(expectedForm)

        if (normalizedForm && normalizedAnswer.includes(normalizedForm)) {
            return 'met'
        }
    }

    for (const expectedForm of expectedForms) {
        const formTokens = tokenize(expectedForm)

        if (formTokens.length === 0) {
            continue
        }

        const matchingTokenCount = formTokens.filter((token) =>
            answerTokens.includes(token)
        ).length

        if (
            matchingTokenCount > 0 &&
            (matchingTokenCount >= formTokens.length - 1 ||
                matchingTokenCount >= Math.ceil(formTokens.length / 2))
        ) {
            return 'partial'
        }
    }

    return 'missing'
}

function buildFallbackStructuredWriteFeedback(
    challenge: Extract<SkillChallenge, { type: 'write' }>,
    answer: string,
    stage: 'draft' | 'final'
): WriteFeedback {
    const normalizedAnswer = normalizeForComparison(answer)
    const answerTokens = tokenize(answer)
    const requirementChecks = challenge.requirements.map((requirement) => {
        const status = detectRequirementStatus(
            normalizedAnswer,
            answerTokens,
            requirement.expectedForms
        )

        return {
            requirementId: requirement.id,
            label: requirement.label,
            status,
            feedback:
                status === 'met'
                    ? `You used ${requirement.label.toLowerCase()} clearly.`
                    : status === 'partial'
                      ? `${requirement.label} is close, but the Somali form still needs adjusting. ${requirement.explanation}`
                      : `Add ${requirement.label.toLowerCase()}. ${requirement.explanation}`,
        } satisfies WritingRequirementCheck
    })
    const metChecks = requirementChecks.filter((check) => check.status === 'met')
    const partialChecks = requirementChecks.filter((check) => check.status === 'partial')
    const missingChecks = requirementChecks.filter((check) => check.status === 'missing')
    const strengths =
        metChecks.length > 0
            ? [
                  `You already included ${metChecks
                      .slice(0, 2)
                      .map((check) => check.label.toLowerCase())
                      .join(' and ')}.`,
              ]
            : answerTokens.length > 0
              ? ['You attempted the task in Somali, which is a good start.']
              : []
    const improvements = [
        ...partialChecks.slice(0, 1).map((check) => check.feedback),
        ...missingChecks.slice(0, 2).map((check) => check.feedback),
    ].slice(0, 2)
    const nearCompleteThreshold = Math.max(1, challenge.requirements.length - 1)

    return {
        score:
            stage === 'final'
                ? metChecks.length >= nearCompleteThreshold
                    ? 4
                    : metChecks.length + partialChecks.length >= nearCompleteThreshold
                      ? 3
                      : answerTokens.length > 0
                        ? 2
                        : 1
                : undefined,
        summary:
            metChecks.length === challenge.requirements.length
                ? 'You included the main lesson targets clearly.'
                : metChecks.length + partialChecks.length > 0
                  ? 'You covered some targets, but a few key Somali patterns still need work.'
                  : 'Your answer needs more of the lesson targets before it is complete.',
        strengths,
        improvements,
        requirementChecks,
        suggestedAnswer: challenge.sampleAnswer?.trim() || answer.trim(),
    }
}

function normalizeFeedback(
    challenge: Extract<SkillChallenge, { type: 'write' }>,
    feedback: ModelWriteFeedback,
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

async function requestStructuredWriteFeedback(
    client: Awaited<ReturnType<typeof getOpenAIClient>>,
    challenge: Extract<SkillChallenge, { type: 'write' }>,
    answer: string,
    stage: 'draft' | 'final'
): Promise<
    | { feedback: ModelWriteFeedback | WriteFeedback }
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
                'Review structured Somali writing tasks that have explicit vocabulary and grammar targets.',
                'Reward communicative success and correct use of current-course vocabulary.',
                'Focus on grammatical and understandable Somali, not spelling perfection.',
                'Be lenient on punctuation, doubled letters, and minor spelling variation.',
                'Do not nitpick minor spelling if the intended Somali is still clear.',
                'Keep all feedback brief, practical, and encouraging.',
                'When a target is nearly right, mark it partial instead of missing.',
                'When a learner uses the wrong Somali structure, briefly explain the grammar pattern that should be used.',
                'Only mention real issues you can justify from the learner answer.',
                'Keep summary to one short sentence.',
                'Return at most 1 strength and at most 2 improvements.',
                'Keep each strength, improvement, and requirement note to one short sentence.',
            ].join(' '),
            input: buildPrompt(challenge, answer, stage),
            max_output_tokens: STRUCTURED_WRITE_FEEDBACK_MAX_OUTPUT_TOKENS,
            text: {
                format: {
                    type: 'json_schema',
                    name: 'write_feedback',
                    strict: true,
                    schema: stage === 'draft' ? draftFeedbackSchema : finalFeedbackSchema,
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
                    feedback: JSON.parse(response.output_text) as ModelWriteFeedback,
                }
            } catch {
                return {
                    feedback: buildFallbackStructuredWriteFeedback(
                        challenge,
                        answer,
                        stage
                    ),
                }
            }
        }

        return {
            feedback: buildFallbackStructuredWriteFeedback(challenge, answer, stage),
        }
    } catch {
        return {
            feedback: buildFallbackStructuredWriteFeedback(challenge, answer, stage),
        }
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
                `${index + 1}. id=${requirement.id}; kind=${requirement.kind}; accepted forms=${requirement.expectedForms.join(' / ')}; note=${requirement.explanation}`
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
        'Use status=met when the target is clearly present, partial when it is attempted but inaccurate, and missing when it is absent.',
        'Prioritize grammatical correctness and understandability over spelling perfection.',
        'Strengths rule: return at most 1 specific point.',
        'Improvements rule: return at most 2 concrete corrections.',
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
        const result = await requestStructuredWriteFeedback(
            client,
            challenge,
            answer,
            stage
        )

        if ('refusal' in result) {
            return NextResponse.json({
                score: stage === 'final' ? 1 : undefined,
                summary: '',
                strengths: [],
                improvements: [],
                requirementChecks: [],
                suggestedAnswer: '',
                refusal: result.refusal,
            } satisfies WriteFeedback)
        }

        return NextResponse.json(normalizeFeedback(challenge, result.feedback, stage))
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : 'Unable to review the writing response right now.'

        return NextResponse.json({ error: message }, { status: 500 })
    }
}
