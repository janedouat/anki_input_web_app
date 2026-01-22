-- Create anki_queue table
CREATE TABLE IF NOT EXISTS anki_queue (
  id BIGSERIAL PRIMARY KEY,
  word TEXT NOT NULL,
  definition TEXT,
  source TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  deck TEXT NOT NULL DEFAULT 'Main',
  note_type TEXT NOT NULL DEFAULT 'WordDefinition',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pushed_to_anki_at TIMESTAMPTZ,
  push_error TEXT,
  resolved_at TIMESTAMPTZ,
  resolution_error TEXT,
  normalized_word TEXT NOT NULL,
  request_device TEXT,
  request_ip_hash TEXT
);

-- Create unique constraint for deduplication
CREATE UNIQUE INDEX IF NOT EXISTS anki_queue_unique_word_deck_note_type 
ON anki_queue (normalized_word, deck, note_type);

-- Create index for efficient sync queries
CREATE INDEX IF NOT EXISTS anki_queue_pushed_at_idx 
ON anki_queue (pushed_to_anki_at);

-- Create index for ordering by creation time
CREATE INDEX IF NOT EXISTS anki_queue_created_at_idx 
ON anki_queue (created_at);

-- Function to automatically set normalized_word
CREATE OR REPLACE FUNCTION set_normalized_word()
RETURNS TRIGGER AS $$
BEGIN
  NEW.normalized_word := LOWER(TRIM(NEW.word));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically normalize word on insert/update
CREATE TRIGGER normalize_word_trigger
  BEFORE INSERT OR UPDATE OF word ON anki_queue
  FOR EACH ROW
  EXECUTE FUNCTION set_normalized_word();

