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
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-10 md:px-8 md:py-14">
              <section className="overflow-hidden rounded-3xl border border-[#bfd7f8] bg-white shadow-[0_24px_80px_-40px_rgba(65,137,221,0.45)]">
                  <div className="relative min-h-[260px] overflow-hidden border-b border-[#dbe9fd]">
                      <Image
                          src="/hero_banner.png"
                          alt="Somali course banner"
                          fill
                          className="object-cover"
                          priority
                      />
                  </div>

                  <div className="p-8 md:p-10">
                      <div className="mb-6">
                          <AccountPanel />
                      </div>
                      <Card className="border-[#bfd7f8] bg-[#eef6ff] shadow-none">
                          <CardHeader className="flex flex-col gap-4 border-b border-[#dbe9fd] pb-5 md:flex-row md:items-center md:justify-between">
                              <CardTitle className="text-2xl text-slate-900">
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
