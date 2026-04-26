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

function buildApiKeySearchRoots(startDirectory: string) {
    const roots: string[] = []
    let currentDirectory = path.resolve(startDirectory)

    while (true) {
        roots.push(currentDirectory)

        const parentDirectory = path.dirname(currentDirectory)

        if (parentDirectory === currentDirectory) {
            return roots
        }

        currentDirectory = parentDirectory
    }
}

function buildApiKeyCandidatePaths() {
    const seenPaths = new Set<string>()
    const candidatePaths: string[] = []

    for (const searchRoot of buildApiKeySearchRoots(process.cwd())) {
        for (const relativePath of [
            'APIKEY',
            path.join('apps', 'librelingo-web', 'APIKEY'),
            path.join('LibreLingo', 'LibreLingo', 'APIKEY'),
            path.join('LibreLingo', 'LibreLingo', 'apps', 'librelingo-web', 'APIKEY')
        ]) {
            const candidatePath = path.resolve(searchRoot, relativePath)

            if (!seenPaths.has(candidatePath)) {
                seenPaths.add(candidatePath)
                candidatePaths.push(candidatePath)
            }
        }
    }

    return candidatePaths
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

    for (const candidatePath of buildApiKeyCandidatePaths()) {
        const fileKey = await readApiKeyFromFile(candidatePath)

        if (fileKey) {
            cachedApiKey = fileKey
            return cachedApiKey
        }
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
