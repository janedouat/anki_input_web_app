import OpenAI from 'openai'

const apiKey = process.env.OPENAI_API_KEY

if (!apiKey) {
  throw new Error(
    'Missing OpenAI API key. Please set OPENAI_API_KEY environment variable.'
  )
}

const openai = new OpenAI({
  apiKey,
})

// Language name mapping for prompts
const LANGUAGE_NAMES: Record<string, string> = {
  'en': 'English',
  'fr': 'French',
  'es': 'Spanish',
  'de': 'German',
  'it': 'Italian',
  'pt': 'Portuguese',
  'ru': 'Russian',
  'ja': 'Japanese',
  'zh': 'Chinese',
  'ar': 'Arabic',
}

export async function getWordDefinition(word: string, language: string = 'en'): Promise<{ definition: string | null; error: string | null }> {
  try {
    // Determine if it's a phrase/expression or a single word
    const isPhrase = /\s/.test(word)
    const languageName = LANGUAGE_NAMES[language] || language.toUpperCase()
    
    const prompt = isPhrase
      ? `Provide a concise definition or explanation for the ${languageName} expression/phrase: ${word}. Return only the definition text, no explanations.`
      : `Provide a concise definition for the ${languageName} word: ${word}. Return only the definition text, no explanations.`
    
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 150, // Increased for phrases
      temperature: 0.3,
    })

    const definition = response.choices[0]?.message?.content?.trim() || null
    return { definition, error: null }
  } catch (error: any) {
    // Handle specific OpenAI API errors
    let errorMessage = 'Unknown error'
    
    if (error?.status === 429) {
      errorMessage = 'OpenAI API quota exceeded. Please check your plan and billing details. The word was still queued without a definition.'
    } else if (error?.status === 401) {
      errorMessage = 'OpenAI API key is invalid or expired.'
    } else if (error?.status === 500) {
      errorMessage = 'OpenAI API server error. Please try again later.'
    } else if (error?.message) {
      errorMessage = error.message
    } else if (error instanceof Error) {
      errorMessage = error.message
    }
    
    console.error('OpenAI API error:', {
      status: error?.status,
      message: errorMessage,
      word,
    })
    
    return { definition: null, error: errorMessage }
  }
}

