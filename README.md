# Anki Word Input Web App

A phone-first web app that lets you queue English words for Anki flashcards. Words are stored in the cloud and automatically synced to your local Anki collection when you run the sync agent on your computer.

## Architecture

```
Mobile Browser → Next.js API (Vercel) → Supabase Postgres
                                              ↓
                                    Python Sync Agent
                                              ↓
                                    AnkiConnect (localhost)
                                              ↓
                                          Anki Desktop
```

## Features

- 📱 Mobile-optimized web interface
- ☁️ Cloud storage (works when computer is off)
- 🤖 Automatic definition fetching via OpenAI
- 🔄 Automatic sync to Anki via Python script
- 🚫 Duplicate prevention
- 🏷️ Automatic tagging with required tags

## Prerequisites

1. **Supabase Account** - Free tier works fine
2. **Vercel Account** - For hosting the Next.js app
3. **OpenAI API Key** - For fetching word definitions
4. **Anki Desktop** - Installed on your computer
5. **AnkiConnect** - Anki add-on for API access
6. **Python 3.8+** - For running the sync agent

## Setup

### 1. Supabase Setup

1. Create a new Supabase project at https://supabase.com
   - Sign up or log in at https://supabase.com/dashboard
   - Click "New Project"
   - Fill in project details and wait for it to be created

2. Get your Supabase secrets:
   - In your project dashboard, click **Settings** (gear icon in left sidebar)
   - Click **API** in the settings menu
   - You'll find:
     - **Project URL** - Looks like `https://xxxxxxxxxxxxx.supabase.co`
       - Use this as `SUPABASE_URL`
     - **service_role key** (under "Project API keys" section, labeled as "secret")
       - Click the eye icon to reveal it, or click "Copy"
       - ⚠️ **Important**: Use the `service_role` key (not the `anon` key)
       - Use this as `SUPABASE_SERVICE_ROLE_KEY`
       - ⚠️ **Security**: Keep this secret! It bypasses Row Level Security

3. Run the database migration:
   - In Supabase dashboard, go to **SQL Editor** (left sidebar)
   - Click "New query"
   - Copy and paste the contents from `supabase/migrations/001_create_anki_queue.sql`
   - Click "Run" to execute the migration
   - You should see a success message and the `anki_queue` table will be created

### 2. Anki Setup

1. Install Anki Desktop if you haven't already
2. Install AnkiConnect add-on:
   - Tools → Add-ons → Get Add-ons
   - Enter code: `2055492159`
   - Restart Anki
3. Create the note type (if it doesn't exist):
   - Tools → Manage Note Types → Add → Add: Basic
   - Name it: `WordDefinition`
   - Ensure it has fields: `Front` and `Back`
4. Ensure you have a deck named `Main` (or create one)

### 3. Vercel Deployment

1. Push this repository to GitHub
2. Import the project in Vercel:
   - Go to https://vercel.com
   - Click "Add New..." → "Project"
   - Import your GitHub repository
3. Set the following environment variables in Vercel:
   - Go to your project settings → **Environment Variables**
   - Add each variable:
     - `QUEUE_TOKEN` - A secret token for API authentication (generate a random string, e.g., use `openssl rand -hex 32`)
     - `SUPABASE_URL` - Your Supabase project URL (from step 1.2 above)
     - `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key (from step 1.2 above)
     - `OPENAI_API_KEY` - Your OpenAI API key (get from https://platform.openai.com/api-keys)
     - `NEXT_PUBLIC_QUEUE_TOKEN` - Same value as `QUEUE_TOKEN` (for client-side use)
4. Deploy the app:
   - Vercel will automatically deploy after you set the environment variables
   - Or click "Deploy" manually

### 4. Local Development (Optional)

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env.local` file:
   ```
   QUEUE_TOKEN=your-secret-token-here
   NEXT_PUBLIC_QUEUE_TOKEN=your-secret-token-here
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   OPENAI_API_KEY=sk-your-openai-api-key
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

### 5. Python Sync Agent Setup

1. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Create a `.env` file in the project root:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ANKI_CONNECT_URL=http://localhost:8765
   ```

3. Make the script executable (optional):
   ```bash
   chmod +x sync_to_anki.py
   ```

## Usage

### Adding Words from Mobile

1. Open the web app on your phone (bookmark it or add to home screen)
2. Enter a word in the input field
3. Tap "Add"
4. The word is queued with its definition fetched automatically

### Syncing to Anki

1. Open Anki Desktop on your computer
2. Ensure AnkiConnect is running (it starts automatically with Anki)
3. Run the sync agent:
   ```bash
   python sync_to_anki.py
   ```

   Or with options:
   ```bash
   # Process only 10 items
   python sync_to_anki.py --limit 10
   
   # Dry run (no changes)
   python sync_to_anki.py --dry-run
   ```

4. The script will:
   - Fetch all unpushed words from Supabase
   - Check for duplicates in Anki
   - Add new notes to the `Main` deck
   - Update the queue status

## Environment Variables

### Vercel (Production)

- `QUEUE_TOKEN` - Secret token for API authentication
- `NEXT_PUBLIC_QUEUE_TOKEN` - Same token, exposed to client (for API calls)
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (server-side only)
- `OPENAI_API_KEY` - OpenAI API key

### Python Sync Agent

- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `ANKI_CONNECT_URL` - AnkiConnect URL (default: `http://localhost:8765`)

## Security

- The API uses token-based authentication via the `QUEUE_TOKEN` environment variable
- The Supabase service role key is never exposed to the client
- The mobile UI sends the token in the Authorization header or as a query parameter

## Troubleshooting

### "AnkiConnect is not reachable"
- Make sure Anki Desktop is open
- Verify AnkiConnect add-on is installed and enabled
- Check that AnkiConnect is running (should be automatic)

### "Failed to fetch definition"
- Check your OpenAI API key is valid
- Verify you have API credits
- Check the `resolution_error` field in Supabase for details

### "Duplicate found" but word doesn't exist in Anki
- The sync agent checks for duplicates using AnkiConnect's search
- If the search is too broad, it might match similar words
- Check the Anki database directly if needed

### Words not syncing
- Verify the sync agent can connect to Supabase (check env vars)
- Check that `pushed_to_anki_at` is NULL in Supabase for items to sync
- Look for `push_error` messages in the database

## Data Model

The `anki_queue` table stores:
- `word` - The original word as entered
- `normalized_word` - Lowercase, trimmed version for deduplication
- `definition` - Definition from OpenAI (may be null)
- `tags` - Array of tags (includes required tags)
- `deck` - Target deck (default: `Main`)
- `note_type` - Anki note type (default: `WordDefinition`)
- `pushed_to_anki_at` - Timestamp when synced (NULL if not synced)
- `push_error` - Error message if sync failed
- `resolved_at` - Timestamp when definition was fetched
- `resolution_error` - Error message if definition fetch failed

## Required Tags

All notes are automatically tagged with:
- `dom_words`
- `lang_en`
- `time_permanent`
- `type_definition`

## License

MIT
