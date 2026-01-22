#!/usr/bin/env python3
"""
Sync agent that fetches queued words from Supabase and generates Anki import files.
No third-party add-ons required - uses Anki's native CSV import functionality.
"""

import os
import sys
import argparse
import csv
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List, Set

try:
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
OUTPUT_DIR = os.getenv('ANKI_IMPORT_DIR', os.path.expanduser('~/anki_imports'))

REQUIRED_TAGS = ['dom_words', 'lang_en', 'time_permanent', 'type_definition']
DEFAULT_DECK = 'Main'
DEFAULT_NOTE_TYPE = 'WordDefinition'


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


def format_tags(tags: List[str]) -> str:
    """Format tags list as space-separated string for Anki CSV import."""
    return ' '.join(tags)


def escape_csv_field(field: str) -> str:
    """Escape CSV field if it contains commas, quotes, or newlines."""
    if not field:
        return ''
    # Replace newlines with spaces
    field = field.replace('\n', ' ').replace('\r', ' ')
    # If field contains comma, quote, or newline, wrap in quotes and escape quotes
    if ',' in field or '"' in field:
        field = field.replace('"', '""')
        field = f'"{field}"'
    return field


def generate_anki_import_file(
    items: List[Dict[str, Any]],
    output_path: Path,
    deck: str = DEFAULT_DECK
) -> int:
    """
    Generate an Anki-compatible CSV import file.
    Format: Front, Back, Tags
    Returns the number of items written.
    """
    written_count = 0
    
    with open(output_path, 'w', newline='', encoding='utf-8') as csvfile:
        writer = csv.writer(csvfile)
        
        # Write header (Anki doesn't require it, but it's helpful)
        # Note: Anki import expects: Front, Back, Tags (or just Front, Back)
        writer.writerow(['Front', 'Back', 'Tags'])
        
        # Track words we've already written (for deduplication within the file)
        seen_words: Set[str] = set()
        
        for item in items:
            word = item['word']
            definition = item.get('definition', '')
            tags = item.get('tags', REQUIRED_TAGS)
            
            # Normalize word for duplicate checking
            normalized_word = word.lower().strip()
            
            # Skip if we've already written this word in this file
            if normalized_word in seen_words:
                print(f"  ⚠ Skipping duplicate in file: {word}")
                continue
            
            # Skip if definition is missing
            if not definition:
                print(f"  ⚠ Skipping {word}: missing definition")
                continue
            
            # Write the row
            front = escape_csv_field(word)
            back = escape_csv_field(definition)
            tags_str = format_tags(tags)
            
            writer.writerow([front, back, tags_str])
            seen_words.add(normalized_word)
            written_count += 1
    
    return written_count


def sync_to_anki(limit: Optional[int] = None, dry_run: bool = False, output_file: Optional[str] = None):
    """Main sync function."""
    # Validate configuration
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        print("Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
        sys.exit(1)
    
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
        for item in items:
            word = item['word']
            definition = item.get('definition', '')
            tags = item.get('tags', REQUIRED_TAGS)
            print(f"  Would export: {word} - {definition[:50] if definition else 'NO DEFINITION'}...")
        return
    
    # Create output directory if it doesn't exist
    output_dir = Path(OUTPUT_DIR)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Generate output filename
    if output_file:
        output_path = Path(output_file)
    else:
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        output_path = output_dir / f'anki_import_{timestamp}.csv'
    
    print(f"\nGenerating import file: {output_path}")
    
    # Filter out items without definitions
    valid_items = []
    skipped_items = []
    
    for item in items:
        if not item.get('definition'):
            skipped_items.append(item)
            continue
        valid_items.append(item)
    
    if skipped_items:
        print(f"\n⚠ Skipping {len(skipped_items)} item(s) without definitions:")
        for item in skipped_items:
            print(f"  - {item['word']} (ID: {item['id']})")
            update_queue_status(supabase, item['id'], False, "missing definition")
    
    if not valid_items:
        print("\nNo items with definitions to export.")
        return
    
    # Generate the CSV file
    written_count = generate_anki_import_file(valid_items, output_path)
    
    if written_count == 0:
        print("\n⚠ No items were written to the file (all duplicates or invalid).")
        return
    
    print(f"\n✓ Generated import file with {written_count} note(s)")
    print(f"  File: {output_path}")
    
    # Mark items as pushed
    print("\nMarking items as pushed in database...")
    for item in valid_items:
        update_queue_status(supabase, item['id'], True)
    
    print(f"\n✓ Marked {len(valid_items)} item(s) as pushed")
    
    # Print import instructions
    print("\n" + "="*60)
    print("IMPORT INSTRUCTIONS:")
    print("="*60)
    print(f"1. Open Anki Desktop")
    print(f"2. Go to File → Import")
    print(f"3. Select the file: {output_path}")
    print(f"4. Configure import settings:")
    print(f"   - Type: {DEFAULT_NOTE_TYPE}")
    print(f"   - Deck: {DEFAULT_DECK}")
    print(f"   - Fields separated by: Comma")
    print(f"   - Allow HTML in fields: No (if definitions are plain text)")
    print(f"   - Update existing notes: No (or Yes if you want to update)")
    print(f"5. Click Import")
    print("="*60)
    print("\n✓ Sync complete")


def main():
    parser = argparse.ArgumentParser(
        description='Sync queued words from Supabase and generate Anki import file',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Generate import file with all unpushed items
  python sync_to_anki.py
  
  # Generate import file with only 10 items
  python sync_to_anki.py --limit 10
  
  # Dry run (see what would be exported)
  python sync_to_anki.py --dry-run
  
  # Specify custom output file
  python sync_to_anki.py --output ~/Desktop/anki_words.csv
        """
    )
    parser.add_argument('--limit', type=int, help='Limit number of items to process')
    parser.add_argument('--dry-run', action='store_true', help='Dry run mode (no changes)')
    parser.add_argument('--output', type=str, help='Output CSV file path (default: ~/anki_imports/anki_import_TIMESTAMP.csv)')
    
    args = parser.parse_args()
    
    sync_to_anki(limit=args.limit, dry_run=args.dry_run, output_file=args.output)


if __name__ == '__main__':
    main()
