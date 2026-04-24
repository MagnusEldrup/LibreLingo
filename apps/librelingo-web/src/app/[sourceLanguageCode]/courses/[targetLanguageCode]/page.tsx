import Image from 'next/image'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    getCourseDetail,
    getCourseId,
    listAvailableCourses,
} from '@/data/course'
import CourseProgressSummary from '@/components/course-progress-summary'
import CourseModuleList from '@/components/course-module-list'
import AccountPanel from '@/components/account-panel'

export const dynamic = 'force-dynamic'

export async function generateStaticParams() {
  const courses = await listAvailableCourses()

  return courses.map((course) => ({
    sourceLanguageCode: course.uiLanguage,
    targetLanguageCode: course.languageCode,
  }))
}

type Props = {
    params: {
        sourceLanguageCode: string
        targetLanguageCode: string
    }
}

export default async function CourseHomePage({params}: Props) {
  const courseId = await getCourseId(params)
  const detail = await getCourseDetail(courseId)
  const practiceHrefs = detail.modules.flatMap((courseModule) =>
      courseModule.skills.map((skill) => skill.practiceHref)
  )

  return (
      <main className="min-h-screen bg-[linear-gradient(180deg,#f2f7ff_0%,#e7f1ff_40%,#ffffff_100%)]">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:gap-8 sm:px-6 sm:py-8 md:gap-10 md:px-8 md:py-14">
              <section className="overflow-hidden rounded-[1.5rem] border border-[#bfd7f8] bg-white shadow-[0_24px_80px_-40px_rgba(65,137,221,0.45)] sm:rounded-3xl">
                  <div className="relative min-h-[160px] overflow-hidden border-b border-[#dbe9fd] sm:min-h-[220px] md:min-h-[260px]">
                      <Image
                          src="/hero_banner.png"
                          alt="Somali course banner"
                          fill
                          className="object-cover"
                          priority
                      />
                  </div>

                  <div className="p-4 sm:p-6 md:p-10">
                      <div className="mb-4 sm:mb-6">
                          <AccountPanel />
                      </div>
                      <Card className="border-[#bfd7f8] bg-[#eef6ff] shadow-none">
                          <CardHeader className="flex flex-col gap-4 border-b border-[#dbe9fd] pb-5 md:flex-row md:items-center md:justify-between">
                              <CardTitle className="text-xl text-slate-900 sm:text-2xl">
                                  Progress Overview
                              </CardTitle>
                          </CardHeader>
                          <CardContent className="pt-6">
                              <CourseProgressSummary
                                  courseId={courseId}
                                  practiceHrefs={practiceHrefs}
                              />
                          </CardContent>
                      </Card>
                  </div>
              </section>

              <CourseModuleList
                  courseId={courseId}
                  modules={detail.modules}
                  sourceLanguageCode={params.sourceLanguageCode}
                  targetLanguageCode={params.targetLanguageCode}
              />
          </div>
      </main>
  )
}
