import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getWordDefinition } from '@/lib/openai'

const DEFAULT_DECK = 'Main'
const DEFAULT_NOTE_TYPE = 'WordDefinition'
const DEFAULT_LANGUAGE = 'en'

// Language code to tag mapping
const LANGUAGE_TAG_MAP: Record<string, string> = {
  'en': 'lang_en',
  'fr': 'lang_fr',
  'es': 'lang_es',
  'de': 'lang_de',
  'it': 'lang_it',
  'pt': 'lang_pt',
  'ru': 'lang_ru',
  'ja': 'lang_ja',
  'zh': 'lang_zh',
  'ar': 'lang_ar',
}

function getRequiredTags(language: string): string[] {
  const langTag = LANGUAGE_TAG_MAP[language] || `lang_${language}`
  return ['dom_words', langTag, 'time_permanent', 'type_definition']
}

function validateToken(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  const token = process.env.QUEUE_TOKEN

  if (!token) {
    console.error('QUEUE_TOKEN environment variable is not set')
    return false
  }

  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7) === token
  }

  // Also check query parameter for convenience
  const url = new URL(request.url)
  const queryToken = url.searchParams.get('token')
  return queryToken === token
}

function normalizeWord(word: string): string {
  return word.trim().toLowerCase()
}

function validateWord(word: string): { valid: boolean; error?: string } {
  const trimmed = word.trim()
  
  if (trimmed.length === 0) {
    return { valid: false, error: 'Word or phrase cannot be empty' }
  }
  
  // Increased limit to accommodate phrases and expressions
  if (trimmed.length > 200) {
    return { valid: false, error: 'Word or phrase must be 200 characters or less' }
  }
  
  // Allow letters, spaces, hyphens, apostrophes, and common punctuation for phrases
  // This allows for expressions in multiple languages
  if (!/^[\p{L}\p{N}\s'-.,!?;:()]+$/u.test(trimmed)) {
    return { valid: false, error: 'Word or phrase contains invalid characters' }
  }
  
  return { valid: true }
}

export async function POST(request: NextRequest) {
  // Validate token
  if (!validateToken(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const body = await request.json()
    const { word, tags, deck, note_type, language } = body

    // Validate word
    const validation = validateWord(word)
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
    }

    // Validate language
    const finalLanguage = language || DEFAULT_LANGUAGE
    if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(finalLanguage)) {
      return NextResponse.json(
        { error: 'Invalid language code. Use ISO 639-1 format (e.g., en, fr, es)' },
        { status: 400 }
      )
    }

    const normalizedWord = normalizeWord(word)
    const finalDeck = deck || DEFAULT_DECK
    const finalNoteType = note_type || DEFAULT_NOTE_TYPE
    const requiredTags = getRequiredTags(finalLanguage)
    const finalTags = [...requiredTags, ...(tags || [])]
    
    // Log for debugging - verify language tag is set correctly
    console.log(`Language: ${finalLanguage}, Tags: ${finalTags.join(', ')}`)

    // Check for existing row
    const { data: existing, error: checkError } = await supabase
      .from('anki_queue')
      .select('*')
      .eq('normalized_word', normalizedWord)
      .eq('deck', finalDeck)
      .eq('note_type', finalNoteType)
      .single()

    if (existing && !checkError) {
      return NextResponse.json({
        status: 'already_queued',
        id: existing.id,
        word: existing.word,
        normalized_word: existing.normalized_word,
        definition: existing.definition,
        resolution_error: existing.resolution_error,
        language: existing.language,
        tags: existing.tags,
      })
    }

    // Attempt to fetch definition
    const { definition, error: definitionError } = await getWordDefinition(word, finalLanguage)

    // Insert into database
    // Note: normalized_word is set automatically by the database trigger,
    // but we include it here for clarity and to ensure it matches our normalization
    const { data: inserted, error: insertError } = await supabase
      .from('anki_queue')
      .insert({
        word: word.trim(),
        normalized_word: normalizedWord, // Will be overridden by trigger, but included for consistency
        definition,
        language: finalLanguage,
        tags: finalTags,
        deck: finalDeck,
        note_type: finalNoteType,
        resolved_at: definition ? new Date().toISOString() : null,
        resolution_error: definitionError || null,
      })
      .select()
      .single()

    if (insertError) {
      console.error('Database insert error:', {
        code: insertError.code,
        message: insertError.message,
        details: insertError.details,
        hint: insertError.hint,
      })

      // Check if it's a unique constraint violation (race condition)
      if (insertError.code === '23505') {
        // Fetch the existing row
        const { data: existingRow } = await supabase
          .from('anki_queue')
          .select('*')
          .eq('normalized_word', normalizedWord)
          .eq('deck', finalDeck)
          .eq('note_type', finalNoteType)
          .single()

        if (existingRow) {
          return NextResponse.json({
            status: 'already_queued',
            id: existingRow.id,
            word: existingRow.word,
            normalized_word: existingRow.normalized_word,
            definition: existingRow.definition,
            resolution_error: existingRow.resolution_error,
          })
        }
      }

      // Provide more detailed error information
      const errorDetails: any = {
        message: insertError.message,
        code: insertError.code,
      }
      
      if (insertError.details) {
        errorDetails.details = insertError.details
      }
      
      if (insertError.hint) {
        errorDetails.hint = insertError.hint
      }

      return NextResponse.json(
        { 
          error: 'Failed to insert into database', 
          details: errorDetails,
          troubleshooting: insertError.code === '42P01' 
            ? 'Table "anki_queue" does not exist. Please run the Supabase migration.'
            : insertError.code === '42501'
            ? 'Permission denied. Check your SUPABASE_SERVICE_ROLE_KEY.'
            : 'Check your Supabase connection and table schema.'
        },
        { status: 500 }
      )
    }

    // Return response with appropriate message based on definition status
    const responseData = {
      status: 'queued' as const,
      id: inserted.id,
      word: inserted.word,
      normalized_word: inserted.normalized_word,
      definition: inserted.definition,
      resolution_error: inserted.resolution_error,
      language: inserted.language,
      tags: inserted.tags, // Includes the language tag (lang_en, lang_fr, etc.)
    }

    // If definition failed, include a helpful message
    if (!inserted.definition && inserted.resolution_error) {
      return NextResponse.json({
        ...responseData,
        message: 'Word queued successfully, but definition could not be fetched. You can add a definition later or re-run the sync.',
      })
    }

    return NextResponse.json(responseData)
  } catch (error) {
    console.error('Error in POST /api/queue:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  // Validate token
  if (!validateToken(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const { data, error } = await supabase
      .from('anki_queue')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch queue', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json(data || [])
  } catch (error) {
    console.error('Error in GET /api/queue:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

