# Website milestone — October 26, 2026

## Verified starting state
- Private JARVIS production: build 155, commit `22b239f29817425a07def5d0f1d984d16b7e3ba3`, Vercel `dpl_2gvjCZYypYgbzjUt7fyEP3SW7vMH`, READY.
- JARVIS main is older than production. Preview branch `build/vision-share-saved-bundles-157` also exists. Do not replace either while continuing website work.
- Website: `French-vanilla-construction`, main `878fb57f53041053270a644275779db282448087`; Vercel project `french-vanilla-updated-door`.
- Supabase project `znuqrkiwqdxaqiltzqya` is ACTIVE_HEALTHY. The existing quote_requests table had RLS but lacked table INSERT/SELECT grants.

## Implemented
- Real quote submission to the existing private quote_requests table; name, phone, email, town, project type, description, approximate dimensions and optional studio selections.
- Customer dimensions are marked unverified. Requests are not prices, appointments or approval to publish content.
- Contact consent, required field validation, disabled submit during submission, no automatic retries, preserved details on failure and a reference on success.
- Owner inbox at /owner.html uses the existing Supabase owner account and RLS. Session stays in memory, is cleared on expiry/sign-out/page leave, and customer content is rendered as text.
- Migration adds only INSERT for anon/authenticated and SELECT for authenticated; existing owner-only row policy remains authoritative.

## Validation
- Four Node tests cover evidence mapping, validation, accepted submissions and error behavior.
- Live transactional SQL checks anonymous insert, blocked anonymous reads, blocked visitor approval, owner read and blocked non-owner read. Fixture rolled back.
- JS syntax and git whitespace checks passed.

## Remaining website milestones
- FURY/JARVIS automatic intake, deduplication and owner-reviewed follow-up tasks. The inbox is NOT an automatic FURY integration.
- Cabinetry service page and expanded portfolio/gallery using approved real photos.
- Spam protection and server-side rate limits before paid marketing or higher-volume promotion. Current public intake uses the existing RLS-protected direct Data API.
- Owner login UI requires the user's existing credentials for complete live sign-in testing. No credentials were requested or fabricated.

## Handoff direction
Private JARVIS remains the foundation; do not create a separate AOC codebase. Prioritize website lead generation, then reliable integrated specialists, evidence-based estimating and VISION. Later AOC removes private STRANGE investment and separate-channel monetization capabilities, keeps walkthrough analysis and adds consent-based Steve Kennedy MENTOR. No private JARVIS code, icons, data, production address or version was changed in this milestone.

## Existing security advisories
Supabase reported existing SECURITY DEFINER helper warnings and disabled leaked-password protection. These were not introduced by this grant migration. Review intentionally callable access helpers before modifying them; do not revoke functions that existing RLS depends on. Documentation: https://supabase.com/docs/guides/database/database-linter and https://supabase.com/docs/guides/auth/password-security
