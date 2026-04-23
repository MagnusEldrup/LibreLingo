import fs from 'node:fs/promises'
import path from 'node:path'
import OpenAI from 'openai'

export const WRITING_FEEDBACK_MODEL = 'gpt-5.4-mini'
export const WRITING_FEEDBACK_REASONING_EFFORT = 'low'

let cachedApiKey: string | undefined

async function readApiKeyFromFile(filePath: string) {
    try {
        const rawValue = await fs.readFile(filePath, 'utf8')
        const trimmedValue = rawValue.trim()

        if (trimmedValue.length > 0) {
            return trimmedValue
        }

        return
    } catch {
        return
    }
}

export async function getOpenAIApiKey() {
    if (cachedApiKey) {
        return cachedApiKey
    }

    const environmentKey = process.env.OPENAI_API_KEY?.trim()

    if (environmentKey) {
        cachedApiKey = environmentKey
        return cachedApiKey
    }

    const appLocalKey = await readApiKeyFromFile(path.join(process.cwd(), 'APIKEY'))

    if (appLocalKey) {
        cachedApiKey = appLocalKey
        return cachedApiKey
    }

    const repoRootKey = await readApiKeyFromFile(
        path.resolve(process.cwd(), '..', '..', 'APIKEY')
    )

    if (repoRootKey) {
        cachedApiKey = repoRootKey
        return cachedApiKey
    }

    return
}

export async function getOpenAIClient() {
    const apiKey = await getOpenAIApiKey()

    if (!apiKey) {
        throw new Error(
            'Missing OpenAI API key. Add OPENAI_API_KEY or paste your token into apps/librelingo-web/APIKEY or LibreLingo/LibreLingo/APIKEY.'
        )
    }

    return new OpenAI({ apiKey })
}
