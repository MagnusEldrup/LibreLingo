'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import LessonFeedback from '@/components/lesson-feedback'
import LevelAvatar from '@/components/level-avatar'
import LevelProgress from '@/components/level-progress'
import type {
    ConversationTurnFeedback,
    DefinitionToken,
    FreeWritingFeedback,
    GrammarLessonSlide,
    GrammarTableRow,
    SkillChallenge,
    SkillChallengeFile,
    WriteFeedback,
} from '@/data/course'
import {
    summarizeStoredCourseProgress,
    type CourseProgressSummary,
    getProgressEventName,
    getSkillProgress,
    saveSkillProgress,
    type StoredSkillProgress,
} from '@/lib/progress'

type Props = {
    courseId: string
    practiceHref: string
    courseLanguageName: string
    moduleTitle: string
    skillTitle: string
    challengeSet: SkillChallengeFile
    moduleChallengePool: SkillChallenge[]
    backUrl: string
}

type ChallengeFeedbackState = 'correct' | 'incorrect' | 'revealed' | undefined
type CardDirection = 'sourceToTarget' | 'targetToSource'

type ChallengeCompletion = {
    solved: boolean
    firstTry: boolean
    attempts: number
    points: number
    updatesProgress?: boolean
    awardsPoints?: boolean
}

function normalizeText(value: string) {
    return value
        .toLowerCase()
        .replaceAll(/[^\p{L}\p{N}' ]/gu, ' ')
        .replaceAll(/\s+/g, ' ')
        .trim()
}

function normalizeSomaliSpelling(value: string) {
    return normalizeText(value)
        .split(' ')
        .filter((token) => token.length > 0)
        .map((token) =>
            token
                .replaceAll(/'+/g, '')
                .replaceAll(/([aeiou])\1+/g, '$1')
                .replaceAll(/([b-df-hj-np-tv-z])\1+/g, '$1')
        )
        .join(' ')
}

function containsPromptPlaceholder(value: string) {
    return /_{2,}/.test(value)
}

function hasIncompleteDefinitionTokens(tokens: DefinitionToken[]) {
    return tokens.some((token) => containsPromptPlaceholder(token.word))
}

function isAnswerablePracticeChallenge(challenge: SkillChallenge) {
    if (challenge.type === 'shortInput' || challenge.type === 'chips') {
        return !hasIncompleteDefinitionTokens(challenge.phrase)
    }

    if (challenge.type === 'options' || challenge.type === 'cards') {
        return (
            !containsPromptPlaceholder(challenge.meaningInSourceLanguage) &&
            !containsPromptPlaceholder(challenge.formInTargetLanguage)
        )
    }

    if (challenge.type === 'freeWriting') {
        return challenge.promptLines.every(
            (promptLine) => !containsPromptPlaceholder(promptLine)
        )
    }

    if (challenge.type === 'write') {
        return (
            challenge.promptLines.every(
                (promptLine) => !containsPromptPlaceholder(promptLine)
            ) &&
            challenge.requirements.every((requirement) =>
                requirement.expectedForms.every(
                    (expectedForm) => !containsPromptPlaceholder(expectedForm)
                )
            )
        )
    }

    if (challenge.type === 'conversation') {
        return challenge.turns.every(
            (turn) =>
                !containsPromptPlaceholder(turn.partnerMessage) &&
                !containsPromptPlaceholder(turn.partnerMessageHint) &&
                !containsPromptPlaceholder(turn.englishReplyPrompt) &&
                turn.expectedReplies.every(
                    (expectedReply) => !containsPromptPlaceholder(expectedReply)
                )
        )
    }

    return true
}

function getEditDistance(left: string, right: string) {
    if (left === right) {
        return 0
    }

    if (left.length === 0) {
        return right.length
    }

    if (right.length === 0) {
        return left.length
    }

    const previousRow = Array.from({ length: right.length + 1 }, (_, index) => index)
    let leftIndex = 0

    while (leftIndex < left.length) {
        const leftCharacter = left.charAt(leftIndex)
        let previousDiagonal = previousRow[0]
        previousRow[0] = leftIndex + 1
        let rightIndex = 0

        while (rightIndex < right.length) {
            const rightCharacter = right.charAt(rightIndex)
            const temporary = previousRow[rightIndex + 1]
            const substitutionCost =
                leftCharacter === rightCharacter ? 0 : 1

            previousRow[rightIndex + 1] = Math.min(
                previousRow[rightIndex + 1] + 1,
                previousRow[rightIndex] + 1,
                previousDiagonal + substitutionCost
            )
            previousDiagonal = temporary
            rightIndex += 1
        }

        leftIndex += 1
    }

    return previousRow[right.length]
}

function getAllowedAnswerDistance(candidate: string, accepted: string) {
    const longestLength = Math.max(candidate.length, accepted.length)

    if (longestLength <= 4) {
        return 0
    }

    if (longestLength <= 8) {
        return 1
    }

    if (longestLength <= 16) {
        return 2
    }

    return 3
}

function matchesAcceptedAnswer(candidate: string, acceptedAnswers: string[]) {
    const normalizedCandidate = normalizeText(candidate)

    if (normalizedCandidate.length === 0) {
        return false
    }

    const candidateWordCount = normalizedCandidate.split(' ').length
    const normalizedAcceptedAnswers = acceptedAnswers.map((accepted) =>
        normalizeText(accepted)
    )

    if (normalizedAcceptedAnswers.includes(normalizedCandidate)) {
        return true
    }

    const spellingNormalizedCandidate = normalizeSomaliSpelling(candidate)

    for (const accepted of acceptedAnswers) {
        const normalizedAccepted = normalizeText(accepted)

        if (
            Math.abs(candidateWordCount - normalizedAccepted.split(' ').length) >
            1
        ) {
            continue
        }

        const spellingNormalizedAccepted = normalizeSomaliSpelling(accepted)

        if (spellingNormalizedCandidate === spellingNormalizedAccepted) {
            return true
        }

        const distance = getEditDistance(
            spellingNormalizedCandidate,
            spellingNormalizedAccepted
        )

        if (
            distance <=
            getAllowedAnswerDistance(
                spellingNormalizedCandidate,
                spellingNormalizedAccepted
            )
        ) {
            return true
        }
    }

    return false
}

function createSessionSeed() {
    return Math.floor(Math.random() * 1_000_000_000)
}

function hashString(value: string) {
    let hash = 0

    for (const character of value) {
        hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0
    }

    return hash
}

function shuffleWithSeed<T>(items: T[], seedKey: string) {
    const output = [...items]

    for (let index = output.length - 1; index > 0; index -= 1) {
        const swapIndex =
            hashString(`${seedKey}-${index}-${JSON.stringify(output[index])}`) %
            (index + 1)
        ;[output[index], output[swapIndex]] = [output[swapIndex], output[index]]
    }

    return output
}

function buildPracticeSession(challenges: SkillChallenge[], sessionSeed: number) {
    const answerableChallenges = challenges.filter((challenge) =>
        isAnswerablePracticeChallenge(challenge)
    )
    const freeWritingChallenges = answerableChallenges
        .filter(
            (challenge): challenge is Extract<SkillChallenge, { type: 'freeWriting' }> =>
                challenge.type === 'freeWriting'
        )
        .sort((left, right) => {
            if (left.priority !== right.priority) {
                return left.priority - right.priority
            }

            return (
                hashString(`${sessionSeed}-free-writing-${left.id}`) -
                hashString(`${sessionSeed}-free-writing-${right.id}`)
            )
        })
    const standardChallenges = answerableChallenges.filter(
        (challenge) => challenge.type !== 'freeWriting'
    )
    const challengesByGroup: Record<string, SkillChallenge[]> = {}

    for (const challenge of standardChallenges) {
        const currentGroup = challengesByGroup[challenge.group] ?? []
        currentGroup.push(challenge)
        challengesByGroup[challenge.group] = currentGroup
    }

    const orderedGroups = shuffleWithSeed(
        Object.entries(challengesByGroup),
        `${sessionSeed}-groups`
    )
    const selectedPerGroup = orderedGroups.map(([group, groupChallenges]) => {
        const orderedChallenges = [...groupChallenges].sort((left, right) => {
            if (left.priority !== right.priority) {
                return left.priority - right.priority
            }

            return (
                hashString(`${sessionSeed}-${group}-${left.id}`) -
                hashString(`${sessionSeed}-${group}-${right.id}`)
            )
        })

        return orderedChallenges.slice(0, Math.min(2, orderedChallenges.length))
    })

    const interleavedChallenges: SkillChallenge[] = []
    const longestGroupLength = Math.max(
        ...selectedPerGroup.map((groupChallenges) => groupChallenges.length),
        0
    )

    for (let offset = 0; offset < longestGroupLength; offset += 1) {
        for (const groupChallenges of selectedPerGroup) {
            const candidate = groupChallenges[offset]

            if (candidate !== undefined) {
                interleavedChallenges.push(candidate)
            }
        }
    }

    const reservedWritingSlots = Math.min(2, freeWritingChallenges.length)
    const baseChallengeLimit = Math.max(10 - reservedWritingSlots, 0)

    return [
        ...interleavedChallenges.slice(
            0,
            Math.min(baseChallengeLimit, interleavedChallenges.length)
        ),
        ...freeWritingChallenges.slice(0, reservedWritingSlots),
    ]
}

function getCardDirection(challengeId: string, sessionSeed: number): CardDirection {
    return hashString(`${sessionSeed}-${challengeId}-card-direction`) % 2 === 0
        ? 'sourceToTarget'
        : 'targetToSource'
}

function getPromptVariant(options: string[], key: string) {
    return options[hashString(key) % options.length]
}

function getChallengeBasePoints(challenge: SkillChallenge) {
    const pointMap = {
        options: 6,
        chips: 7,
        cards: 5,
        shortInput: 8,
        grammarTable: 12,
        freeWriting: 0,
        write: 0,
        conversation: 0,
    } as const

    return pointMap[challenge.type]
}

function getChallengeScore(challenge: SkillChallenge, attempts: number) {
    return Math.max(getChallengeBasePoints(challenge) - (attempts - 1) * 2, 2)
}

function MeaningTooltip({
    text,
    meaning,
    className = '',
    tooltipClassName = '',
    align = 'center',
}: {
    text: string
    meaning: string
    className?: string
    tooltipClassName?: string
    align?: 'center' | 'left'
}) {
    const tooltipPositionClasses =
        align === 'left' ? 'left-0' : 'left-1/2 -translate-x-1/2'

    return (
        <span className="group/meaning relative inline-flex max-w-full">
            <button
                type="button"
                className={className}
                aria-label={`${text}. Meaning: ${meaning}`}
            >
                {text}
            </button>
            <span
                role="tooltip"
                className={[
                    'pointer-events-none absolute top-full z-20 mt-3 hidden w-max max-w-[min(22rem,calc(100vw-3rem))] rounded-2xl bg-slate-900 px-4 py-3 text-left text-sm leading-6 text-white shadow-[0_18px_50px_-24px_rgba(15,23,42,0.95)]',
                    tooltipPositionClasses,
                    'group-hover/meaning:block group-focus-within/meaning:block',
                    tooltipClassName,
                ].join(' ')}
            >
                <span className="block text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-slate-300">
                    Meaning
                </span>
                <span className="mt-1 block">{meaning}</span>
            </span>
        </span>
    )
}

function DefinitionRow({ tokens }: { tokens: DefinitionToken[] }) {
    return (
        <div className="space-y-3 rounded-2xl border border-[#c8dbfb] bg-[#f6faff] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#4189dd]">
                    Hover or tap for meaning
                </p>
            </div>
            <div className="flex flex-wrap gap-3">
                {tokens.map((token) => (
                    <MeaningTooltip
                        key={`${token.word}-${token.definition}`}
                        text={token.word}
                        meaning={token.definition}
                        className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:-translate-y-0.5 hover:bg-[#edf5ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4189dd] focus-visible:ring-offset-2"
                    />
                ))}
            </div>
        </div>
    )
}

function ChallengeTypeLabel({ challenge }: { challenge: SkillChallenge }) {
    const labelMap = {
        options: 'Multiple choice',
        chips: 'Word chips',
        cards: 'Sentence match',
        shortInput: 'Short input',
        grammarTable: 'Grammar table',
        freeWriting: 'Writing feedback',
        write: 'Write module',
        conversation: 'Conversation chat',
    } as const

    return (
        <span className="rounded-full bg-[#e7f1ff] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#4189dd]">
            {labelMap[challenge.type]}
        </span>
    )
}

function buildOptionChoices(
    challenge: Extract<SkillChallenge, { type: 'options' }>,
    challengePool: SkillChallenge[],
    sessionSeed: number
) {
    const distractors = challengePool
        .filter(
            (
                candidate
            ): candidate is Extract<
                SkillChallenge,
                { type: 'options' | 'cards' }
            > =>
                (candidate.type === 'options' || candidate.type === 'cards') &&
                candidate.id !== challenge.id
        )
        .map((candidate) => candidate.meaningInSourceLanguage)
        .filter((candidate, index, items) => items.indexOf(candidate) === index)
        .filter((candidate) => candidate !== challenge.meaningInSourceLanguage)
    const shuffledDistractors = shuffleWithSeed(
        distractors,
        `${sessionSeed}-${challenge.id}-options`
    ).slice(0, 3)

    return shuffleWithSeed(
        [challenge.meaningInSourceLanguage, ...shuffledDistractors],
        `${sessionSeed}-${challenge.id}-choices`
    )
}

function buildShortInputHint(
    challenge: Extract<SkillChallenge, { type: 'shortInput' }>
) {
    return challenge.phrase.length === 1 ? 'Type one word' : 'Type the answer'
}

function buildOptionsPrompt(
    challenge: Extract<SkillChallenge, { type: 'options' }>,
    sessionSeed: number
) {
    const usesQuestionMeaning =
        challenge.meaningInSourceLanguage.endsWith('?') ||
        challenge.formInTargetLanguage.endsWith('?')

    return usesQuestionMeaning
        ? getPromptVariant(
              ['Pick the best meaning', 'Choose the matching question', 'What does this ask?'],
              `${sessionSeed}-${challenge.id}-options-question`
          )
        : getPromptVariant(
              ['Pick the best meaning', 'Choose the English meaning', 'What does this mean?'],
              `${sessionSeed}-${challenge.id}-options-statement`
          )
}

function buildChipsPrompt(
    challenge: Extract<SkillChallenge, { type: 'chips' }>,
    sessionSeed: number
) {
    return challenge.translatesToSourceLanguage
        ? getPromptVariant(
              ['Build the English answer', 'Build the English sentence', 'Put the English words in order'],
              `${sessionSeed}-${challenge.id}-chips-source`
          )
        : getPromptVariant(
              ['Build the Somali answer', 'Build the Somali sentence', 'Put the Somali words in order'],
              `${sessionSeed}-${challenge.id}-chips-target`
          )
}

function buildCardsPrompt(direction: CardDirection, challengeId: string, sessionSeed: number) {
    return direction === 'sourceToTarget'
        ? getPromptVariant(
              ['Choose the Somali sentence', 'Pick the Somali match', 'Which Somali fits?'],
              `${sessionSeed}-${challengeId}-cards-source`
          )
        : getPromptVariant(
              ['Choose the English sentence', 'Pick the English match', 'What does this mean?'],
              `${sessionSeed}-${challengeId}-cards-target`
          )
}

function buildCardChoices(
    challenge: Extract<SkillChallenge, { type: 'cards' }>,
    challengePool: SkillChallenge[],
    direction: CardDirection,
    sessionSeed: number
) {
    if (direction === 'sourceToTarget') {
        const distractors = challengePool
            .filter(
                (
                    candidate
                ): candidate is Extract<
                    SkillChallenge,
                    { type: 'options' | 'cards' }
                > =>
                    (candidate.type === 'options' || candidate.type === 'cards') &&
                    candidate.id !== challenge.id
            )
            .map((candidate) => candidate.formInTargetLanguage)
            .filter((candidate, index, items) => items.indexOf(candidate) === index)
            .filter((candidate) => candidate !== challenge.formInTargetLanguage)

        const shuffledDistractors = shuffleWithSeed(
            distractors,
            `${sessionSeed}-${challenge.id}-card-target`
        ).slice(0, 3)

        return shuffleWithSeed(
            [challenge.formInTargetLanguage, ...shuffledDistractors],
            `${sessionSeed}-${challenge.id}-card-target-choices`
        )
    }

    const distractors = challengePool
        .filter(
            (
                candidate
            ): candidate is Extract<
                SkillChallenge,
                { type: 'options' | 'cards' }
            > =>
                (candidate.type === 'options' || candidate.type === 'cards') &&
                candidate.id !== challenge.id
        )
        .map((candidate) => candidate.meaningInSourceLanguage)
        .filter((candidate, index, items) => items.indexOf(candidate) === index)
        .filter((candidate) => candidate !== challenge.meaningInSourceLanguage)

    const shuffledDistractors = shuffleWithSeed(
        distractors,
        `${sessionSeed}-${challenge.id}-card-source`
    ).slice(0, 3)

    return shuffleWithSeed(
        [challenge.meaningInSourceLanguage, ...shuffledDistractors],
        `${sessionSeed}-${challenge.id}-card-source-choices`
    )
}

function buildShortInputPrompt(
    challenge: Extract<SkillChallenge, { type: 'shortInput' }>,
    sessionSeed: number
) {
    return challenge.phrase.length === 1
        ? getPromptVariant(
              ['Type the Somali word', 'Write the Somali word', 'Answer in Somali'],
              `${sessionSeed}-${challenge.id}-short-word`
          )
        : getPromptVariant(
              ['Type the Somali phrase', 'Write the phrase in Somali', 'Answer in Somali'],
              `${sessionSeed}-${challenge.id}-short-phrase`
          )
}

function FeedbackPanel({
    state,
    message,
    supportingText,
    primaryLabel,
    onPrimary,
    secondaryLabel,
    onSecondary,
}: {
    state: 'correct' | 'incorrect' | 'revealed'
    message: string
    supportingText: string
    primaryLabel: string
    onPrimary: () => void
    secondaryLabel?: string
    onSecondary?: () => void
}) {
    let stateClasses = 'border-[#fecaca] bg-rose-50'
    let textClasses = 'text-rose-700'

    if (state === 'correct') {
        stateClasses = 'border-[#b7d4fb] bg-[#eef6ff]'
        textClasses = 'text-[#2f6db8]'
    } else if (state === 'revealed') {
        stateClasses = 'border-[#cbd5e1] bg-slate-50'
        textClasses = 'text-slate-700'
    }

    return (
        <div className={`space-y-4 rounded-2xl border p-5 ${stateClasses}`}>
            <p className={`text-lg font-semibold ${textClasses}`}>{message}</p>
            <p className="text-slate-700">{supportingText}</p>
            <div className="flex flex-wrap gap-3">
                <Button onClick={onPrimary}>{primaryLabel}</Button>
                {secondaryLabel && onSecondary && (
                    <Button variant="outline" onClick={onSecondary}>
                        {secondaryLabel}
                    </Button>
                )}
            </div>
        </div>
    )
}

function AutoAdvanceNotice({
    active,
    message,
    onAdvance,
}: {
    active: boolean
    message: string
    onAdvance: () => void
}) {
    useEffect(() => {
        if (!active) {
            return
        }

        const timeoutId = window.setTimeout(() => {
            onAdvance()
        }, 900)

        return () => window.clearTimeout(timeoutId)
    }, [active, onAdvance])

    if (!active) {
        return
    }

    return (
        <div className="space-y-2 rounded-2xl border border-[#b7d4fb] bg-[#eef6ff] p-5">
            <p className="text-lg font-semibold text-[#2f6db8]">{message}</p>
            <p className="text-sm text-slate-700">Moving to the next challenge...</p>
        </div>
    )
}

function OptionsChallengeView({
    challenge,
    challengePool,
    sessionSeed,
    selectedOption,
    setSelectedOption,
    feedbackState,
    setFeedbackState,
    attemptCount,
    setAttemptCount,
    onComplete,
}: {
    challenge: Extract<SkillChallenge, { type: 'options' }>
    challengePool: SkillChallenge[]
    sessionSeed: number
    selectedOption: string | undefined
    setSelectedOption: (value: string | undefined) => void
    feedbackState: ChallengeFeedbackState
    setFeedbackState: (value: ChallengeFeedbackState) => void
    attemptCount: number
    setAttemptCount: (value: number) => void
    onComplete: (completion: ChallengeCompletion) => void
}) {
    const choices = buildOptionChoices(challenge, challengePool, sessionSeed)
    const isLocked = feedbackState === 'correct' || feedbackState === 'revealed'

    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">
                    {buildOptionsPrompt(challenge, sessionSeed)}
                </p>
                <h2 className="text-4xl font-semibold text-slate-900">
                    {challenge.formInTargetLanguage}
                </h2>
            </div>

            <div className="grid gap-3">
                {choices.map((choice) => {
                    const isCorrect =
                        choice === challenge.meaningInSourceLanguage
                    const isSelected = choice === selectedOption
                    const showCorrect =
                        (feedbackState === 'correct' || feedbackState === 'revealed') &&
                        isCorrect
                    const showIncorrect =
                        feedbackState === 'incorrect' && isSelected && !isCorrect
                    let stateClasses =
                        'border-slate-200 bg-white text-slate-900 hover:border-[#6aa5ea] hover:bg-[#f6faff]'

                    if (showCorrect) {
                        stateClasses =
                            'border-[#6aa5ea] bg-[#eef6ff] text-[#1d5ea8]'
                    } else if (showIncorrect) {
                        stateClasses =
                            'border-rose-300 bg-rose-50 text-rose-900'
                    } else if (isSelected) {
                        stateClasses =
                            'border-[#93baf0] bg-[#f6faff] text-slate-950'
                    }

                    return (
                        <button
                            key={choice}
                            type="button"
                            disabled={isLocked}
                            onClick={() => {
                                setSelectedOption(choice)

                                if (isCorrect) {
                                    setFeedbackState('correct')
                                    return
                                }

                                setFeedbackState('incorrect')
                                setAttemptCount(attemptCount + 1)
                            }}
                            className={[
                                'rounded-2xl border px-5 py-4 text-left text-base font-medium transition',
                                stateClasses,
                            ].join(' ')}
                        >
                            {choice}
                        </button>
                    )
                })}
            </div>

            {feedbackState === 'correct' && (
                <AutoAdvanceNotice
                    active
                    message={`Correct. +${getChallengeScore(challenge, attemptCount)} XP`}
                    onAdvance={() =>
                        onComplete({
                            solved: true,
                            firstTry: attemptCount === 1,
                            attempts: attemptCount,
                            points: getChallengeScore(challenge, attemptCount),
                        })
                    }
                />
            )}

            {feedbackState === 'incorrect' && (
                <FeedbackPanel
                    state="incorrect"
                    message="Not quite."
                    supportingText="Choose again or reveal the answer to move on with zero points for this challenge."
                    primaryLabel="Reveal answer"
                    onPrimary={() => setFeedbackState('revealed')}
                    secondaryLabel="Keep trying"
                    onSecondary={() => {
                        setSelectedOption(undefined)
                        setFeedbackState(undefined)
                    }}
                />
            )}

            {feedbackState === 'revealed' && (
                <FeedbackPanel
                    state="revealed"
                    message="Answer revealed"
                    supportingText={`Correct answer: ${challenge.meaningInSourceLanguage}`}
                    primaryLabel="Next challenge"
                    onPrimary={() =>
                        onComplete({
                            solved: false,
                            firstTry: false,
                            attempts: attemptCount,
                            points: 0,
                        })
                    }
                />
            )}
        </div>
    )
}

function ChipsChallengeView({
    challenge,
    sessionSeed,
    selectedChipIndexes,
    setSelectedChipIndexes,
    feedbackState,
    setFeedbackState,
    attemptCount,
    setAttemptCount,
    onComplete,
}: {
    challenge: Extract<SkillChallenge, { type: 'chips' }>
    sessionSeed: number
    selectedChipIndexes: number[]
    setSelectedChipIndexes: (value: number[]) => void
    feedbackState: ChallengeFeedbackState
    setFeedbackState: (value: ChallengeFeedbackState) => void
    attemptCount: number
    setAttemptCount: (value: number) => void
    onComplete: (completion: ChallengeCompletion) => void
}) {
    const displayedChips = shuffleWithSeed(
        challenge.chips,
        `${sessionSeed}-${challenge.id}-chips`
    )
    const selectedChips = selectedChipIndexes.map((index) => displayedChips[index])
    const selectedText = normalizeText(selectedChips.join(' '))
    const acceptedSolutions = new Set(
        challenge.solutions.map((solution) =>
            normalizeText(solution.join(' '))
        )
    )
    const isLocked = feedbackState === 'correct' || feedbackState === 'revealed'

    return (
        <div className="space-y-6">
            <div className="space-y-3">
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">
                    {buildChipsPrompt(challenge, sessionSeed)}
                </p>
                <DefinitionRow tokens={challenge.phrase} />
            </div>

            <div className="min-h-20 rounded-2xl border border-dashed border-[#aac8f3] bg-[#f6faff] p-4">
                <div className="flex flex-wrap gap-2">
                    {selectedChipIndexes.length === 0 && (
                        <p className="text-sm text-slate-500">
                            Tap chips below to build your answer.
                        </p>
                    )}
                    {selectedChipIndexes.map((index) => (
                        <button
                            key={`selected-${index}`}
                            type="button"
                            disabled={isLocked}
                            onClick={() =>
                                setSelectedChipIndexes(
                                    selectedChipIndexes.filter(
                                        (candidate) => candidate !== index
                                    )
                                )
                            }
                            className="rounded-full border border-[#9fc1f1] bg-white px-4 py-2 text-sm font-medium text-slate-900"
                        >
                            {displayedChips[index]}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex flex-wrap gap-2">
                {displayedChips.map((chip, index) => {
                    const isSelected = selectedChipIndexes.includes(index)

                    return (
                        <button
                            key={`${chip}-${index}`}
                            type="button"
                            disabled={isSelected || isLocked}
                            onClick={() =>
                                setSelectedChipIndexes([
                                    ...selectedChipIndexes,
                                    index,
                                ])
                            }
                            className="rounded-full border border-[#bfd7f8] bg-[#eef6ff] px-4 py-2 text-sm font-medium text-[#2f6db8] disabled:opacity-40"
                        >
                            {chip}
                        </button>
                    )
                })}
            </div>

            {feedbackState === undefined && (
                <Button
                    disabled={selectedChipIndexes.length === 0}
                    onClick={() => {
                        if (acceptedSolutions.has(selectedText)) {
                            setFeedbackState('correct')
                            return
                        }

                        setFeedbackState('incorrect')
                        setAttemptCount(attemptCount + 1)
                    }}
                >
                    Check answer
                </Button>
            )}

            {feedbackState === 'correct' && (
                <AutoAdvanceNotice
                    active
                    message={`Correct. +${getChallengeScore(challenge, attemptCount)} XP`}
                    onAdvance={() =>
                        onComplete({
                            solved: true,
                            firstTry: attemptCount === 1,
                            attempts: attemptCount,
                            points: getChallengeScore(challenge, attemptCount),
                        })
                    }
                />
            )}

            {feedbackState === 'incorrect' && (
                <FeedbackPanel
                    state="incorrect"
                    message="Not quite."
                    supportingText="Reorder the chips and check again, or reveal the answer to move on."
                    primaryLabel="Reveal answer"
                    onPrimary={() => setFeedbackState('revealed')}
                    secondaryLabel="Try again"
                    onSecondary={() => setFeedbackState(undefined)}
                />
            )}

            {feedbackState === 'revealed' && (
                <FeedbackPanel
                    state="revealed"
                    message="Answer revealed"
                    supportingText={`Correct answer: ${challenge.formattedSolution}`}
                    primaryLabel="Next challenge"
                    onPrimary={() =>
                        onComplete({
                            solved: false,
                            firstTry: false,
                            attempts: attemptCount,
                            points: 0,
                        })
                    }
                />
            )}
        </div>
    )
}

function CardsChallengeView({
    challenge,
    challengePool,
    sessionSeed,
    direction,
    selectedOption,
    setSelectedOption,
    feedbackState,
    setFeedbackState,
    attemptCount,
    setAttemptCount,
    onComplete,
}: {
    challenge: Extract<SkillChallenge, { type: 'cards' }>
    challengePool: SkillChallenge[]
    sessionSeed: number
    direction: CardDirection
    selectedOption: string | undefined
    setSelectedOption: (value: string | undefined) => void
    feedbackState: ChallengeFeedbackState
    setFeedbackState: (value: ChallengeFeedbackState) => void
    attemptCount: number
    setAttemptCount: (value: number) => void
    onComplete: (completion: ChallengeCompletion) => void
}) {
    const promptLabel = direction === 'sourceToTarget' ? 'English' : 'Somali'
    const promptText =
        direction === 'sourceToTarget'
            ? challenge.meaningInSourceLanguage
            : challenge.formInTargetLanguage
    const answerText =
        direction === 'sourceToTarget'
            ? challenge.formInTargetLanguage
            : challenge.meaningInSourceLanguage
    const choices = buildCardChoices(
        challenge,
        challengePool,
        direction,
        sessionSeed
    )
    const isLocked = feedbackState === 'correct' || feedbackState === 'revealed'

    return (
        <div className="space-y-6">
            <div className="space-y-3">
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">
                    {buildCardsPrompt(direction, challenge.id, sessionSeed)}
                </p>
                <div className="rounded-2xl border border-[#c8dbfb] bg-[#f6faff] p-6">
                    <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">
                        {promptLabel}
                    </p>
                    <p className="mt-3 text-3xl font-semibold text-slate-900">
                        {promptText}
                    </p>
                </div>
            </div>

            <div className="grid gap-3">
                {choices.map((choice) => {
                    const isCorrect = choice === answerText
                    const isSelected = choice === selectedOption
                    const showCorrect =
                        (feedbackState === 'correct' ||
                            feedbackState === 'revealed') &&
                        isCorrect
                    const showIncorrect =
                        feedbackState === 'incorrect' && isSelected && !isCorrect
                    let stateClasses =
                        'border-slate-200 bg-white text-slate-900 hover:border-[#6aa5ea] hover:bg-[#f6faff]'

                    if (showCorrect) {
                        stateClasses =
                            'border-[#6aa5ea] bg-[#eef6ff] text-[#1d5ea8]'
                    } else if (showIncorrect) {
                        stateClasses =
                            'border-rose-300 bg-rose-50 text-rose-900'
                    } else if (isSelected) {
                        stateClasses =
                            'border-[#93baf0] bg-[#f6faff] text-slate-950'
                    }

                    return (
                        <button
                            key={choice}
                            type="button"
                            disabled={isLocked}
                            onClick={() => {
                                setSelectedOption(choice)

                                if (isCorrect) {
                                    setFeedbackState('correct')
                                    return
                                }

                                setFeedbackState('incorrect')
                                setAttemptCount(attemptCount + 1)
                            }}
                            className={[
                                'rounded-2xl border px-5 py-4 text-left text-base font-medium transition',
                                stateClasses,
                            ].join(' ')}
                        >
                            {choice}
                        </button>
                    )
                })}
            </div>

            {feedbackState === 'correct' && (
                <AutoAdvanceNotice
                    active
                    message={`Correct. +${getChallengeScore(challenge, attemptCount)} XP`}
                    onAdvance={() =>
                        onComplete({
                            solved: true,
                            firstTry: attemptCount === 1,
                            attempts: attemptCount,
                            points: getChallengeScore(challenge, attemptCount),
                        })
                    }
                />
            )}

            {feedbackState === 'incorrect' && (
                <FeedbackPanel
                    state="incorrect"
                    message="Not quite."
                    supportingText="Choose again or reveal the correct answer."
                    primaryLabel="Reveal answer"
                    onPrimary={() => setFeedbackState('revealed')}
                    secondaryLabel="Try again"
                    onSecondary={() => {
                        setSelectedOption(undefined)
                        setFeedbackState(undefined)
                    }}
                />
            )}

            {feedbackState === 'revealed' && (
                <FeedbackPanel
                    state="revealed"
                    message="Answer revealed"
                    supportingText={`Correct answer: ${answerText}`}
                    primaryLabel="Next challenge"
                    onPrimary={() =>
                        onComplete({
                            solved: false,
                            firstTry: false,
                            attempts: attemptCount,
                            points: 0,
                        })
                    }
                />
            )}
        </div>
    )
}

function ShortInputChallengeView({
    challenge,
    sessionSeed,
    answer,
    setAnswer,
    feedbackState,
    setFeedbackState,
    attemptCount,
    setAttemptCount,
    onComplete,
}: {
    challenge: Extract<SkillChallenge, { type: 'shortInput' }>
    sessionSeed: number
    answer: string
    setAnswer: (value: string) => void
    feedbackState: ChallengeFeedbackState
    setFeedbackState: (value: ChallengeFeedbackState) => void
    attemptCount: number
    setAttemptCount: (value: number) => void
    onComplete: (completion: ChallengeCompletion) => void
}) {
    const isLocked = feedbackState === 'correct' || feedbackState === 'revealed'

    return (
        <div className="space-y-6">
            <div className="space-y-3">
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">
                    {buildShortInputPrompt(challenge, sessionSeed)}
                </p>
                <DefinitionRow tokens={challenge.phrase} />
            </div>

            <div className="space-y-3">
                <label className="text-sm font-medium text-slate-700">
                    Your answer
                </label>
                <input
                    value={answer}
                    disabled={isLocked}
                    onChange={(event) => setAnswer(event.target.value)}
                    placeholder={buildShortInputHint(challenge)}
                    className="w-full rounded-2xl border border-[#aac8f3] px-4 py-3 text-lg text-slate-900 outline-none transition focus:border-[#4189dd]"
                />
            </div>

            {feedbackState === undefined && (
                <Button
                    disabled={normalizeText(answer).length === 0}
                    onClick={() => {
                        if (
                            matchesAcceptedAnswer(
                                answer,
                                challenge.formInTargetLanguage
                            )
                        ) {
                            setFeedbackState('correct')
                            return
                        }

                        setFeedbackState('incorrect')
                        setAttemptCount(attemptCount + 1)
                    }}
                >
                    Check answer
                </Button>
            )}

            {feedbackState === 'correct' && (
                <AutoAdvanceNotice
                    active
                    message={`Correct. +${getChallengeScore(challenge, attemptCount)} XP`}
                    onAdvance={() =>
                        onComplete({
                            solved: true,
                            firstTry: attemptCount === 1,
                            attempts: attemptCount,
                            points: getChallengeScore(challenge, attemptCount),
                        })
                    }
                />
            )}

            {feedbackState === 'incorrect' && (
                <FeedbackPanel
                    state="incorrect"
                    message="Not quite."
                    supportingText="Edit your answer and check again, or reveal the accepted translation."
                    primaryLabel="Reveal answer"
                    onPrimary={() => setFeedbackState('revealed')}
                    secondaryLabel="Try again"
                    onSecondary={() => setFeedbackState(undefined)}
                />
            )}

            {feedbackState === 'revealed' && (
                <FeedbackPanel
                    state="revealed"
                    message="Answer revealed"
                    supportingText={`Accepted answers: ${challenge.formInTargetLanguage.join(' / ')}`}
                    primaryLabel="Next challenge"
                    onPrimary={() =>
                        onComplete({
                            solved: false,
                            firstTry: false,
                            attempts: attemptCount,
                            points: 0,
                        })
                    }
                />
            )}
        </div>
    )
}

function FreeWritingChallengeView({
    courseId,
    moduleTitle,
    lessonTitle,
    practiceHref,
    challenge,
    answer,
    setAnswer,
    onComplete,
}: {
    courseId: string
    moduleTitle: string
    lessonTitle: string
    practiceHref: string
    challenge: Extract<SkillChallenge, { type: 'freeWriting' }>
    answer: string
    setAnswer: (value: string) => void
    onComplete: (completion: ChallengeCompletion) => void
}) {
    const [feedback, setFeedback] = useState<FreeWritingFeedback | undefined>()
    const [requestError, setRequestError] = useState<string | undefined>()
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [correctedAnswer, setCorrectedAnswer] = useState('')
    const [correctionFeedbackState, setCorrectionFeedbackState] = useState<
        'correct' | 'incorrect' | undefined
    >()
    const isLocked = isSubmitting || feedback !== undefined

    useEffect(() => {
        setFeedback(undefined)
        setRequestError(undefined)
        setIsSubmitting(false)
        setCorrectedAnswer('')
        setCorrectionFeedbackState(undefined)
    }, [challenge.id])

    useEffect(() => {
        setCorrectedAnswer('')
        setCorrectionFeedbackState(undefined)
    }, [feedback?.suggestedAnswer])

    async function submitForFeedback() {
        if (normalizeText(answer).length === 0) {
            return
        }

        setIsSubmitting(true)
        setRequestError(undefined)

        try {
            const response = await fetch('/api/writing-feedback', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    courseId,
                    practiceHref,
                    challengeId: challenge.id,
                    answer,
                }),
            })
            const payload = (await response.json()) as
                | FreeWritingFeedback
                | { error?: string }

            if (!response.ok) {
                throw new Error(
                    'error' in payload && payload.error
                        ? payload.error
                        : 'Unable to get feedback right now.'
                )
            }

            if ('refusal' in payload && payload.refusal) {
                throw new Error(payload.refusal)
            }

            setFeedback(payload as FreeWritingFeedback)
        } catch (error) {
            setRequestError(
                error instanceof Error
                    ? error.message
                    : 'Unable to get feedback right now.'
            )
        } finally {
            setIsSubmitting(false)
        }
    }

    function submitCorrectedAnswer() {
        if (!feedback) {
            return
        }

        const matchedSuggestion = matchesAcceptedAnswer(correctedAnswer, [
            feedback.suggestedAnswer,
        ])

        if (!matchedSuggestion) {
            setCorrectionFeedbackState('incorrect')
            return
        }

        setCorrectionFeedbackState('correct')
    }

    return (
        <div className="space-y-6">
            <div className="space-y-3">
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">
                    {challenge.instruction}
                </p>
                <div className="space-y-3 rounded-2xl border border-[#c8dbfb] bg-[#f6faff] p-5">
                    {challenge.promptLines.map((line) => (
                        <p key={line} className="text-lg text-slate-900">
                            {line}
                        </p>
                    ))}
                </div>
            </div>

            <div className="space-y-3">
                <label className="text-sm font-medium text-slate-700">
                    Your Somali answer
                </label>
                <textarea
                    value={answer}
                    disabled={isLocked}
                    onChange={(event) => setAnswer(event.target.value)}
                    placeholder={challenge.placeholder}
                    rows={6}
                    className="w-full rounded-2xl border border-[#aac8f3] px-4 py-3 text-lg text-slate-900 outline-none transition focus:border-[#4189dd]"
                />
            </div>

            {!feedback && (
                <Button
                    disabled={isSubmitting || normalizeText(answer).length === 0}
                    onClick={() => {
                        void submitForFeedback()
                    }}
                >
                    {isSubmitting ? 'Getting feedback...' : 'Get feedback'}
                </Button>
            )}

            {requestError && (
                <FeedbackPanel
                    state="incorrect"
                    message="Feedback is not available yet."
                    supportingText={requestError}
                    primaryLabel="Try again"
                    onPrimary={() => {
                        setRequestError(undefined)
                        void submitForFeedback()
                    }}
                    secondaryLabel="Keep editing"
                    onSecondary={() => setRequestError(undefined)}
                />
            )}

            {feedback && (
                <div className="space-y-5 rounded-2xl border border-[#b7d4fb] bg-[#eef6ff] p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-lg font-semibold text-[#2f6db8]">
                            Writing feedback
                        </p>
                        <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-[#1f5ea6] shadow-sm">
                            Score {feedback.score}/5
                        </span>
                    </div>

                    <p className="text-slate-700">{feedback.summary}</p>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
                            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#4189dd]">
                                What worked
                            </p>
                            {feedback.strengths.length > 0 ? (
                                <ul className="space-y-2 text-slate-700">
                                    {feedback.strengths.map((item) => (
                                        <li key={item}>- {item}</li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-slate-600">
                                    Your answer communicated the main idea well.
                                </p>
                            )}
                        </div>

                        <div className="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
                            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#4189dd]">
                                Targeted corrections
                            </p>
                            {feedback.improvements.length > 0 ? (
                                <ul className="space-y-2 text-slate-700">
                                    {feedback.improvements.map((item) => (
                                        <li key={item}>- {item}</li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-slate-600">
                                    No important correction needed here. Keep using the same pattern.
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
                        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#4189dd]">
                            Suggested Somali rewrite
                        </p>
                        <p className="text-slate-900">{feedback.suggestedAnswer}</p>
                    </div>

                    {normalizeText(feedback.suggestedAnswer).length > 0 &&
                        correctionFeedbackState !== 'correct' && (
                            <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
                                <div className="space-y-1">
                                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#4189dd]">
                                        Type the corrected Somali for +5 XP
                                    </p>
                                    <p className="text-sm text-slate-600">
                                        Copy the suggested rewrite as closely as you
                                        can. Minor spelling variation is still accepted.
                                    </p>
                                </div>
                                <textarea
                                    value={correctedAnswer}
                                    onChange={(event) => {
                                        setCorrectedAnswer(event.target.value)
                                        if (correctionFeedbackState) {
                                            setCorrectionFeedbackState(undefined)
                                        }
                                    }}
                                    placeholder="Type the corrected Somali here"
                                    rows={4}
                                    className="w-full rounded-2xl border border-[#aac8f3] px-4 py-3 text-lg text-slate-900 outline-none transition focus:border-[#4189dd]"
                                />
                                {correctionFeedbackState === 'incorrect' && (
                                    <p className="text-sm text-rose-700">
                                        Not quite yet. Follow the suggested Somali
                                        rewrite and try again.
                                    </p>
                                )}
                                <Button
                                    disabled={
                                        normalizeText(correctedAnswer).length === 0
                                    }
                                    onClick={submitCorrectedAnswer}
                                >
                                    Check corrected answer (+5 XP)
                                </Button>
                            </div>
                        )}

                    {correctionFeedbackState === 'correct' && (
                        <FeedbackPanel
                            state="correct"
                            message="Corrected answer matched"
                            supportingText="You earned +5 XP for typing the corrected Somali."
                            primaryLabel="Continue"
                            onPrimary={() =>
                                onComplete({
                                    solved: false,
                                    firstTry: false,
                                    attempts: 0,
                                    points: 5,
                                    updatesProgress: false,
                                    awardsPoints: true,
                                })
                            }
                        />
                    )}

                    {correctionFeedbackState !== 'correct' && (
                        <div className="flex flex-wrap gap-3">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setFeedback(undefined)
                                    setRequestError(undefined)
                                }}
                            >
                                Revise answer
                            </Button>
                            <Button
                                onClick={() =>
                                    onComplete({
                                        solved: false,
                                        firstTry: false,
                                        attempts: 0,
                                        points: 0,
                                        updatesProgress: false,
                                        awardsPoints: false,
                                    })
                                }
                            >
                                Next challenge
                            </Button>
                        </div>
                    )}

                    <LessonFeedback
                        courseId={courseId}
                        moduleTitle={moduleTitle}
                        lessonTitle={lessonTitle}
                        practiceHref={practiceHref}
                    />
                </div>
            )}
        </div>
    )
}

function RequirementStatusBadge({
    status,
}: {
    status: 'met' | 'partial' | 'missing'
}) {
    const toneClasses = {
        met: 'bg-[#daf3e2] text-[#1e6c40]',
        partial: 'bg-[#fff2d8] text-[#8b5e1a]',
        missing: 'bg-[#ffe3e3] text-[#a3213a]',
    } as const
    const labelMap = {
        met: 'Met',
        partial: 'Almost there',
        missing: 'Missing',
    } as const

    return (
        <span
            className={[
                'rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]',
                toneClasses[status],
            ].join(' ')}
        >
            {labelMap[status]}
        </span>
    )
}

function WriteFeedbackPanel({
    title,
    feedback,
}: {
    title: string
    feedback: WriteFeedback
}) {
    return (
        <div className="space-y-5 rounded-2xl border border-[#b7d4fb] bg-[#eef6ff] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-lg font-semibold text-[#2f6db8]">{title}</p>
                {feedback.score !== undefined && (
                    <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-[#1f5ea6] shadow-sm">
                        Final grade {feedback.score}/5
                    </span>
                )}
            </div>

            <p className="text-slate-700">{feedback.summary}</p>

            <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#4189dd]">
                        What worked
                    </p>
                    {feedback.strengths.length > 0 ? (
                        <ul className="space-y-2 text-slate-700">
                            {feedback.strengths.map((item) => (
                                <li key={item}>- {item}</li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-slate-600">
                            The draft communicated the main idea clearly.
                        </p>
                    )}
                </div>

                <div className="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#4189dd]">
                        Next improvements
                    </p>
                    {feedback.improvements.length > 0 ? (
                        <ul className="space-y-2 text-slate-700">
                            {feedback.improvements.map((item) => (
                                <li key={item}>- {item}</li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-slate-600">
                            No major correction is needed. Keep the same structure.
                        </p>
                    )}
                </div>
            </div>

            <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#4189dd]">
                    Requirement check
                </p>
                <div className="space-y-3">
                    {feedback.requirementChecks.map((requirementCheck) => (
                        <div
                            key={requirementCheck.requirementId}
                            className="rounded-2xl border border-[#dceafe] p-4"
                        >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <p className="font-semibold text-slate-900">
                                    {requirementCheck.label}
                                </p>
                                <RequirementStatusBadge
                                    status={requirementCheck.status}
                                />
                            </div>
                            <p className="mt-2 text-sm leading-6 text-slate-600">
                                {requirementCheck.feedback}
                            </p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#4189dd]">
                    Suggested Somali revision
                </p>
                <p className="text-slate-900">{feedback.suggestedAnswer}</p>
            </div>
        </div>
    )
}

function WriteChallengeView({
    courseId,
    moduleTitle,
    lessonTitle,
    practiceHref,
    challenge,
    answer,
    setAnswer,
    onComplete,
}: {
    courseId: string
    moduleTitle: string
    lessonTitle: string
    practiceHref: string
    challenge: Extract<SkillChallenge, { type: 'write' }>
    answer: string
    setAnswer: (value: string) => void
    onComplete: (completion: ChallengeCompletion) => void
}) {
    const [draftFeedback, setDraftFeedback] = useState<WriteFeedback | undefined>()
    const [finalFeedback, setFinalFeedback] = useState<WriteFeedback | undefined>()
    const [requestError, setRequestError] = useState<string | undefined>()
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [lastRequestedStage, setLastRequestedStage] =
        useState<'draft' | 'final'>('draft')

    useEffect(() => {
        setDraftFeedback(undefined)
        setFinalFeedback(undefined)
        setRequestError(undefined)
        setIsSubmitting(false)
        setLastRequestedStage('draft')
    }, [challenge.id])

    async function requestWriteFeedback(stage: 'draft' | 'final') {
        if (normalizeText(answer).length === 0) {
            return
        }

        setLastRequestedStage(stage)
        setIsSubmitting(true)
        setRequestError(undefined)

        try {
            const response = await fetch('/api/write-feedback', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    courseId,
                    practiceHref,
                    challengeId: challenge.id,
                    answer,
                    stage,
                }),
            })
            const payload = (await response.json()) as
                | WriteFeedback
                | { error?: string }

            if (!response.ok) {
                throw new Error(
                    'error' in payload && payload.error
                        ? payload.error
                        : 'Unable to review this writing task right now.'
                )
            }

            if ('refusal' in payload && payload.refusal) {
                throw new Error(payload.refusal)
            }

            if (stage === 'draft') {
                setDraftFeedback(payload as WriteFeedback)
                return
            }

            setFinalFeedback(payload as WriteFeedback)
        } catch (error) {
            setRequestError(
                error instanceof Error
                    ? error.message
                    : 'Unable to review this writing task right now.'
            )
        } finally {
            setIsSubmitting(false)
        }
    }

    const isLocked = isSubmitting || finalFeedback !== undefined

    return (
        <div className="space-y-6">
            <div className="space-y-3">
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">
                    {challenge.instruction}
                </p>
                <div className="space-y-3 rounded-2xl border border-[#c8dbfb] bg-[#f6faff] p-5">
                    {challenge.promptLines.map((line) => (
                        <p key={line} className="text-lg text-slate-900">
                            {line}
                        </p>
                    ))}
                </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-[#d6e6fb] bg-white p-5">
                <div className="space-y-1">
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#4189dd]">
                        Required targets
                    </p>
                    <p className="text-sm text-slate-600">
                        Use all five targets before you submit the final version.
                    </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                    {challenge.requirements.map((requirement) => (
                        <div
                            key={requirement.id}
                            className="rounded-2xl border border-[#dceafe] bg-[#f8fbff] p-4"
                        >
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#1f5ea6] ring-1 ring-[#d6e6fb]">
                                    {requirement.kind === 'word'
                                        ? 'Word'
                                        : 'Structure'}
                                </span>
                                <p className="font-semibold text-slate-900">
                                    {requirement.label}
                                </p>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-slate-600">
                                {requirement.explanation}
                            </p>
                            <p className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                                Target forms: {requirement.expectedForms.join(' / ')}
                            </p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="space-y-3">
                <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">
                        Your Somali draft
                    </label>
                    {draftFeedback && !finalFeedback && (
                        <p className="text-sm text-slate-500">
                            Revise your draft using the feedback, then submit the
                            final version for a 1-5 grade.
                        </p>
                    )}
                </div>
                <textarea
                    value={answer}
                    disabled={isLocked}
                    onChange={(event) => setAnswer(event.target.value)}
                    placeholder={challenge.placeholder}
                    rows={8}
                    className="w-full rounded-2xl border border-[#aac8f3] px-4 py-3 text-lg text-slate-900 outline-none transition focus:border-[#4189dd]"
                />
            </div>

            {!draftFeedback && !finalFeedback && (
                <Button
                    disabled={isSubmitting || normalizeText(answer).length === 0}
                    onClick={() => {
                        void requestWriteFeedback('draft')
                    }}
                >
                    {isSubmitting ? 'Reviewing draft...' : 'Get draft feedback'}
                </Button>
            )}

            {requestError && (
                <FeedbackPanel
                    state="incorrect"
                    message="Writing feedback is not available yet."
                    supportingText={requestError}
                    primaryLabel="Try again"
                    onPrimary={() => {
                        setRequestError(undefined)
                        void requestWriteFeedback(lastRequestedStage)
                    }}
                    secondaryLabel="Keep editing"
                    onSecondary={() => setRequestError(undefined)}
                />
            )}

            {draftFeedback && !finalFeedback && (
                <>
                    <WriteFeedbackPanel
                        title="Draft feedback"
                        feedback={draftFeedback}
                    />
                    <div className="flex flex-wrap gap-3">
                        <Button
                            variant="outline"
                            disabled={isSubmitting || normalizeText(answer).length === 0}
                            onClick={() => {
                                void requestWriteFeedback('draft')
                            }}
                        >
                            {isSubmitting
                                ? 'Refreshing feedback...'
                                : 'Refresh draft feedback'}
                        </Button>
                        <Button
                            disabled={isSubmitting || normalizeText(answer).length === 0}
                            onClick={() => {
                                void requestWriteFeedback('final')
                            }}
                        >
                            {isSubmitting
                                ? 'Scoring final version...'
                                : 'Submit final version'}
                        </Button>
                    </div>
                </>
            )}

            {finalFeedback && (
                <div className="space-y-4">
                    <WriteFeedbackPanel
                        title="Final writing assessment"
                        feedback={finalFeedback}
                    />
                    <div className="flex flex-wrap gap-3">
                        <Button
                            onClick={() =>
                                onComplete({
                                    solved: (finalFeedback.score ?? 0) >= 3,
                                    firstTry: false,
                                    attempts: 2,
                                    points: (finalFeedback.score ?? 1) * 4,
                                })
                            }
                        >
                            Continue
                        </Button>
                    </div>
                    <LessonFeedback
                        courseId={courseId}
                        moduleTitle={moduleTitle}
                        lessonTitle={lessonTitle}
                        practiceHref={practiceHref}
                    />
                </div>
            )}
        </div>
    )
}

function ConversationFeedbackPanel({
    feedback,
}: {
    feedback: ConversationTurnFeedback
}) {
    return (
        <div className="space-y-4 rounded-2xl border border-[#b7d4fb] bg-[#eef6ff] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-lg font-semibold text-[#2f6db8]">
                    Reply feedback
                </p>
                <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-[#1f5ea6] shadow-sm">
                    {feedback.score}/5
                </span>
            </div>

            <p className="text-slate-700">{feedback.summary}</p>

            <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#4189dd]">
                        What worked
                    </p>
                    {feedback.strengths.length > 0 ? (
                        <ul className="space-y-2 text-slate-700">
                            {feedback.strengths.map((item) => (
                                <li key={item}>- {item}</li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-slate-600">
                            Your reply matched the conversation well enough to continue.
                        </p>
                    )}
                </div>
                <div className="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#4189dd]">
                        Tighten this up
                    </p>
                    {feedback.improvements.length > 0 ? (
                        <ul className="space-y-2 text-slate-700">
                            {feedback.improvements.map((item) => (
                                <li key={item}>- {item}</li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-slate-600">
                            No major fix is needed before the next turn.
                        </p>
                    )}
                </div>
            </div>

            <div className="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#4189dd]">
                    Strong Somali reply
                </p>
                <p className="text-slate-900">{feedback.suggestedReply}</p>
            </div>
        </div>
    )
}

type ConversationTranscriptTurn = {
    turnId: string
    partnerMessage: string
    partnerMessageHint: string
    learnerReply: string
}

function ConversationTranscript({
    turns,
    currentTurn,
    currentAnswer,
}: {
    turns: ConversationTranscriptTurn[]
    currentTurn: Extract<SkillChallenge, { type: 'conversation' }>['turns'][number]
    currentAnswer: string
}) {
    const trimmedCurrentAnswer = currentAnswer.trim()

    return (
        <div className="space-y-4 rounded-2xl border border-[#d6e6fb] bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#4189dd]">
                    Conversation so far
                </p>
                <span className="text-xs uppercase tracking-[0.16em] text-slate-500">
                    Hover or tap Somali for meaning
                </span>
            </div>

            <div className="space-y-3">
                {turns.map((turn) => (
                    <div key={turn.turnId} className="space-y-3">
                        <div className="flex justify-start">
                            <div className="max-w-[85%] rounded-2xl bg-[#f8fbff] p-4">
                                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#4189dd]">
                                    Somali partner
                                </p>
                                <MeaningTooltip
                                    text={turn.partnerMessage}
                                    meaning={turn.partnerMessageHint}
                                    align="left"
                                    className="w-full text-left text-base text-slate-900 underline decoration-dotted underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4189dd] focus-visible:ring-offset-2"
                                    tooltipClassName="max-w-[min(28rem,calc(100vw-3rem))]"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <div className="max-w-[85%] rounded-2xl bg-[#eef6ff] p-4">
                                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#4189dd]">
                                    Your reply
                                </p>
                                <p className="text-base text-slate-900">
                                    {turn.learnerReply}
                                </p>
                            </div>
                        </div>
                    </div>
                ))}

                <div className="space-y-3 border-t border-[#e7effb] pt-3">
                    <div className="flex justify-start">
                        <div className="max-w-[85%] rounded-2xl bg-[#f8fbff] p-4">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#4189dd]">
                                Somali partner
                            </p>
                            <MeaningTooltip
                                text={currentTurn.partnerMessage}
                                meaning={currentTurn.partnerMessageHint}
                                align="left"
                                className="w-full text-left text-base text-slate-900 underline decoration-dotted underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4189dd] focus-visible:ring-offset-2"
                                tooltipClassName="max-w-[min(28rem,calc(100vw-3rem))]"
                            />
                        </div>
                    </div>

                    {trimmedCurrentAnswer.length > 0 && (
                        <div className="flex justify-end">
                            <div className="max-w-[85%] rounded-2xl border border-[#bfd7f8] bg-white p-4">
                                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                    Your draft
                                </p>
                                <p className="text-base text-slate-900">
                                    {trimmedCurrentAnswer}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

function ConversationChallengeView({
    challenge,
    courseId,
    practiceHref,
    answer,
    setAnswer,
    onComplete,
}: {
    challenge: Extract<SkillChallenge, { type: 'conversation' }>
    courseId: string
    practiceHref: string
    answer: string
    setAnswer: (value: string) => void
    onComplete: (completion: ChallengeCompletion) => void
}) {
    const [turnIndex, setTurnIndex] = useState(0)
    const [turnFeedback, setTurnFeedback] =
        useState<ConversationTurnFeedback | undefined>()
    const [turnScores, setTurnScores] = useState<number[]>([])
    const [transcriptTurns, setTranscriptTurns] = useState<ConversationTranscriptTurn[]>(
        []
    )
    const [requestError, setRequestError] = useState<string | undefined>()
    const [isSubmitting, setIsSubmitting] = useState(false)

    useEffect(() => {
        setTurnIndex(0)
        setTurnFeedback(undefined)
        setTurnScores([])
        setTranscriptTurns([])
        setRequestError(undefined)
        setIsSubmitting(false)
    }, [challenge.id])

    const currentTurn = challenge.turns[turnIndex]
    const isLastTurn = turnIndex >= challenge.turns.length - 1
    const isLocked = isSubmitting || turnFeedback !== undefined

    async function submitReply() {
        if (normalizeText(answer).length === 0) {
            return
        }

        setIsSubmitting(true)
        setRequestError(undefined)

        try {
            const response = await fetch('/api/conversation-feedback', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    courseId,
                    practiceHref,
                    challengeId: challenge.id,
                    turnId: currentTurn.id,
                    answer,
                }),
            })
            const payload = (await response.json()) as
                | ConversationTurnFeedback
                | { error?: string }

            if (!response.ok) {
                throw new Error(
                    'error' in payload && payload.error
                        ? payload.error
                        : 'Unable to review this reply right now.'
                )
            }

            if ('refusal' in payload && payload.refusal) {
                throw new Error(payload.refusal)
            }

            setTurnFeedback(payload as ConversationTurnFeedback)
        } catch (error) {
            setRequestError(
                error instanceof Error
                    ? error.message
                    : 'Unable to review this reply right now.'
            )
        } finally {
            setIsSubmitting(false)
        }
    }

    function advanceConversation() {
        if (!turnFeedback) {
            return
        }

        const nextScores = [...turnScores, turnFeedback.score]
        const nextTranscriptTurns = [
            ...transcriptTurns,
            {
                turnId: currentTurn.id,
                partnerMessage: currentTurn.partnerMessage,
                partnerMessageHint: currentTurn.partnerMessageHint,
                learnerReply: answer.trim(),
            },
        ]

        if (isLastTurn) {
            const averageScore =
                nextScores.reduce((sum, score) => sum + score, 0) /
                Math.max(nextScores.length, 1)

            onComplete({
                solved: averageScore >= 3,
                firstTry: false,
                attempts: challenge.turns.length,
                points: Math.round(averageScore * 3),
            })
            return
        }

        setTurnScores(nextScores)
        setTranscriptTurns(nextTranscriptTurns)
        setTurnIndex(turnIndex + 1)
        setTurnFeedback(undefined)
        setRequestError(undefined)
        setAnswer('')
    }

    return (
        <div className="space-y-6">
            <div className="space-y-3">
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">
                    {challenge.instruction}
                </p>
                {challenge.introductionLines && challenge.introductionLines.length > 0 && (
                    <div className="space-y-2 rounded-2xl border border-[#c8dbfb] bg-[#f6faff] p-5">
                        {challenge.introductionLines.map((line) => (
                            <p key={line} className="text-sm leading-6 text-slate-700">
                                {line}
                            </p>
                        ))}
                    </div>
                )}
            </div>

            <ConversationTranscript
                turns={transcriptTurns}
                currentTurn={currentTurn}
                currentAnswer={answer}
            />

            <div className="rounded-2xl border border-[#d6e6fb] bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#4189dd]">
                        Somali message
                    </p>
                    <span className="text-xs uppercase tracking-[0.16em] text-slate-500">
                        Hover or tap for meaning
                    </span>
                </div>
                <div className="mt-3">
                    <MeaningTooltip
                        text={currentTurn.partnerMessage}
                        meaning={currentTurn.partnerMessageHint}
                        align="left"
                        className="w-full rounded-2xl bg-[#f8fbff] p-4 text-left text-xl text-slate-900 underline decoration-dotted underline-offset-4 transition hover:bg-[#eef6ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4189dd] focus-visible:ring-offset-2"
                        tooltipClassName="max-w-[min(28rem,calc(100vw-3rem))]"
                    />
                </div>
                <div className="mt-4 space-y-1">
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#4189dd]">
                        Reply in Somali
                    </p>
                    <p className="text-base text-slate-700">
                        {currentTurn.englishReplyPrompt}
                    </p>
                </div>
            </div>

            <div className="space-y-3">
                <label className="text-sm font-medium text-slate-700">
                    Your Somali reply
                </label>
                <textarea
                    value={answer}
                    disabled={isLocked}
                    onChange={(event) => setAnswer(event.target.value)}
                    placeholder={challenge.placeholder}
                    rows={4}
                    className="w-full rounded-2xl border border-[#aac8f3] px-4 py-3 text-lg text-slate-900 outline-none transition focus:border-[#4189dd]"
                />
            </div>

            {!turnFeedback && (
                <Button
                    disabled={isSubmitting || normalizeText(answer).length === 0}
                    onClick={() => {
                        void submitReply()
                    }}
                >
                    {isSubmitting ? 'Checking reply...' : 'Send reply'}
                </Button>
            )}

            {requestError && (
                <FeedbackPanel
                    state="incorrect"
                    message="Conversation feedback is not available yet."
                    supportingText={requestError}
                    primaryLabel="Try again"
                    onPrimary={() => {
                        setRequestError(undefined)
                        void submitReply()
                    }}
                    secondaryLabel="Keep editing"
                    onSecondary={() => setRequestError(undefined)}
                />
            )}

            {turnFeedback && (
                <div className="space-y-4">
                    <ConversationFeedbackPanel feedback={turnFeedback} />
                    <Button onClick={advanceConversation}>
                        {isLastTurn ? 'Complete conversation' : 'Next response'}
                    </Button>
                </div>
            )}
        </div>
    )
}

function GrammarTableGrid({
    columnHeaders,
    rows,
    answers,
    lockedRowIds,
    feedbackState,
    editable,
    onAnswerChange,
}: {
    columnHeaders: Extract<SkillChallenge, { type: 'grammarTable' }>['columnHeaders']
    rows: GrammarTableRow[]
    answers: Record<string, string>
    lockedRowIds: string[]
    feedbackState: ChallengeFeedbackState
    editable: boolean
    onAnswerChange?: (rowId: string, value: string) => void
}) {
    const lockedRowSet = new Set(lockedRowIds)

    return (
        <div className="overflow-x-auto rounded-2xl border border-[#d6e6fb]">
            <div className="grid min-w-[560px] grid-cols-[minmax(90px,0.7fr)_minmax(180px,1fr)_minmax(220px,1.1fr)] gap-px bg-[#d6e6fb] text-sm">
                <div className="bg-[#eef6ff] px-4 py-3 font-semibold text-slate-700">
                    {columnHeaders.label}
                </div>
                <div className="bg-[#eef6ff] px-4 py-3 font-semibold text-slate-700">
                    {columnHeaders.prompt}
                </div>
                <div className="bg-[#eef6ff] px-4 py-3 font-semibold text-slate-700">
                    {columnHeaders.answer}
                </div>

                {rows.map((row) => {
                    const isRowLocked = lockedRowSet.has(row.id)
                    const isRowRevealed = feedbackState === 'revealed'
                    const shouldShowAnswer =
                        !editable || isRowLocked || isRowRevealed
                    const rowValue = shouldShowAnswer
                        ? row.answers[0]
                        : answers[row.id] ?? ''
                    const acceptedAnswers = row.answers.join(' / ')
                    let answerStateClasses =
                        'border-[#aac8f3] bg-white text-slate-900'

                    if (!editable) {
                        answerStateClasses =
                            'border-[#9dc1f2] bg-[#f8fbff] text-slate-800'
                    } else if (isRowRevealed) {
                        answerStateClasses =
                            'border-slate-300 bg-slate-50 text-slate-800'
                    } else if (isRowLocked) {
                        answerStateClasses =
                            'border-[#6aa5ea] bg-[#eef6ff] text-[#1d5ea8]'
                    }

                    return (
                        <div className="contents" key={row.id}>
                            <div className="bg-white px-4 py-4 font-medium text-slate-900">
                                {row.label}
                            </div>
                            <div className="bg-white px-4 py-4 text-slate-700">
                                {row.prompt}
                            </div>
                            <div className="bg-white px-4 py-3">
                                <input
                                    value={rowValue}
                                    disabled={!editable || isRowLocked}
                                    onChange={(event) =>
                                        onAnswerChange?.(row.id, event.target.value)
                                    }
                                    placeholder="Type the Somali form"
                                    className={[
                                        'w-full rounded-xl border px-3 py-2 text-base outline-none transition focus:border-[#4189dd]',
                                        answerStateClasses,
                                    ].join(' ')}
                                />
                                {shouldShowAnswer && (
                                    <p className="mt-2 text-xs text-slate-500">
                                        Accepted: {acceptedAnswers}
                                    </p>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

function GrammarTableChallengeView({
    challenge,
    answers,
    setAnswers,
    lockedRowIds,
    setLockedRowIds,
    feedbackState,
    setFeedbackState,
    attemptCount,
    setAttemptCount,
    onComplete,
}: {
    challenge: Extract<SkillChallenge, { type: 'grammarTable' }>
    answers: Record<string, string>
    setAnswers: (value: Record<string, string>) => void
    lockedRowIds: string[]
    setLockedRowIds: (value: string[]) => void
    feedbackState: ChallengeFeedbackState
    setFeedbackState: (value: ChallengeFeedbackState) => void
    attemptCount: number
    setAttemptCount: (value: number) => void
    onComplete: (completion: ChallengeCompletion) => void
}) {
    const [phase, setPhase] = useState<'lesson' | 'practice'>('lesson')
    const [slideIndex, setSlideIndex] = useState(0)
    const practiceRows = challenge.practiceRows ?? challenge.rows
    const lessonSlides: GrammarLessonSlide[] =
        challenge.lessonSlides && challenge.lessonSlides.length > 0
            ? challenge.lessonSlides
            : [
                  {
                      id: `${challenge.id}-overview`,
                      title: 'Read the pattern first',
                      description:
                          'Study the examples before you answer. Look at how the Somali form changes by row, then switch into recall mode and apply the same idea from memory.',
                      focusPoints: [
                          'Read the worked example aloud once.',
                          'Notice what changes from one row to the next.',
                          'Practice starts after the lesson screens.',
                      ],
                      rows: challenge.rows,
                  },
              ]
    const currentSlide = lessonSlides[slideIndex]
    const isLastSlide = slideIndex >= lessonSlides.length - 1
    const lockedRowSet = new Set(lockedRowIds)
    const unresolvedRows = practiceRows.filter((row) => !lockedRowSet.has(row.id))
    const canCheck =
        unresolvedRows.length > 0 &&
        unresolvedRows.every(
            (row) => normalizeText(answers[row.id] ?? '').length > 0
        )
    const isLocked = feedbackState === 'correct' || feedbackState === 'revealed'

    useEffect(() => {
        setPhase('lesson')
        setSlideIndex(0)
    }, [challenge.id])

    function getCorrectRowIds() {
        return practiceRows
            .filter((row) => {
                if (lockedRowSet.has(row.id)) {
                    return true
                }

                const normalizedAnswer = normalizeText(answers[row.id] ?? '')
                return (
                    normalizedAnswer.length > 0 &&
                    matchesAcceptedAnswer(answers[row.id] ?? '', row.answers)
                )
            })
            .map((row) => row.id)
    }

    const correctRowCount = lockedRowIds.length

    return (
        <div className="space-y-6">
            <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">
                        Grammar lesson
                    </p>
                    <div className="rounded-full bg-[#eef6ff] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#215b9e]">
                        {phase === 'lesson'
                            ? `Lesson ${slideIndex + 1} of ${lessonSlides.length}`
                            : 'Practice mode'}
                    </div>
                </div>
                <div className="rounded-2xl border border-[#c8dbfb] bg-[#f6faff] p-6">
                    <p className="text-2xl font-semibold text-slate-900">
                        {challenge.tableTitle ?? challenge.instruction}
                    </p>
                    <p className="mt-3 text-base leading-7 text-slate-600">
                        {challenge.instruction}
                    </p>
                </div>
            </div>

            {phase === 'lesson' ? (
                <div className="space-y-5">
                    <div className="rounded-2xl border border-[#b7d4fb] bg-white p-5">
                        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#215b9e]">
                            {currentSlide.title}
                        </p>
                        <p className="mt-3 text-base leading-7 text-slate-700">
                            {currentSlide.description}
                        </p>
                        {currentSlide.focusPoints &&
                            currentSlide.focusPoints.length > 0 && (
                                <div className="mt-4 grid gap-3 md:grid-cols-3">
                                    {currentSlide.focusPoints.map((point) => (
                                        <div
                                            key={point}
                                            className="rounded-2xl border border-[#d6e6fb] bg-[#f8fbff] px-4 py-3 text-sm leading-6 text-slate-700"
                                        >
                                            {point}
                                        </div>
                                    ))}
                                </div>
                            )}
                    </div>

                    {currentSlide.rows && currentSlide.rows.length > 0 && (
                        <GrammarTableGrid
                            columnHeaders={challenge.columnHeaders}
                            rows={currentSlide.rows}
                            answers={{}}
                            lockedRowIds={currentSlide.rows.map((row) => row.id)}
                            feedbackState={undefined}
                            editable={false}
                        />
                    )}

                    <div className="flex flex-wrap items-center gap-3">
                        <Button
                            variant="outline"
                            disabled={slideIndex === 0}
                            onClick={() =>
                                setSlideIndex(Math.max(0, slideIndex - 1))
                            }
                        >
                            Previous
                        </Button>
                        <Button
                            onClick={() => {
                                if (isLastSlide) {
                                    setPhase('practice')
                                    return
                                }

                                setSlideIndex(slideIndex + 1)
                            }}
                        >
                            {isLastSlide ? 'Start practice' : 'Next lesson'}
                        </Button>
                        <p className="text-sm text-slate-600">
                            {isLastSlide
                                ? `You will answer ${practiceRows.length} fresh prompts from memory, with correct rows locking in as you go.`
                                : 'Move through the explanation before you switch into graded recall.'}
                        </p>
                    </div>
                </div>
            ) : (
                <div className="space-y-6">
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#d6e6fb] bg-white px-5 py-4">
                        <p className="text-sm leading-6 text-slate-700">
                            Fill the Somali column from memory. These prompts
                            apply the pattern you just studied rather than
                            replaying the lesson screen word for word, and
                            correct rows stay locked so you can focus on the
                            ones still in progress.
                        </p>
                        <Button variant="outline" onClick={() => setPhase('lesson')}>
                            Review pattern
                        </Button>
                    </div>

                    <GrammarTableGrid
                        columnHeaders={challenge.columnHeaders}
                        rows={practiceRows}
                        answers={answers}
                        lockedRowIds={lockedRowIds}
                        feedbackState={feedbackState}
                        editable={!isLocked}
                        onAnswerChange={(rowId, value) =>
                            setAnswers({
                                ...answers,
                                [rowId]: value,
                            })
                        }
                    />

                    {feedbackState === undefined && (
                        <Button
                            disabled={!canCheck}
                            onClick={() => {
                                const nextLockedRowIds = getCorrectRowIds()

                                if (
                                    nextLockedRowIds.length === practiceRows.length
                                ) {
                                    setLockedRowIds(nextLockedRowIds)
                                    setFeedbackState('correct')
                                    return
                                }

                                setLockedRowIds(nextLockedRowIds)
                                setFeedbackState('incorrect')
                                setAttemptCount(attemptCount + 1)
                            }}
                        >
                            Check table
                        </Button>
                    )}

                    {feedbackState === 'correct' && (
                        <AutoAdvanceNotice
                            active
                            message={`Table complete. +${getChallengeScore(challenge, attemptCount)} XP`}
                            onAdvance={() =>
                                onComplete({
                                    solved: true,
                                    firstTry: attemptCount === 1,
                                    attempts: attemptCount,
                                    points: getChallengeScore(
                                        challenge,
                                        attemptCount
                                    ),
                                })
                            }
                        />
                    )}

                    {feedbackState === 'incorrect' && (
                        <FeedbackPanel
                            state="incorrect"
                            message="Some rows still need work."
                            supportingText={`${correctRowCount} of ${practiceRows.length} rows are locked in. Update the remaining Somali forms or reveal the full table.`}
                            primaryLabel="Reveal table"
                            onPrimary={() => {
                                setLockedRowIds(practiceRows.map((row) => row.id))
                                setAnswers(
                                    Object.fromEntries(
                                        practiceRows.map((row) => [
                                            row.id,
                                            row.answers[0],
                                        ])
                                    )
                                )
                                setFeedbackState('revealed')
                            }}
                            secondaryLabel="Keep editing"
                            onSecondary={() => setFeedbackState(undefined)}
                        />
                    )}

                    {feedbackState === 'revealed' && (
                        <FeedbackPanel
                            state="revealed"
                            message="Grammar table revealed"
                            supportingText="Use the filled table as a quick reference, then move on."
                            primaryLabel="Next challenge"
                            onPrimary={() =>
                                onComplete({
                                    solved: false,
                                    firstTry: false,
                                    attempts: attemptCount,
                                    points: 0,
                                })
                            }
                        />
                    )}

                </div>
            )}
        </div>
    )
}

function createEmptyProgress(): StoredSkillProgress {
    return {
        courseId: '',
        practiceHref: '',
        skillTitle: '',
        moduleTitle: '',
        totalChallengesCompleted: 0,
        totalAttempts: 0,
        totalSolved: 0,
        firstTrySolved: 0,
        totalPoints: 0,
        completedRuns: 0,
        bestRunScore: 0,
        lastRunScore: 0,
        bestAccuracy: 0,
        lastAccuracy: 0,
        bestStreak: 0,
        lastPlayedAt: '',
    }
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
        dailyGoal: 2,
        todayGoalReached: false,
    }
}

export default function PracticeRunner(props: Props) {
    const {
        courseId,
        practiceHref,
        courseLanguageName,
        moduleTitle,
        skillTitle,
        challengeSet,
        moduleChallengePool,
        backUrl,
    } = props

    const [sessionState, setSessionState] = useState(() => {
        const seed = createSessionSeed()

        return {
            seed,
            challenges: buildPracticeSession(challengeSet.challenges, seed),
        }
    })
    const [currentIndex, setCurrentIndex] = useState(0)
    const [selectedOption, setSelectedOption] = useState<string | undefined>()
    const [selectedChipIndexes, setSelectedChipIndexes] = useState<number[]>([])
    const [textAnswer, setTextAnswer] = useState('')
    const [grammarTableAnswers, setGrammarTableAnswers] = useState<
        Record<string, string>
    >({})
    const [lockedGrammarRows, setLockedGrammarRows] = useState<string[]>([])
    const [feedbackState, setFeedbackState] =
        useState<ChallengeFeedbackState>()
    const [attemptCount, setAttemptCount] = useState(1)
    const [completedCount, setCompletedCount] = useState(0)
    const [trackedCompletedCount, setTrackedCompletedCount] = useState(0)
    const [solvedCount, setSolvedCount] = useState(0)
    const [sessionPoints, setSessionPoints] = useState(0)
    const [streak, setStreak] = useState(0)
    const [bestSessionStreak, setBestSessionStreak] = useState(0)
    const [savedProgress, setSavedProgress] = useState<StoredSkillProgress>(
        createEmptyProgress()
    )
    const [courseProgress, setCourseProgress] = useState<CourseProgressSummary>(
        createEmptyCourseSummary()
    )

    const currentChallenge = sessionState.challenges[currentIndex]

    useEffect(() => {
        const refresh = () => {
            const storedProgress = getSkillProgress(courseId, practiceHref)
            setSavedProgress(
                storedProgress ?? {
                    ...createEmptyProgress(),
                    courseId,
                    practiceHref,
                    skillTitle,
                    moduleTitle,
                }
            )
            setCourseProgress(summarizeStoredCourseProgress(courseId))
        }

        refresh()

        window.addEventListener('storage', refresh)
        window.addEventListener(getProgressEventName(), refresh)

        return () => {
            window.removeEventListener('storage', refresh)
            window.removeEventListener(getProgressEventName(), refresh)
        }
    }, [courseId, moduleTitle, practiceHref, skillTitle])

    function resetInteraction() {
        setSelectedOption(undefined)
        setSelectedChipIndexes([])
        setTextAnswer('')
        setGrammarTableAnswers({})
        setLockedGrammarRows([])
        setFeedbackState(undefined)
        setAttemptCount(1)
    }

    function completeChallenge(completion: ChallengeCompletion) {
        const updatesProgress = completion.updatesProgress ?? true
        const awardsPoints = completion.awardsPoints ?? true
        const completionTimestamp = new Date()
        const nextCompletedCount = completedCount + 1
        const nextTrackedCompletedCount =
            trackedCompletedCount + (updatesProgress ? 1 : 0)
        const nextSolvedCount =
            solvedCount + (updatesProgress && completion.solved ? 1 : 0)
        const nextSessionPoints =
            sessionPoints + (awardsPoints ? completion.points : 0)
        const nextStreak = updatesProgress
            ? (completion.firstTry ? streak + 1 : 0)
            : streak
        const nextBestSessionStreak = updatesProgress
            ? Math.max(bestSessionStreak, nextStreak)
            : bestSessionStreak
        const isFinalChallenge =
            currentIndex + 1 >= sessionState.challenges.length
        const existingProgress = getSkillProgress(courseId, practiceHref) ?? {
            ...createEmptyProgress(),
            courseId,
            practiceHref,
            skillTitle,
            moduleTitle,
        }
        const nextAccuracy =
            nextTrackedCompletedCount === 0
                ? existingProgress.lastAccuracy
                : Math.round(
                      (nextSolvedCount / nextTrackedCompletedCount) * 100
                  )

        const updatedProgress: StoredSkillProgress = {
            ...existingProgress,
            totalChallengesCompleted:
                existingProgress.totalChallengesCompleted + (updatesProgress ? 1 : 0),
            totalAttempts:
                existingProgress.totalAttempts + (updatesProgress ? completion.attempts : 0),
            totalSolved:
                existingProgress.totalSolved +
                (updatesProgress && completion.solved ? 1 : 0),
            firstTrySolved:
                existingProgress.firstTrySolved +
                (updatesProgress && completion.firstTry ? 1 : 0),
            totalPoints: existingProgress.totalPoints + (awardsPoints ? completion.points : 0),
            completedRuns:
                existingProgress.completedRuns + (isFinalChallenge ? 1 : 0),
            bestRunScore: Math.max(
                existingProgress.bestRunScore,
                nextSessionPoints
            ),
            lastRunScore: nextSessionPoints,
            bestAccuracy: Math.max(existingProgress.bestAccuracy, nextAccuracy),
            lastAccuracy: nextAccuracy,
            bestStreak: Math.max(
                existingProgress.bestStreak,
                nextBestSessionStreak
            ),
            lastPlayedAt: completionTimestamp.toISOString(),
        }

        saveSkillProgress(updatedProgress, {
            recordExerciseCompletion: updatesProgress,
            completedAt: completionTimestamp,
        })
        setSavedProgress(updatedProgress)
        setCourseProgress(summarizeStoredCourseProgress(courseId))
        setCompletedCount(nextCompletedCount)
        setTrackedCompletedCount(nextTrackedCompletedCount)
        setSolvedCount(nextSolvedCount)
        setSessionPoints(nextSessionPoints)
        setStreak(nextStreak)
        setBestSessionStreak(nextBestSessionStreak)
        resetInteraction()
        setCurrentIndex(currentIndex + 1)
    }

    const topBar = (
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Link
                href={backUrl}
                className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-semibold text-[#1f5ea6] shadow-sm ring-1 ring-[#dbe9fd] sm:gap-3 sm:px-4 sm:text-sm"
            >
                <Image
                    src="/mascot/logo1.png"
                    alt="Back to course"
                    width={36}
                    height={36}
                    className="h-9 w-9 object-contain"
                />
                Exit lesson
            </Link>
            <p className="w-full text-xs font-medium text-slate-600 sm:w-auto sm:text-sm">
                {moduleTitle}
            </p>
        </div>
    )

    if (currentChallenge === undefined) {
        return (
            <main className="min-h-screen bg-[linear-gradient(180deg,#f2f7ff_0%,#e7f1ff_35%,#ffffff_100%)]">
                <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10 md:gap-8 md:px-8 md:py-12">
                    {topBar}
                    <div className="rounded-[1.5rem] border border-[#bfd7f8] bg-white p-5 shadow-[0_24px_80px_-40px_rgba(65,137,221,0.45)] sm:rounded-[2rem] sm:p-8">
                        <div className="space-y-6">
                            <div className="flex flex-wrap items-center justify-between gap-6">
                                <div className="space-y-3">
                                    <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#4189dd]">
                                        Skill complete
                                    </p>
                                    <h1 className="text-3xl font-semibold text-slate-900 sm:text-4xl md:text-5xl">
                                        {skillTitle}
                                    </h1>
                                    <p className="text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
                                        You finished {completedCount} challenge
                                        {completedCount === 1 ? '' : 's'} with{' '}
                                        {sessionPoints} XP.
                                    </p>
                                    <p className="text-base leading-7 text-slate-600">
                                        {courseProgress.todayGoalReached
                                            ? `Daily streak secured. You have completed ${courseProgress.todayCompletedChallenges} exercise${courseProgress.todayCompletedChallenges === 1 ? '' : 's'} today and your streak is now ${courseProgress.currentDailyStreak} day${courseProgress.currentDailyStreak === 1 ? '' : 's'}.`
                                            : `You are ${courseProgress.todayCompletedChallenges}/${courseProgress.dailyGoal} of the way to today’s streak goal.`}
                                    </p>
                                </div>
                                <div className="flex justify-center">
                                    <LevelAvatar
                                        totalPoints={courseProgress.totalPoints}
                                        alt="Somali study avatar"
                                        width={220}
                                        height={220}
                                        className="max-w-[160px]"
                                        priority
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                                <div className="rounded-2xl bg-[#eef6ff] p-4">
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#4189dd]">
                                        Session XP
                                    </p>
                                    <p className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">
                                        {sessionPoints}
                                    </p>
                                </div>
                                <div className="rounded-2xl bg-[#eef6ff] p-4">
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#4189dd]">
                                        Solved
                                    </p>
                                    <p className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">
                                        {solvedCount}/{completedCount}
                                    </p>
                                </div>
                                <div className="rounded-2xl bg-[#eef6ff] p-4">
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#4189dd]">
                                        Combo best
                                    </p>
                                    <p className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">
                                        {bestSessionStreak}
                                    </p>
                                </div>
                                <div className="rounded-2xl bg-[#eef6ff] p-4">
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#4189dd]">
                                        Daily streak
                                    </p>
                                    <p className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">
                                        {courseProgress.currentDailyStreak}
                                    </p>
                                </div>
                            </div>
                            <LevelProgress totalPoints={courseProgress.totalPoints} />
                            <div className="flex flex-wrap gap-3">
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        const seed = createSessionSeed()

                                        resetInteraction()
                                        setCompletedCount(0)
                                        setTrackedCompletedCount(0)
                                        setSolvedCount(0)
                                        setSessionPoints(0)
                                        setStreak(0)
                                        setBestSessionStreak(0)
                                        setCurrentIndex(0)
                                        setSessionState({
                                            seed,
                                            challenges: buildPracticeSession(
                                                challengeSet.challenges,
                                                seed
                                            ),
                                        })
                                    }}
                                >
                                    Restart skill
                                </Button>
                                <Button asChild>
                                    <Link href={backUrl}>Back to course</Link>
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        )
    }

    const progressPercent =
        (currentIndex / Math.max(sessionState.challenges.length, 1)) * 100
    const cardDirection =
        currentChallenge.type === 'cards'
            ? getCardDirection(currentChallenge.id, sessionState.seed)
            : 'sourceToTarget'
    const shouldShowLessonFeedback =
        currentChallenge.type !== 'freeWriting' &&
        (feedbackState === 'correct' || feedbackState === 'revealed')

    return (
        <main className="min-h-screen bg-[linear-gradient(180deg,#f2f7ff_0%,#e7f1ff_35%,#ffffff_100%)]">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:gap-8 sm:px-6 sm:py-8 md:px-8 md:py-14">
                {topBar}
                <div className="space-y-3">
                    <div className="space-y-2">
                        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#4189dd]">
                            {courseLanguageName} practice
                        </p>
                        <h1 className="text-3xl font-semibold text-slate-900 sm:text-4xl md:text-5xl">
                            {skillTitle}
                        </h1>
                    </div>
                    <div className="flex flex-col gap-1 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                        <span>
                            Challenge {currentIndex + 1} of{' '}
                            {sessionState.challenges.length}
                        </span>
                        <span>
                            Solved: {solvedCount}/{completedCount}
                        </span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-[#d7e7fc]">
                        <div
                            className="h-full rounded-full bg-[#4189dd] transition-all"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                </div>

                <Card className="border-[#bfd7f8] bg-white shadow-[0_24px_80px_-40px_rgba(15,23,42,0.3)]">
                    <CardHeader className="space-y-4 border-b border-[#e3efff] px-5 pb-4 pt-5 sm:px-6 sm:pb-5 sm:pt-6">
                        <div className="flex flex-wrap items-center gap-3">
                            <ChallengeTypeLabel challenge={currentChallenge} />
                            <span className="text-sm text-slate-500">
                                Challenge {currentIndex + 1}
                            </span>
                        </div>
                        <CardTitle className="text-2xl text-slate-900 sm:text-3xl">
                            Practice challenge
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6 px-5 pb-5 pt-5 sm:space-y-8 sm:px-6 sm:pb-6 sm:pt-6">
                        {currentChallenge.type === 'options' && (
                            <OptionsChallengeView
                                challenge={currentChallenge}
                                challengePool={moduleChallengePool}
                                sessionSeed={sessionState.seed}
                                selectedOption={selectedOption}
                                setSelectedOption={setSelectedOption}
                                feedbackState={feedbackState}
                                setFeedbackState={setFeedbackState}
                                attemptCount={attemptCount}
                                setAttemptCount={setAttemptCount}
                                onComplete={completeChallenge}
                            />
                        )}

                        {currentChallenge.type === 'chips' && (
                            <ChipsChallengeView
                                challenge={currentChallenge}
                                sessionSeed={sessionState.seed}
                                selectedChipIndexes={selectedChipIndexes}
                                setSelectedChipIndexes={setSelectedChipIndexes}
                                feedbackState={feedbackState}
                                setFeedbackState={setFeedbackState}
                                attemptCount={attemptCount}
                                setAttemptCount={setAttemptCount}
                                onComplete={completeChallenge}
                            />
                        )}

                        {currentChallenge.type === 'cards' && (
                            <CardsChallengeView
                                challenge={currentChallenge}
                                challengePool={moduleChallengePool}
                                sessionSeed={sessionState.seed}
                                direction={cardDirection}
                                selectedOption={selectedOption}
                                setSelectedOption={setSelectedOption}
                                feedbackState={feedbackState}
                                setFeedbackState={setFeedbackState}
                                attemptCount={attemptCount}
                                setAttemptCount={setAttemptCount}
                                onComplete={completeChallenge}
                            />
                        )}

                        {currentChallenge.type === 'shortInput' && (
                            <ShortInputChallengeView
                                challenge={currentChallenge}
                                sessionSeed={sessionState.seed}
                                answer={textAnswer}
                                setAnswer={setTextAnswer}
                                feedbackState={feedbackState}
                                setFeedbackState={setFeedbackState}
                                attemptCount={attemptCount}
                                setAttemptCount={setAttemptCount}
                                onComplete={completeChallenge}
                            />
                        )}

                        {currentChallenge.type === 'grammarTable' && (
                            <GrammarTableChallengeView
                                challenge={currentChallenge}
                                answers={grammarTableAnswers}
                                setAnswers={setGrammarTableAnswers}
                                lockedRowIds={lockedGrammarRows}
                                setLockedRowIds={setLockedGrammarRows}
                                feedbackState={feedbackState}
                                setFeedbackState={setFeedbackState}
                                attemptCount={attemptCount}
                                setAttemptCount={setAttemptCount}
                                onComplete={completeChallenge}
                            />
                        )}

                        {currentChallenge.type === 'freeWriting' && (
                            <FreeWritingChallengeView
                                courseId={courseId}
                                moduleTitle={moduleTitle}
                                lessonTitle={skillTitle}
                                practiceHref={practiceHref}
                                challenge={currentChallenge}
                                answer={textAnswer}
                                setAnswer={setTextAnswer}
                                onComplete={completeChallenge}
                            />
                        )}

                        {currentChallenge.type === 'write' && (
                            <WriteChallengeView
                                courseId={courseId}
                                moduleTitle={moduleTitle}
                                lessonTitle={skillTitle}
                                practiceHref={practiceHref}
                                challenge={currentChallenge}
                                answer={textAnswer}
                                setAnswer={setTextAnswer}
                                onComplete={completeChallenge}
                            />
                        )}

                        {currentChallenge.type === 'conversation' && (
                            <ConversationChallengeView
                                challenge={currentChallenge}
                                courseId={courseId}
                                practiceHref={practiceHref}
                                answer={textAnswer}
                                setAnswer={setTextAnswer}
                                onComplete={completeChallenge}
                            />
                        )}

                        {shouldShowLessonFeedback && (
                            <LessonFeedback
                                courseId={courseId}
                                moduleTitle={moduleTitle}
                                lessonTitle={skillTitle}
                                practiceHref={practiceHref}
                            />
                        )}
                    </CardContent>
                </Card>

                <div className="overflow-hidden rounded-[1.5rem] border border-[#bfd7f8] bg-white shadow-[0_24px_80px_-40px_rgba(65,137,221,0.45)] sm:rounded-[2rem]">
                    <div className="grid gap-5 p-5 sm:gap-6 sm:p-8 md:grid-cols-[minmax(0,1fr)_180px] md:items-center md:p-10">
                        <div className="space-y-5">
                            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                                <div className="rounded-2xl bg-[#eef6ff] p-4">
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#4189dd]">
                                        Session XP
                                    </p>
                                    <p className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">
                                        {sessionPoints}
                                    </p>
                                </div>
                                <div className="rounded-2xl bg-[#eef6ff] p-4">
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#4189dd]">
                                        Combo streak
                                    </p>
                                    <p className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">
                                        {streak}
                                    </p>
                                </div>
                                <div className="rounded-2xl bg-[#eef6ff] p-4">
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#4189dd]">
                                        Daily streak
                                    </p>
                                    <p className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">
                                        {courseProgress.currentDailyStreak}
                                    </p>
                                </div>
                                <div className="rounded-2xl bg-[#eef6ff] p-4">
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#4189dd]">
                                        Today
                                    </p>
                                    <p className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">
                                        {courseProgress.todayCompletedChallenges}/
                                        {courseProgress.dailyGoal}
                                    </p>
                                    <p className="mt-1 text-xs leading-5 text-slate-500">
                                        {courseProgress.todayGoalReached
                                            ? 'Qualified for today'
                                            : 'Exercises needed for streak'}
                                    </p>
                                </div>
                            </div>
                            <LevelProgress totalPoints={courseProgress.totalPoints} />
                        </div>

                        <div className="flex justify-center md:justify-end">
                            <LevelAvatar
                                totalPoints={courseProgress.totalPoints}
                                alt="Somali study avatar"
                                width={220}
                                height={220}
                                className="max-w-[128px] sm:max-w-[160px]"
                                priority
                            />
                        </div>
                    </div>
                </div>
            </div>
        </main>
    )
}
