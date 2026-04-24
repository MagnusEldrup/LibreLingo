import PracticeRunner from '@/components/practice-runner'
import { getSkillDetail, listCourseSkillParameters } from '@/data/course'

export const dynamic = 'force-dynamic'

type Props = {
    params: {
        sourceLanguageCode: string
        targetLanguageCode: string
        practiceHref: string
    }
}

export async function generateStaticParams() {
    return listCourseSkillParameters()
}

export default async function SkillPracticePage({ params }: Props) {
    const detail = await getSkillDetail(
        {
            sourceLanguageCode: params.sourceLanguageCode,
            targetLanguageCode: params.targetLanguageCode,
        },
        params.practiceHref
    )

    const backUrl = `/${params.sourceLanguageCode}/courses/${params.targetLanguageCode}`

    return (
        <PracticeRunner
            courseId={detail.course.id}
            practiceHref={detail.skill.practiceHref}
            courseLanguageName={detail.course.languageName}
            moduleTitle={detail.module.title}
            skillTitle={detail.skill.title}
            skillKind={detail.skill.kind}
            challengeSet={detail.challengeSet}
            moduleChallengePool={detail.moduleChallengePool}
            previousGrammarReviewSources={detail.previousGrammarReviewSources}
            backUrl={backUrl}
        />
    )
}
