# Cabinet planner printable concept review

Continues the recovered customer layout planner on top of website development commit eae17d5f6387bd5e918d6241697eada742565c17. Save to a separate development branch; no production promotion, schema changes or paid provider calls.

Adds Print / Save PDF to the planner. The browser print dialog receives the current validated top view, current rotated schematic, exact dimension summary and unallocated run lengths. Print styling removes navigation and controls and adds French Vanilla identification, phone contact and an explicit unverified-concept heading. A clickable dimension-only link reopens the same layout parameters; rotation is a view setting and is not persisted in the layout link. The browser owns PDF saving; opening print does not confirm a saved file or send an inquiry.

Invalid fields disable print and remove the reopening link. Malformed incoming links now clear both drawings and summaries instead of leaving the default layout visible. Resetting or correcting an input rebuilds a valid concept. Browser print failures retain the concept and show a fallback instruction.

Validation: 28 website tests passed, including current-dimension printing, view preservation, geometry-only link content, refusal of invalid/stale print actions, malformed-link clearing and recovery, print failure, explicit quote attachments and submission receipt behavior. Six offline website → FURY → STARK contract checks passed with synthetic records and in-memory storage, preserving source dimensions and owner edits. Syntax checks passed. Browser print pagination and physical iPad Save PDF behavior remain unverified; no hosted owner-inbox acceptance is claimed.

The recovered planner source and its quote integration are included in this branch because they were present in the prior workspace but absent from the hosted development branch. Base-tree entries not edited here, including owner inbox, deployment configuration and Supabase files, are preserved by the Git tree operation. JARVIS preview remains 173 and its production remains 164.
