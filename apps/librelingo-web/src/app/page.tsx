import type { Metadata } from 'next'
import Image from 'next/image'
import { Course, listAvailableCourses } from '@/data/course'
import CourseCard from './course-card'

export const metadata: Metadata = {
    title: 'LibreLingo',
    description: 'LibreLingo is an open source language-learning platform',
}

export default async function Home() {
    const courseData = await listAvailableCourses()

    return (
        <main className="min-h-screen bg-[linear-gradient(180deg,#f2f7ff_0%,#e7f1ff_40%,#ffffff_100%)]">
            <section className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10 md:px-8 md:py-14">
                <div className="overflow-hidden rounded-[2rem] border border-[#bfd7f8] bg-white shadow-[0_24px_80px_-40px_rgba(65,137,221,0.45)]">
                    <div className="grid gap-8 p-8 md:grid-cols-[1.2fr_0.8fr] md:items-center md:p-10">
                        <div className="space-y-5">
                            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#4189dd]">
                                Learn Somali
                            </p>
                            <h1 className="font-serif text-5xl leading-tight text-slate-900 md:text-6xl">
                                White, Somali blue, and real lesson progress.
                            </h1>
                            <p className="max-w-2xl text-lg leading-8 text-slate-600">
                                Pick up the Somali course, practice real generated challenges,
                                and keep building saved progress as the app grows.
                            </p>
                        </div>
                        <div className="flex justify-center md:justify-end">
                            <Image
                                src="/mascot/logo1.png"
                                alt="Somali learning mascot"
                                width={280}
                                height={280}
                                className="h-auto w-full max-w-[220px]"
                                priority
                            />
                        </div>
                    </div>
                </div>

                <ul className="flex space-y-6 flex-col">
                    {courseData.map((course) => (
                        <li key={course.id}>
                            <CourseCard course={course} />
                        </li>
                    ))}
                </ul>
            </section>
        </main>
    )
}
