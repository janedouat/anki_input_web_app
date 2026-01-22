import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getWordDefinition } from '@/lib/openai'

const REQUIRED_TAGS = ['dom_words', 'lang_en', 'time_permanent', 'type_definition']
const DEFAULT_DECK = 'Main'
const DEFAULT_NOTE_TYPE = 'WordDefinition'

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
    return { valid: false, error: 'Word cannot be empty' }
  }
  
  if (trimmed.length > 64) {
    return { valid: false, error: 'Word must be 64 characters or less' }
  }
  
  // Reject spaces (no phrases)
  if (/\s/.test(trimmed)) {
    return { valid: false, error: 'Word cannot contain spaces' }
  }
  
  // Allow letters, hyphen, apostrophe
  if (!/^[a-zA-Z'-]+$/.test(trimmed)) {
    return { valid: false, error: 'Word can only contain letters, hyphens, and apostrophes' }
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
    const { word, tags, deck, note_type } = body

    // Validate word
    const validation = validateWord(word)
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
    }

    const normalizedWord = normalizeWord(word)
    const finalDeck = deck || DEFAULT_DECK
    const finalNoteType = note_type || DEFAULT_NOTE_TYPE
    const finalTags = [...REQUIRED_TAGS, ...(tags || [])]

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
      })
    }

    // Attempt to fetch definition
    const { definition, error: definitionError } = await getWordDefinition(word)

    // Insert into database
    const { data: inserted, error: insertError } = await supabase
      .from('anki_queue')
      .insert({
        word: word.trim(),
        normalized_word: normalizedWord,
        definition,
        tags: finalTags,
        deck: finalDeck,
        note_type: finalNoteType,
        resolved_at: definition ? new Date().toISOString() : null,
        resolution_error: definitionError || null,
      })
      .select()
      .single()

    if (insertError) {
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

      return NextResponse.json(
        { error: 'Failed to insert into database', details: insertError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      status: 'queued',
      id: inserted.id,
      word: inserted.word,
      normalized_word: inserted.normalized_word,
      definition: inserted.definition,
      resolution_error: inserted.resolution_error,
    })
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

