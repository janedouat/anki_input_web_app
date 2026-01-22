'use client'

import { useState, useEffect, useRef } from 'react'

interface QueueItem {
  id: number
  word: string
  definition: string | null
  pushed_to_anki_at: string | null
  created_at: string
  resolution_error: string | null
}

const COMMON_LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
]

const OTHER_LANGUAGES = [
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'it', name: 'Italian', flag: '🇮🇹' },
  { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
  { code: 'ru', name: 'Russian', flag: '🇷🇺' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
  { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
]

export default function Home() {
  const [word, setWord] = useState('')
  const [language, setLanguage] = useState('en')
  const [showOtherLanguages, setShowOtherLanguages] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [recentItems, setRecentItems] = useState<QueueItem[]>([])
  const [showRecent, setShowRecent] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const token = process.env.NEXT_PUBLIC_QUEUE_TOKEN || ''

  useEffect(() => {
    // Auto-focus input on load
    inputRef.current?.focus()
  }, [])

  const fetchRecent = async () => {
    try {
      const response = await fetch(`/api/queue?token=${token}`)
      if (response.ok) {
        const data = await response.json()
        setRecentItems(data)
      }
    } catch (error) {
      // Silently fail for recent items
      console.error('Failed to fetch recent items:', error)
    }
  }

  useEffect(() => {
    fetchRecent()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!word.trim()) {
      setMessage({ type: 'error', text: 'Please enter a word' })
      return
    }

    setLoading(true)
    setMessage(null)

    try {
      const response = await fetch('/api/queue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ word: word.trim(), language }),
      })

      const data = await response.json()

      if (!response.ok) {
        setMessage({ type: 'error', text: data.error || 'Failed to queue word' })
        setLoading(false)
        return
      }

      if (data.status === 'already_queued') {
        setMessage({ type: 'success', text: 'Already queued' })
      } else {
        // Check if definition was fetched
        if (!data.definition && data.resolution_error) {
          // Word queued but definition failed
          const errorMsg = data.resolution_error.includes('quota') 
            ? 'Queued! (Definition unavailable - OpenAI quota exceeded)'
            : 'Queued! (Definition unavailable - will be added later)'
          setMessage({ type: 'success', text: errorMsg })
        } else {
          setMessage({ type: 'success', text: 'Queued!' })
        }
      }

      // Clear input
      setWord('')
      inputRef.current?.focus()

      // Refresh recent items
      fetchRecent()
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={styles.container}>
      <h1 style={styles.title}>Add word or phrase</h1>
      
      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.languageSelector}>
          <div style={styles.quickLanguages}>
            {COMMON_LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                type="button"
                onClick={() => {
                  setLanguage(lang.code)
                  setShowOtherLanguages(false)
                }}
                style={{
                  ...styles.languageButton,
                  ...(language === lang.code ? styles.languageButtonActive : {}),
                }}
              >
                {lang.flag} {lang.name}
              </button>
            ))}
          </div>
          
          {!showOtherLanguages ? (
            <button
              type="button"
              onClick={() => setShowOtherLanguages(true)}
              style={styles.otherLanguagesButton}
            >
              Other languages ▼
            </button>
          ) : (
            <div style={styles.otherLanguagesContainer}>
              <div style={styles.otherLanguagesGrid}>
                {OTHER_LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => {
                      setLanguage(lang.code)
                      setShowOtherLanguages(false)
                    }}
                    style={{
                      ...styles.languageButton,
                      ...(language === lang.code ? styles.languageButtonActive : {}),
                    }}
                  >
                    {lang.flag} {lang.name}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowOtherLanguages(false)}
                style={styles.otherLanguagesButton}
              >
                Hide ▲
              </button>
            </div>
          )}
        </div>

        <input
          ref={inputRef}
          type="text"
          value={word}
          onChange={(e) => setWord(e.target.value)}
          placeholder="Enter a word or expression"
          maxLength={200}
          disabled={loading}
          style={styles.input}
          autoComplete="off"
        />
        
        <button
          type="submit"
          disabled={loading || !word.trim()}
          style={{
            ...styles.button,
            ...(loading || !word.trim() ? styles.buttonDisabled : {}),
          }}
        >
          {loading ? 'Adding...' : 'Add'}
        </button>
      </form>

      {message && (
        <div
          style={{
            ...styles.message,
            ...(message.type === 'success' ? styles.messageSuccess : styles.messageError),
          }}
        >
          {message.text}
        </div>
      )}

      <div style={styles.recentSection}>
        <button
          onClick={() => setShowRecent(!showRecent)}
          style={styles.toggleButton}
        >
          {showRecent ? 'Hide' : 'Show'} recent ({recentItems.length})
        </button>

        {showRecent && (
          <div style={styles.recentList}>
            {recentItems.length === 0 ? (
              <div style={styles.emptyMessage}>No recent words</div>
            ) : (
              recentItems.map((item) => (
                <div key={item.id} style={styles.recentItem}>
                  <div style={styles.recentWord}>
                    <strong>{item.word}</strong>
                    {item.pushed_to_anki_at && (
                      <span style={styles.pushedBadge}>✓ Pushed</span>
                    )}
                  </div>
                  {item.definition && (
                    <div style={styles.recentDefinition}>{item.definition}</div>
                  )}
                  {item.resolution_error && (
                    <div style={styles.recentError}>Error: {item.resolution_error}</div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </main>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    maxWidth: '600px',
    margin: '0 auto',
    padding: '20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  title: {
    fontSize: '28px',
    fontWeight: '600',
    marginBottom: '30px',
    textAlign: 'center',
    color: '#1a1a1a',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '15px',
    marginBottom: '20px',
  },
  input: {
    padding: '16px',
    fontSize: '18px',
    border: '2px solid #e0e0e0',
    borderRadius: '8px',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  inputFocus: {
    borderColor: '#0070f3',
  },
  button: {
    padding: '16px',
    fontSize: '18px',
    fontWeight: '600',
    backgroundColor: '#0070f3',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    minHeight: '56px', // Large touch target
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
    cursor: 'not-allowed',
  },
  message: {
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '20px',
    fontSize: '16px',
  },
  messageSuccess: {
    backgroundColor: '#d4edda',
    color: '#155724',
    border: '1px solid #c3e6cb',
  },
  messageError: {
    backgroundColor: '#f8d7da',
    color: '#721c24',
    border: '1px solid #f5c6cb',
  },
  recentSection: {
    marginTop: '30px',
  },
  toggleButton: {
    padding: '10px 16px',
    fontSize: '14px',
    backgroundColor: '#f5f5f5',
    border: '1px solid #ddd',
    borderRadius: '6px',
    cursor: 'pointer',
    marginBottom: '15px',
  },
  recentList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  recentItem: {
    padding: '12px',
    backgroundColor: '#f9f9f9',
    borderRadius: '6px',
    border: '1px solid #e0e0e0',
  },
  recentWord: {
    fontSize: '16px',
    marginBottom: '6px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pushedBadge: {
    fontSize: '12px',
    color: '#28a745',
    fontWeight: '500',
  },
  recentDefinition: {
    fontSize: '14px',
    color: '#666',
    marginTop: '4px',
  },
  recentError: {
    fontSize: '12px',
    color: '#dc3545',
    marginTop: '4px',
  },
  emptyMessage: {
    textAlign: 'center',
    color: '#999',
    padding: '20px',
  },
  languageSelector: {
    marginBottom: '15px',
  },
  quickLanguages: {
    display: 'flex',
    gap: '10px',
    marginBottom: '10px',
  },
  languageButton: {
    padding: '10px 16px',
    fontSize: '14px',
    fontWeight: '500',
    backgroundColor: '#f5f5f5',
    border: '2px solid #e0e0e0',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    minHeight: '44px', // Large touch target
  },
  languageButtonActive: {
    backgroundColor: '#0070f3',
    color: 'white',
    borderColor: '#0070f3',
  },
  otherLanguagesButton: {
    padding: '8px 12px',
    fontSize: '12px',
    backgroundColor: 'transparent',
    border: '1px solid #ddd',
    borderRadius: '6px',
    cursor: 'pointer',
    color: '#666',
  },
  otherLanguagesContainer: {
    marginTop: '10px',
  },
  otherLanguagesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '8px',
    marginBottom: '10px',
  },
}

