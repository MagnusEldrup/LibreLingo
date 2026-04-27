'use client'

import { useDeferredValue, useId, useState } from 'react'
import type {
    CourseDictionaryEntry,
    CourseGrammarDictionarySection,
    CoursePhraseDictionaryEntry,
} from '@/data/course'

type TabId = 'words' | 'phrases' | 'grammar'

type Props = {
    wordEntries: CourseDictionaryEntry[]
    phraseEntries: CoursePhraseDictionaryEntry[]
    grammarSections: CourseGrammarDictionarySection[]
    courseLanguageName: string
}

function normalizeSearchTerm(value: string) {
    return value
        .toLowerCase()
        .replaceAll(/[^\p{L}\p{N}' -]/gu, ' ')
        .replaceAll(/\s+/g, ' ')
        .trim()
}

function buildAvailableTabs({
    wordEntries,
    phraseEntries,
    grammarSections,
}: Pick<Props, 'wordEntries' | 'phraseEntries' | 'grammarSections'>) {
    return [
        wordEntries.length > 0
            ? {
                  id: 'words' as const,
                  label: 'Words',
                  description: 'Single-word lookup',
              }
            : undefined,
        phraseEntries.length > 0
            ? {
                  id: 'phrases' as const,
                  label: 'Phrases',
                  description: 'Useful sentence chunks',
              }
            : undefined,
        grammarSections.length > 0
            ? {
                  id: 'grammar' as const,
                  label: 'Grammar',
                  description: 'Present and past reference',
              }
            : undefined,
    ].filter((tab): tab is { id: TabId; label: string; description: string } =>
        Boolean(tab)
    )
}

export default function FloatingDictionary({
    wordEntries,
    phraseEntries,
    grammarSections,
    courseLanguageName,
}: Props) {
    const availableTabs = buildAvailableTabs({
        wordEntries,
        phraseEntries,
        grammarSections,
    })
    const [isOpen, setIsOpen] = useState(false)
    const [query, setQuery] = useState('')
    const [activeTab, setActiveTab] = useState<TabId>(availableTabs[0]?.id ?? 'words')
    const deferredQuery = useDeferredValue(query)
    const normalizedQuery = normalizeSearchTerm(deferredQuery)
    const searchId = useId()

    const filteredWordEntries = wordEntries.filter((entry) => {
        if (normalizedQuery.length === 0) {
            return true
        }

        return (
            normalizeSearchTerm(entry.english).includes(normalizedQuery) ||
            entry.somali.some((somaliValue) =>
                normalizeSearchTerm(somaliValue).includes(normalizedQuery)
            )
        )
    })
    const filteredPhraseEntries = phraseEntries.filter((entry) => {
        if (normalizedQuery.length === 0) {
            return true
        }

        return (
            normalizeSearchTerm(entry.english).includes(normalizedQuery) ||
            normalizeSearchTerm(entry.somali).includes(normalizedQuery)
        )
    })
    const filteredGrammarSections = grammarSections
        .map((section) => ({
            ...section,
            rows: section.rows.filter((row) => {
                if (normalizedQuery.length === 0) {
                    return true
                }

                return (
                    normalizeSearchTerm(section.title).includes(normalizedQuery) ||
                    normalizeSearchTerm(section.summary).includes(normalizedQuery) ||
                    normalizeSearchTerm(row.label).includes(normalizedQuery) ||
                    normalizeSearchTerm(row.prompt).includes(normalizedQuery) ||
                    row.somali.some((somaliValue) =>
                        normalizeSearchTerm(somaliValue).includes(normalizedQuery)
                    ) ||
                    normalizeSearchTerm(row.note ?? '').includes(normalizedQuery)
                )
            }),
        }))
        .filter((section) => section.rows.length > 0)

    const entryCountMap = {
        words: filteredWordEntries.length,
        phrases: filteredPhraseEntries.length,
        grammar: filteredGrammarSections.reduce(
            (total, section) => total + section.rows.length,
            0
        ),
    } as const
    const activeCount = entryCountMap[activeTab]
    const placeholderMap = {
        words: 'Type an English word',
        phrases: 'Type an English phrase',
        grammar: 'Search person, tense, or example',
    } as const
    const helperMap = {
        words: `Search English words and see their ${courseLanguageName} translations.`,
        phrases: 'Browse travel, etiquette, and practice-ready phrases.',
        grammar: 'Review the present and past tense patterns currently taught in the course.',
    } as const
    const countLabelMap = {
        words: activeCount === 1 ? 'word' : 'words',
        phrases: activeCount === 1 ? 'phrase' : 'phrases',
        grammar: activeCount === 1 ? 'grammar row' : 'grammar rows',
    } as const

    return (
        <div className="fixed bottom-4 right-4 z-40 flex max-w-[calc(100vw-1.5rem)] flex-col items-end gap-3 sm:bottom-6 sm:right-6">
            {isOpen && (
                <aside className="w-[min(26rem,calc(100vw-1.5rem))] overflow-hidden rounded-[1.75rem] border border-[#bfd7f8] bg-white shadow-[0_28px_70px_-32px_rgba(15,23,42,0.45)]">
                    <div className="border-b border-[#e3efff] bg-[linear-gradient(180deg,#f8fbff_0%,#eef6ff_100%)] px-5 py-4">
                        <div className="flex items-start justify-between gap-4">
                            <div className="space-y-1">
                                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#4189dd]">
                                    Floating reference
                                </p>
                                <p className="text-sm text-slate-600">
                                    {helperMap[activeTab]}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsOpen(false)}
                                className="rounded-full border border-[#d6e6fb] bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600 transition hover:border-[#aac8f3] hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4189dd] focus-visible:ring-offset-2"
                            >
                                Hide
                            </button>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                            {availableTabs.map((tab) => {
                                const isActive = tab.id === activeTab

                                return (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => {
                                            setActiveTab(tab.id)
                                            setQuery('')
                                        }}
                                        className={[
                                            'rounded-full px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4189dd] focus-visible:ring-offset-2',
                                            isActive
                                                ? 'bg-[#4189dd] text-white shadow-sm'
                                                : 'bg-white text-slate-700 ring-1 ring-[#d6e6fb] hover:bg-[#f6faff]',
                                        ].join(' ')}
                                    >
                                        {tab.label}
                                    </button>
                                )
                            })}
                        </div>

                        <div className="mt-4 space-y-2">
                            <label
                                htmlFor={searchId}
                                className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500"
                            >
                                {activeTab === 'grammar'
                                    ? 'Grammar search'
                                    : 'English search'}
                            </label>
                            <input
                                id={searchId}
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder={placeholderMap[activeTab]}
                                className="w-full rounded-2xl border border-[#aac8f3] px-4 py-3 text-base text-slate-900 outline-none transition focus:border-[#4189dd]"
                            />
                        </div>
                    </div>

                    <div className="flex items-center justify-between border-b border-[#eef4fd] px-5 py-3 text-sm text-slate-600">
                        <span>
                            {activeCount} {countLabelMap[activeTab]}
                        </span>
                        {normalizedQuery.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setQuery('')}
                                className="font-semibold text-[#2f6db8] transition hover:text-[#1f5ea6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4189dd] focus-visible:ring-offset-2"
                            >
                                Clear search
                            </button>
                        )}
                    </div>

                    <div className="max-h-[min(28rem,62vh)] overflow-y-auto px-5 py-4">
                        {activeTab === 'words' && filteredWordEntries.length > 0 && (
                            <ul className="space-y-3">
                                {filteredWordEntries.map((entry) => (
                                    <li
                                        key={`${entry.english}-${entry.somali.join('-')}`}
                                        className="rounded-2xl border border-[#e4eefc] bg-[#f8fbff] px-4 py-3"
                                    >
                                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                            English
                                        </p>
                                        <p className="mt-1 text-base font-semibold text-slate-900">
                                            {entry.english}
                                        </p>
                                        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-[#4189dd]">
                                            Somali
                                        </p>
                                        <p className="mt-1 text-sm leading-6 text-slate-700">
                                            {entry.somali.join(' / ')}
                                        </p>
                                    </li>
                                ))}
                            </ul>
                        )}

                        {activeTab === 'phrases' && filteredPhraseEntries.length > 0 && (
                            <ul className="space-y-3">
                                {filteredPhraseEntries.map((entry) => (
                                    <li
                                        key={`${entry.english}-${entry.somali}`}
                                        className="rounded-2xl border border-[#e4eefc] bg-[#f8fbff] px-4 py-3"
                                    >
                                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                            English phrase
                                        </p>
                                        <p className="mt-1 text-base font-semibold text-slate-900">
                                            {entry.english}
                                        </p>
                                        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-[#4189dd]">
                                            Somali
                                        </p>
                                        <p className="mt-1 text-sm leading-6 text-slate-700">
                                            {entry.somali}
                                        </p>
                                    </li>
                                ))}
                            </ul>
                        )}

                        {activeTab === 'grammar' &&
                            filteredGrammarSections.length > 0 && (
                                <div className="space-y-4">
                                    {filteredGrammarSections.map((section) => (
                                        <section
                                            key={section.id}
                                            className="rounded-2xl border border-[#dceafe] bg-[#f8fbff] p-4"
                                        >
                                            <div className="space-y-1">
                                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4189dd]">
                                                    {section.tense} tense
                                                </p>
                                                <h3 className="text-lg font-semibold text-slate-900">
                                                    {section.title}
                                                </h3>
                                                <p className="text-sm leading-6 text-slate-600">
                                                    {section.summary}
                                                </p>
                                            </div>
                                            <div className="mt-4 space-y-3">
                                                {section.rows.map((row) => (
                                                    <div
                                                        key={`${section.id}-${row.label}-${row.prompt}`}
                                                        className="rounded-2xl bg-white px-4 py-3 shadow-sm"
                                                    >
                                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                                            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                                                                {row.label}
                                                            </p>
                                                        </div>
                                                        <p className="mt-2 text-sm text-slate-600">
                                                            {row.prompt}
                                                        </p>
                                                        <p className="mt-2 text-base font-semibold text-slate-900">
                                                            {row.somali.join(' / ')}
                                                        </p>
                                                        {row.note && (
                                                            <p className="mt-2 text-sm leading-6 text-[#2f6db8]">
                                                                {row.note}
                                                            </p>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </section>
                                    ))}
                                </div>
                            )}

                        {((activeTab === 'words' && filteredWordEntries.length === 0) ||
                            (activeTab === 'phrases' &&
                                filteredPhraseEntries.length === 0) ||
                            (activeTab === 'grammar' &&
                                filteredGrammarSections.length === 0)) && (
                            <div className="rounded-2xl border border-dashed border-[#d6e6fb] bg-[#f8fbff] px-4 py-6 text-sm leading-6 text-slate-600">
                                No match yet. Try a different search term.
                            </div>
                        )}
                    </div>
                </aside>
            )}

            <button
                type="button"
                onClick={() => setIsOpen((currentValue) => !currentValue)}
                className="rounded-full bg-[#4189dd] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_45px_-20px_rgba(65,137,221,0.75)] transition hover:-translate-y-0.5 hover:bg-[#2f6db8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4189dd] focus-visible:ring-offset-2"
            >
                {isOpen ? 'Close reference' : 'Open reference'}
            </button>
        </div>
    )
}
