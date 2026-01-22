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

export async function getWordDefinition(word: string): Promise<{ definition: string | null; error: string | null }> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'user',
          content: `Provide a concise definition for the English word: ${word}. Return only the definition text, no explanations.`
        }
      ],
      max_tokens: 100,
      temperature: 0.3,
    })

    const definition = response.choices[0]?.message?.content?.trim() || null
    return { definition, error: null }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { definition: null, error: errorMessage }
  }
}

