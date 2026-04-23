import { NextRequest, NextResponse } from 'next/server'

const SESSION_COOKIE_NAME = 'learnsomali_session'

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl

    if (pathname === '/') {
        return NextResponse.redirect(new URL('/login', request.url))
    }

    if (!pathname.startsWith('/en/courses/so')) {
        return NextResponse.next()
    }

    if (!process.env.LEARN_SOMALI_AUTH_SECRET) {
        return NextResponse.next()
    }

    if (request.cookies.has(SESSION_COOKIE_NAME)) {
        return NextResponse.next()
    }

    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)

    return NextResponse.redirect(loginUrl)
}

export const config = {
    matcher: ['/', '/en/courses/so/:path*'],
}
