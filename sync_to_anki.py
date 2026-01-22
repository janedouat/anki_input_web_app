#!/usr/bin/env python3
"""
Sync agent that fetches queued words from Supabase and adds them to Anki via AnkiConnect.
"""

import os
import sys
import argparse
import json
from datetime import datetime
from typing import Optional, Dict, Any, List

try:
    import requests
    from supabase import create_client, Client
    from dotenv import load_dotenv
except ImportError as e:
    print(f"Error: Missing required package. Install with: pip install -r requirements.txt")
    print(f"Missing: {e.name}")
    sys.exit(1)

# Load environment variables
load_dotenv()

# Configuration
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_ROLE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
ANKI_CONNECT_URL = os.getenv('ANKI_CONNECT_URL', 'http://localhost:8765')

REQUIRED_TAGS = ['dom_words', 'lang_en', 'time_permanent', 'type_definition']
DEFAULT_DECK = 'Main'
DEFAULT_NOTE_TYPE = 'WordDefinition'


def check_anki_connect() -> bool:
    """Check if AnkiConnect is reachable."""
    try:
        response = requests.post(
            ANKI_CONNECT_URL,
            json={
                'action': 'version',
                'version': 6,
            },
            timeout=5
        )
        return response.status_code == 200
    except Exception as e:
        print(f"Error connecting to AnkiConnect at {ANKI_CONNECT_URL}: {e}")
        return False


def find_duplicate_note(anki_connect_url: str, word: str, note_type: str) -> Optional[int]:
    """
    Check if a note with the same word already exists in Anki.
    Returns the note ID if found, None otherwise.
    """
    try:
        # Normalize word for search (lowercase)
        normalized_word = word.lower().strip()
        
        # Search for notes with matching Front field
        # Query format: note:"WordDefinition" "Front:bewildered"
        query = f'note:"{note_type}" "Front:{normalized_word}"'
        
        response = requests.post(
            anki_connect_url,
            json={
                'action': 'findNotes',
                'version': 6,
                'params': {
                    'query': query
                }
            },
            timeout=10
        )
        
        if response.status_code != 200:
            return None
        
        result = response.json()
        if result.get('error') is not None:
            print(f"  Warning: AnkiConnect findNotes error: {result['error']}")
            return None
        
        note_ids = result.get('result', [])
        
        if not note_ids:
            return None
        
        # If we found notes, verify they actually match by checking the Front field
        # Get note info to verify
        if len(note_ids) > 0:
            # Check the first note's Front field
            notes_info_response = requests.post(
                anki_connect_url,
                json={
                    'action': 'notesInfo',
                    'version': 6,
                    'params': {
                        'notes': note_ids[:1]  # Just check first one
                    }
                },
                timeout=10
            )
            
            if notes_info_response.status_code == 200:
                notes_info = notes_info_response.json()
                if notes_info.get('error') is None and notes_info.get('result'):
                    note_info = notes_info['result'][0]
                    front_field = note_info.get('fields', {}).get('Front', {}).get('value', '')
                    if front_field.lower().strip() == normalized_word:
                        return note_ids[0]
        
        return None
    except Exception as e:
        print(f"  Error checking for duplicate: {e}")
        return None


def add_note_to_anki(
    anki_connect_url: str,
    word: str,
    definition: str,
    deck: str,
    note_type: str,
    tags: List[str]
) -> Optional[int]:
    """
    Add a note to Anki via AnkiConnect.
    Returns the note ID if successful, None otherwise.
    """
    try:
        response = requests.post(
            anki_connect_url,
            json={
                'action': 'addNote',
                'version': 6,
                'params': {
                    'note': {
                        'deckName': deck,
                        'modelName': note_type,
                        'fields': {
                            'Front': word,
                            'Back': definition
                        },
                        'tags': tags
                    }
                }
            },
            timeout=10
        )
        
        if response.status_code != 200:
            return None
        
        result = response.json()
        if result.get('error') is not None:
            print(f"  Error from AnkiConnect: {result['error']}")
            return None
        
        return result.get('result')
    except Exception as e:
        print(f"  Error adding note: {e}")
        return None


def update_queue_status(
    supabase: Client,
    queue_id: int,
    pushed: bool,
    error: Optional[str] = None
):
    """Update the queue row with push status."""
    update_data: Dict[str, Any] = {}
    
    if pushed:
        update_data['pushed_to_anki_at'] = datetime.utcnow().isoformat() + 'Z'
        update_data['push_error'] = None
    else:
        update_data['push_error'] = error
    
    try:
        supabase.table('anki_queue').update(update_data).eq('id', queue_id).execute()
    except Exception as e:
        print(f"  Error updating queue status: {e}")


def sync_to_anki(limit: Optional[int] = None, dry_run: bool = False):
    """Main sync function."""
    # Validate configuration
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        print("Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
        sys.exit(1)
    
    # Check AnkiConnect
    print(f"Checking AnkiConnect at {ANKI_CONNECT_URL}...")
    if not check_anki_connect():
        print("Error: AnkiConnect is not reachable. Make sure Anki is open and AnkiConnect is installed.")
        sys.exit(1)
    print("✓ AnkiConnect is reachable")
    
    # Connect to Supabase
    print("Connecting to Supabase...")
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    
    # Fetch unpushed items
    print("Fetching unpushed items...")
    query = supabase.table('anki_queue').select('*').is_('pushed_to_anki_at', 'null').order('created_at', desc=False)
    
    if limit:
        query = query.limit(limit)
    
    response = query.execute()
    items = response.data
    
    if not items:
        print("No unpushed items found.")
        return
    
    print(f"Found {len(items)} unpushed item(s)")
    
    if dry_run:
        print("\n[DRY RUN MODE - No changes will be made]\n")
    
    # Process each item
    for item in items:
        queue_id = item['id']
        word = item['word']
        definition = item['definition']
        deck = item.get('deck', DEFAULT_DECK)
        note_type = item.get('note_type', DEFAULT_NOTE_TYPE)
        tags = item.get('tags', REQUIRED_TAGS)
        
        print(f"\nProcessing: {word} (ID: {queue_id})")
        
        # Check if definition exists
        if not definition:
            error_msg = "missing definition"
            print(f"  ⚠ Skipping: {error_msg}")
            if not dry_run:
                update_queue_status(supabase, queue_id, False, error_msg)
            continue
        
        # Check for duplicate
        duplicate_note_id = find_duplicate_note(ANKI_CONNECT_URL, word, note_type)
        if duplicate_note_id:
            print(f"  ✓ Duplicate found (note ID: {duplicate_note_id}), marking as pushed")
            if not dry_run:
                update_queue_status(supabase, queue_id, True)
            continue
        
        # Add note to Anki
        print(f"  Adding note to Anki...")
        if dry_run:
            print(f"    [DRY RUN] Would add: Front='{word}', Back='{definition[:50]}...', Deck='{deck}', Tags={tags}")
            continue
        
        note_id = add_note_to_anki(ANKI_CONNECT_URL, word, definition, deck, note_type, tags)
        
        if note_id:
            print(f"  ✓ Added successfully (note ID: {note_id})")
            update_queue_status(supabase, queue_id, True)
        else:
            error_msg = "Failed to add note to Anki"
            print(f"  ✗ {error_msg}")
            update_queue_status(supabase, queue_id, False, error_msg)
    
    print("\n✓ Sync complete")


def main():
    parser = argparse.ArgumentParser(description='Sync queued words from Supabase to Anki')
    parser.add_argument('--limit', type=int, help='Limit number of items to process')
    parser.add_argument('--dry-run', action='store_true', help='Dry run mode (no changes)')
    
    args = parser.parse_args()
    
    sync_to_anki(limit=args.limit, dry_run=args.dry_run)


if __name__ == '__main__':
    main()

