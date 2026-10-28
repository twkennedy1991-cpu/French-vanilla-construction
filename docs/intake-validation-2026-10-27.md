# Website intake validation and receipt recovery

Continues the service-page preview at dfb93de3538176346c3e4f36ed3ca4324995dbbf. JARVIS development remains 171 and production remains 164. No production promotion, database migration, customer-data change or new paid provider is included.

The design studio already had HTML character limits. The quote builder now independently validates all six design fields against the private JARVIS reader's limits: project/wood/finish/style 80 characters, dimensions 200, notes 2000. It rejects unsupported fields and structured values rather than transmitting them as private context. Valid text is trimmed and retained without truncation. This closes a submission-boundary mismatch for programmatically supplied or altered form values; it is not a server-side spam control.

Quote submission now separates local validation from transport errors. Unknown service diagnostics are never placed into the page. Unconfirmed responses show the same request reference used by the insert, retain customer entries, and direct the customer to call before resubmitting. Duplicate taps are blocked while pending; a receipt appears only after acceptance. No automatic retries or new browser persistence are introduced. A manual retry on the same page retains the original ID. The reference identifies the attempted request, and does not prove it was received.

Validation:
- 10 website tests pass, including rendered-form acceptance, duplicate taps, timeout/rejection recovery, retained entries, unchanged retry ID, consent, hidden studio exclusion, query preselection and all design boundaries.
- 24 existing JARVIS inquiry/job/pagination tests pass.
- The offline cross-repository contract script passes all five project types at maximum text/design lengths through the actual website serializer, FURY import and STARK handoff. It checks repeated import preserves owner notes, revised scope, and one lead/task/job. Run with `node scripts/check-jarvis-intake.mjs /path/to/jarvis-source` from this repository. Uses synthetic data and in-memory storage only.
- JS syntax checks pass. No provider/model requests or live customer submissions are part of these tests.

Still unverified: signed-in hosted owner inbox → FURY/STARK acceptance and native iPad behavior. Approved gallery assets and server-enforced spam/rate controls remain pending. These changes do not establish Claude/Grok connectivity or an autonomous PARKER coding runner. The separately scoped hosted GitHub connector is still absent.
