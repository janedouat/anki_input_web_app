-- Add language field to anki_queue table
ALTER TABLE anki_queue 
ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en';

-- Create index for language queries
CREATE INDEX IF NOT EXISTS anki_queue_language_idx 
ON anki_queue (language);

