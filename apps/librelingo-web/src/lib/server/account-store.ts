import { neon } from '@neondatabase/serverless'
import { cookies } from 'next/headers'
import {
    createHmac,
    pbkdf2,
    randomBytes,
    randomUUID,
    timingSafeEqual,
} from 'node:crypto'
import { promisify } from 'node:util'
import type { ProgressStore } from '@/lib/progress'

/* eslint-disable unicorn/template-indent */

export type AccountUser = {
    id: string
    email: string
}

const SESSION_COOKIE_NAME = 'learnsomali_session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30
const PASSWORD_ITERATIONS = 310_000
const PASSWORD_KEY_LENGTH = 32
const pbkdf2Async = promisify(pbkdf2)

let tableSetupPromise: Promise<void> | undefined
let databaseClient: ReturnType<typeof neon> | undefined

export class AccountUnavailableError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'AccountUnavailableError'
    }
}

export function getAccountUnavailableReason() {
    if (!process.env.LEARN_SOMALI_AUTH_SECRET) {
        return 'Missing LEARN_SOMALI_AUTH_SECRET.'
    }

    if (
        !process.env.DATABASE_URL &&
        !process.env.POSTGRES_URL &&
        !process.env.POSTGRES_PRISMA_URL
    ) {
        return 'Missing Postgres environment variables.'
    }

    return
}

export function assertAccountStorageConfigured() {
    const unavailableReason = getAccountUnavailableReason()

    if (unavailableReason) {
        throw new AccountUnavailableError(unavailableReason)
    }
}

export async function ensureAccountTables() {
    assertAccountStorageConfigured()
    const sql = getSql()

    tableSetupPromise ??= Promise.all([
        sql`
            CREATE TABLE IF NOT EXISTS learn_somali_users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `,
        sql`
            CREATE TABLE IF NOT EXISTS learn_somali_progress (
                user_id TEXT PRIMARY KEY REFERENCES learn_somali_users(id) ON DELETE CASCADE,
                progress_json JSONB NOT NULL DEFAULT '{"skills":{},"dailyActivityByCourse":{}}'::jsonb,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `,
    ]).then(() => {})

    return tableSetupPromise
}

export async function createAccount(email: string, password: string) {
    await ensureAccountTables()
    const sql = getSql()

    const normalizedEmail = normalizeEmail(email)
    const passwordHash = await hashPassword(password)
    const userId = randomUUID()

    await sql`
        INSERT INTO learn_somali_users (id, email, password_hash)
        VALUES (${userId}, ${normalizedEmail}, ${passwordHash})
    `
    await sql`
        INSERT INTO learn_somali_progress (user_id)
        VALUES (${userId})
    `

    return {
        id: userId,
        email: normalizedEmail,
    }
}

export async function verifyAccount(email: string, password: string) {
    await ensureAccountTables()
    const sql = getSql()

    const normalizedEmail = normalizeEmail(email)
    const result = (await sql`
        SELECT id, email, password_hash
        FROM learn_somali_users
        WHERE email = ${normalizedEmail}
    `) as Array<{
        id: string
        email: string
        password_hash: string
    }>
    const user = result[0]

    if (!user || !(await verifyPassword(password, user.password_hash))) {
        return
    }

    return {
        id: user.id,
        email: user.email,
    }
}

export async function readAccountProgress(userId: string) {
    await ensureAccountTables()
    const sql = getSql()

    const result = (await sql`
        SELECT progress_json
        FROM learn_somali_progress
        WHERE user_id = ${userId}
    `) as Array<{ progress_json: ProgressStore | string }>
    const progressJson = result[0]?.progress_json

    if (!progressJson) {
        return createEmptyProgressStore()
    }

    return typeof progressJson === 'string'
        ? (JSON.parse(progressJson) as ProgressStore)
        : progressJson
}

export async function writeAccountProgress(
    userId: string,
    progress: ProgressStore
) {
    await ensureAccountTables()
    const sql = getSql()

    await sql`
        INSERT INTO learn_somali_progress (user_id, progress_json, updated_at)
        VALUES (${userId}, ${JSON.stringify(progress)}::jsonb, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET
            progress_json = EXCLUDED.progress_json,
            updated_at = NOW()
    `
}

export function setSessionCookie(user: AccountUser) {
    const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000
    const payload = Buffer.from(
        JSON.stringify({
            userId: user.id,
            email: user.email,
            expiresAt,
        })
    ).toString('base64url')
    const signature = signSessionPayload(payload)

    cookies().set(SESSION_COOKIE_NAME, `${payload}.${signature}`, {
        httpOnly: true,
        maxAge: SESSION_MAX_AGE_SECONDS,
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
    })
}

export function clearSessionCookie() {
    cookies().set(SESSION_COOKIE_NAME, '', {
        httpOnly: true,
        maxAge: 0,
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
    })
}

export function getCurrentAccountUser() {
    const unavailableReason = getAccountUnavailableReason()

    if (unavailableReason) {
        return
    }

    const cookieValue = cookies().get(SESSION_COOKIE_NAME)?.value

    if (!cookieValue) {
        return
    }

    const [payload, signature] = cookieValue.split('.')

    if (!payload || !signature || !isValidSignature(payload, signature)) {
        return
    }

    try {
        const parsedPayload = JSON.parse(
            Buffer.from(payload, 'base64url').toString('utf8')
        ) as {
            userId?: unknown
            email?: unknown
            expiresAt?: unknown
        }

        if (
            typeof parsedPayload.userId !== 'string' ||
            typeof parsedPayload.email !== 'string' ||
            typeof parsedPayload.expiresAt !== 'number' ||
            parsedPayload.expiresAt < Date.now()
        ) {
            return
        }

        return {
            id: parsedPayload.userId,
            email: parsedPayload.email,
        }
    } catch {
        return
    }
}

export function normalizeEmail(email: string) {
    return email.trim().toLowerCase()
}

export function validateEmailAndPassword(email: string, password: string) {
    const normalizedEmail = normalizeEmail(email)

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return 'Enter a valid email address.'
    }

    if (password.length < 8) {
        return 'Password must be at least 8 characters.'
    }

    return
}

function createEmptyProgressStore(): ProgressStore {
    return {
        skills: {},
        dailyActivityByCourse: {},
    }
}

function getSql() {
    assertAccountStorageConfigured()

    const databaseUrl =
        process.env.DATABASE_URL ??
        process.env.POSTGRES_URL ??
        process.env.POSTGRES_PRISMA_URL

    if (!databaseUrl) {
        throw new AccountUnavailableError('Missing Postgres environment variables.')
    }

    databaseClient ??= neon(databaseUrl)
    return databaseClient
}

async function hashPassword(password: string) {
    const salt = randomBytes(16).toString('base64url')
    const hash = await pbkdf2Async(
        password,
        salt,
        PASSWORD_ITERATIONS,
        PASSWORD_KEY_LENGTH,
        'sha256'
    )

    return [
        'pbkdf2-sha256',
        PASSWORD_ITERATIONS,
        salt,
        hash.toString('base64url'),
    ].join(':')
}

async function verifyPassword(password: string, passwordHash: string) {
    const [algorithm, iterations, salt, storedHash] = passwordHash.split(':')

    if (algorithm !== 'pbkdf2-sha256' || !iterations || !salt || !storedHash) {
        return false
    }

    const hash = await pbkdf2Async(
        password,
        salt,
        Number(iterations),
        PASSWORD_KEY_LENGTH,
        'sha256'
    )
    const storedHashBuffer = Buffer.from(storedHash, 'base64url')

    return (
        storedHashBuffer.length === hash.length &&
        timingSafeEqual(storedHashBuffer, hash)
    )
}

function signSessionPayload(payload: string) {
    return createHmac('sha256', getSessionSecret())
        .update(payload)
        .digest('base64url')
}

function isValidSignature(payload: string, signature: string) {
    const expectedSignature = signSessionPayload(payload)
    const expectedBuffer = Buffer.from(expectedSignature)
    const actualBuffer = Buffer.from(signature)

    return (
        expectedBuffer.length === actualBuffer.length &&
        timingSafeEqual(expectedBuffer, actualBuffer)
    )
}

function getSessionSecret() {
    const secret = process.env.LEARN_SOMALI_AUTH_SECRET

    if (!secret) {
        throw new AccountUnavailableError('Missing LEARN_SOMALI_AUTH_SECRET.')
    }

    return secret
}
