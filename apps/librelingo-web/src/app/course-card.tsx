import Image from 'next/image'
import { Button } from '@/components/ui/button'
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card'
import { Course } from '@/data/course'
import Link from 'next/link'

type Props = {
    course: Course
}

export default function CourseCard(props: Props) {
    const { course } = props
    const coursePageUrl = `/${course.uiLanguage}/courses/${course.languageCode}`
    const moduleLabel = course.moduleCount === 1 ? 'module' : 'modules'
    const skillLabel = course.skillCount === 1 ? 'skill' : 'skills'

    return (
        <Card className="overflow-hidden border-[#bfd7f8] bg-white/95 shadow-[0_24px_80px_-50px_rgba(65,137,221,0.4)]">
            <div className="relative min-h-[180px] border-b border-[#dbe9fd]">
                <Image
                    src="/coursecard.png"
                    alt="Somali course card artwork"
                    fill
                    className="object-cover"
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.08)_0%,rgba(10,39,77,0.7)_100%)]" />
                <div className="relative flex min-h-[180px] items-end justify-between gap-4 p-6">
                    <div className="space-y-2">
                        <div className="inline-flex rounded-full bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#1f5ea6]">
                            Somali course
                        </div>
                        <CardTitle className="text-3xl text-white">
                            {course.languageName}
                        </CardTitle>
                    </div>
                    <div className="w-full max-w-[88px] shrink-0">
                        <Image
                            src="/mascot/logo1.png"
                            alt="Somali learning mascot"
                            width={120}
                            height={120}
                            className="h-auto w-full drop-shadow-[0_18px_30px_rgba(15,23,42,0.35)]"
                        />
                    </div>
                </div>
            </div>
            <CardHeader className="space-y-2">
                <CardDescription className="text-base leading-7 text-slate-600">
                    {course.description}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm text-slate-600">
                    {course.moduleCount} {moduleLabel} and {course.skillCount}{' '}
                    {skillLabel} available.
                </p>
            </CardContent>
            <CardFooter className="pt-0">
                <Button asChild>
                    <Link href={coursePageUrl}>Learn</Link>
                </Button>
            </CardFooter>
        </Card>
    )
}
