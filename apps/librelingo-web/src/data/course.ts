import path from 'node:path'
import courseConfig from '@/courses/config.json'
import fs from 'node:fs'
import { notFound } from 'next/navigation'

export type CourseIdentityDescription = {
    sourceLanguageCode: string
    targetLanguageCode: string
}

export type Course = {
    id: string
    languageCode: string
    languageName: string
    uiLanguage: string
    repositoryURL: string
    inProduction: boolean
    description: string
    moduleCount: number
    skillCount: number
}

export type CourseSkill = {
    id: string
    title: string
    levels: number
    practiceHref: string
    summary: string[]
    kind?: 'standard' | 'grammar' | 'history' | 'write' | 'conversation'
}

export type CourseModule = {
    title: string
    skills: CourseSkill[]
}

export type CourseDetail = {
    id: string
    languageCode: string
    languageName: string
    uiLanguage: string
    repositoryURL: string
    moduleCount: number
    skillCount: number
    modules: CourseModule[]
}

export type DefinitionToken = {
    word: string
    definition: string
}

export type GrammarTableRow = {
    id: string
    label: string
    prompt: string
    answers: string[]
    rule?: string
}

export type GrammarLessonSlide = {
    id: string
    title: string
    description: string
    focusPoints?: string[]
    rows?: GrammarTableRow[]
}

export type FreeWritingPromptKind = 'translate' | 'guidedProduction'
export type WritingRequirementKind = 'word' | 'structure'
export type WritingRequirementStatus = 'met' | 'partial' | 'missing'

export type FreeWritingFeedback = {
    score: number
    summary: string
    strengths: string[]
    improvements: string[]
    suggestedAnswer: string
    refusal?: string
}

export type WritingRequirement = {
    id: string
    label: string
    kind: WritingRequirementKind
    expectedForms: string[]
    explanation: string
}

export type WritingRequirementCheck = {
    requirementId: string
    label: string
    status: WritingRequirementStatus
    feedback: string
}

export type WriteFeedback = {
    score?: number
    summary: string
    strengths: string[]
    improvements: string[]
    requirementChecks: WritingRequirementCheck[]
    suggestedAnswer: string
    refusal?: string
}

export type ConversationTurn = {
    id: string
    partnerMessage: string
    partnerMessageHint: string
    englishReplyPrompt: string
    expectedReplies: string[]
    sampleReply?: string
}

export type ConversationTurnFeedback = {
    score: number
    summary: string
    strengths: string[]
    improvements: string[]
    suggestedReply: string
    refusal?: string
}

export type SkillChallenge =
    | {
          type: 'options'
          id: string
          priority: number
          group: string
          formInTargetLanguage: string
          meaningInSourceLanguage: string
      }
    | {
          type: 'cards'
          id: string
          priority: number
          group: string
          pictures: string[] | null
          formInTargetLanguage: string
          meaningInSourceLanguage: string
      }
    | {
          type: 'shortInput'
          id: string
          priority: number
          group: string
          pictures: string[] | null
          formInTargetLanguage: string[]
          phrase: DefinitionToken[]
      }
    | {
          type: 'chips'
          id: string
          priority: number
          group: string
          translatesToSourceLanguage: boolean
          phrase: DefinitionToken[]
          chips: string[]
          solutions: string[][]
          formattedSolution: string
      }
    | {
          type: 'grammarTable'
          id: string
          priority: number
          group: string
          instruction: string
          tableTitle: string | null
          columnHeaders: {
              label: string
              prompt: string
              answer: string
          }
          rows: GrammarTableRow[]
          lessonSlides?: GrammarLessonSlide[]
          practiceRows?: GrammarTableRow[]
      }
    | {
          type: 'freeWriting'
          id: string
          priority: number
          group: string
          promptKind: FreeWritingPromptKind
          instruction: string
          promptLines: string[]
          placeholder: string
          gradingNotes: string[]
          sampleAnswer?: string
      }
    | {
          type: 'write'
          id: string
          priority: number
          group: string
          instruction: string
          promptLines: string[]
          placeholder: string
          requirements: WritingRequirement[]
          gradingNotes: string[]
          sampleAnswer?: string
      }
    | {
          type: 'conversation'
          id: string
          priority: number
          group: string
          instruction: string
          introductionLines?: string[]
          placeholder: string
          turns: ConversationTurn[]
          gradingNotes: string[]
      }

export type SkillChallengeFile = {
    id: string
    levels: number
    challenges: SkillChallenge[]
}

export type SkillDetail = {
    course: CourseDetail
    module: CourseModule
    skill: CourseSkill
    challengeSet: SkillChallengeFile
    moduleChallengePool: SkillChallenge[]
}

function getFullJsonPath(jsonPath: string) {
    return path.join(
        process.cwd(),
        'src',
        'courses',
        jsonPath,
        'courseData.json'
    )
}

function getFullChallengePath(jsonPath: string, practiceHref: string) {
    return path.join(
        process.cwd(),
        'src',
        'courses',
        jsonPath,
        'challenges',
        `${practiceHref}.json`
    )
}

function getFullChallengeDirectoryPath(jsonPath: string) {
    return path.join(process.cwd(), 'src', 'courses', jsonPath, 'challenges')
}

async function getCourseMetadataByJsonPath(jsonPath: string) {
    const fileContent = await fs.promises.readFile(
        getFullJsonPath(jsonPath),
        'utf8'
    )
    return JSON.parse(fileContent)
}

async function getCourseChallengeFileByJsonPath(
    jsonPath: string,
    practiceHref: string
) {
    const fileContent = await fs.promises.readFile(
        getFullChallengePath(jsonPath, practiceHref),
        'utf8'
    )
    return JSON.parse(fileContent) as SkillChallengeFile
}

function addSkillParameterIfMissing(
    skillParameters: Array<{
        sourceLanguageCode: string
        targetLanguageCode: string
        practiceHref: string
    }>,
    seenParameters: Set<string>,
    sourceLanguageCode: string,
    targetLanguageCode: string,
    practiceHref: string
) {
    const parameterKey = [
        sourceLanguageCode,
        targetLanguageCode,
        practiceHref,
    ].join('::')

    if (seenParameters.has(parameterKey)) {
        return
    }

    seenParameters.add(parameterKey)
    skillParameters.push({
        sourceLanguageCode,
        targetLanguageCode,
        practiceHref,
    })
}

export async function listAvailableCourses(): Promise<Course[]> {
    return Promise.all(
        courseConfig
            .filter((item) => {
                return (
                    item.deploy &&
                    fs.existsSync(getFullJsonPath(item.paths.jsonFolder))
                )
            })
            .map(async (item) => {
                const jsonPath = item.paths.jsonFolder
                const data = await getCourseMetadataByJsonPath(jsonPath)
                const {
                    uiLanguage,
                    languageName,
                    languageCode,
                    repositoryURL,
                    modules,
                } = data

                return {
                    id: jsonPath,
                    languageCode,
                    languageName,
                    uiLanguage,
                    repositoryURL,
                    inProduction: item.inProduction,
                    description: item.description,
                    moduleCount: modules.length,
                    skillCount: modules.reduce(
                        (total: number, courseModule: CourseModule) =>
                            total + courseModule.skills.length,
                        0
                    ),
                }
            })
    )
}

export async function getCourseId(
    parameters: CourseIdentityDescription
): Promise<string> {
    const availableCourses = await listAvailableCourses()

    const course = availableCourses.find(
        (item) =>
            item.uiLanguage === parameters.sourceLanguageCode &&
            item.languageCode === parameters.targetLanguageCode
    )

    if (course === undefined) {
        notFound()
    }

    return course.id
}

export async function getCourseDetail(courseId: string): Promise<CourseDetail> {
    const data = await getCourseMetadataByJsonPath(courseId)
    const {
        languageName,
        languageCode,
        uiLanguage,
        repositoryURL,
        modules,
    } = data
    const skillCount = modules.reduce(
        (total: number, courseModule: CourseModule) =>
            total + courseModule.skills.length,
        0
    )

    return {
        id: courseId,
        languageCode,
        languageName,
        uiLanguage,
        repositoryURL,
        moduleCount: modules.length,
        skillCount,
        modules,
    }
}

export async function listCourseSkillParameters() {
    const courses = await listAvailableCourses()
    const skillParameters: Array<{
        sourceLanguageCode: string
        targetLanguageCode: string
        practiceHref: string
    }> = []
    const seenParameters = new Set<string>()

    for (const course of courses) {
        const detail = await getCourseDetail(course.id)

        for (const courseModule of detail.modules) {
            for (const skill of courseModule.skills) {
                addSkillParameterIfMissing(
                    skillParameters,
                    seenParameters,
                    detail.uiLanguage,
                    detail.languageCode,
                    skill.practiceHref
                )
            }
        }

        const challengeDirectoryPath = getFullChallengeDirectoryPath(course.id)

        if (fs.existsSync(challengeDirectoryPath)) {
            const challengeFiles = await fs.promises.readdir(challengeDirectoryPath)

            for (const challengeFile of challengeFiles) {
                if (!challengeFile.endsWith('.json')) {
                    continue
                }

                addSkillParameterIfMissing(
                    skillParameters,
                    seenParameters,
                    detail.uiLanguage,
                    detail.languageCode,
                    challengeFile.slice(0, -'.json'.length)
                )
            }
        }
    }

    return skillParameters
}

export async function getSkillDetail(
    courseIdentity: CourseIdentityDescription,
    practiceHref: string
): Promise<SkillDetail> {
    const courseId = await getCourseId(courseIdentity)
    const course = await getCourseDetail(courseId)

    for (const courseModule of course.modules) {
        const skill = courseModule.skills.find(
            (candidate) => candidate.practiceHref === practiceHref
        )

        if (skill) {
            const [challengeSet, moduleChallengeSets] = await Promise.all([
                getCourseChallengeFileByJsonPath(courseId, practiceHref),
                Promise.all(
                    courseModule.skills.map(async (moduleSkill) =>
                        getCourseChallengeFileByJsonPath(
                            courseId,
                            moduleSkill.practiceHref
                        )
                    )
                ),
            ])

            return {
                course,
                module: courseModule,
                skill,
                challengeSet,
                moduleChallengePool: moduleChallengeSets.flatMap(
                    (challengeFile) => challengeFile.challenges
                ),
            }
        }
    }

    notFound()
}
