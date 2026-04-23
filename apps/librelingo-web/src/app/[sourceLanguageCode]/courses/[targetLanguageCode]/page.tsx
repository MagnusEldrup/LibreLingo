import Image from 'next/image'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
    getCourseDetail,
    getCourseId,
    listAvailableCourses,
} from '@/data/course'
import CourseProgressSummary from '@/components/course-progress-summary'
import Link from 'next/link'
import CourseModuleList from '@/components/course-module-list'

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
                      <div className="relative flex min-h-[260px] flex-col justify-end gap-4 p-8 md:p-10">
                          <div className="flex flex-wrap gap-3">
                              <span className="rounded-full bg-white/92 px-4 py-2 text-sm font-semibold text-[#1f5ea6]">
                                  Somali from English
                              </span>
                              <span className="rounded-full bg-[#4189dd]/90 px-4 py-2 text-sm font-semibold text-white">
                                  {detail.moduleCount} module
                                  {detail.moduleCount === 1 ? '' : 's'}
                              </span>
                              <span className="rounded-full bg-white/92 px-4 py-2 text-sm font-semibold text-slate-800">
                                  {detail.skillCount} lessons
                              </span>
                          </div>
                          <div className="flex flex-wrap items-end justify-between gap-6">
                              <div>
                                  <h1 className="font-serif text-4xl leading-tight text-white md:text-6xl">
                                      {detail.languageName}
                                  </h1>
                              </div>
                          </div>
                      </div>
                  </div>

                  <div className="p-8 md:p-10">
                      <Card className="border-[#bfd7f8] bg-[#eef6ff] shadow-none">
                          <CardHeader className="flex flex-col gap-4 border-b border-[#dbe9fd] pb-5 md:flex-row md:items-center md:justify-between">
                              <CardTitle className="text-2xl text-slate-900">
                                  Progress Overview
                              </CardTitle>
                              <Button asChild variant="outline" className="w-full md:w-auto">
                                  <Link href="/">
                                      Back to course list
                                  </Link>
                              </Button>
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
