# Website quote-intake release result — October 26, 2026

- Production URL: https://french-vanilla-updated-door.vercel.app
- Owner inbox: https://french-vanilla-updated-door.vercel.app/owner.html
- Runtime commit: d696d8e6720500afd19466965d73a3a450baaab5
- Production deployment: dpl_bS6qUxDveoFJSCck7pm8gYu2Nvt2, READY; static HTML/CSS/ES modules, no compilation required.
- Rollback deployment: dpl_EaQjjZnGV52C2mXW7ApmDqDTeJYv, previous website commit 878fb57f53041053270a644275779db282448087.
- Private JARVIS build 155 and newer VISION preview were not changed.

## Verification
Four Node tests passed, JavaScript syntax and whitespace checks passed. Existing Supabase RLS was retained; missing quote table grants were applied with a tracked migration. Live transactional role tests proved visitor insert, blocked visitor reads/status approval, owner reads and blocked non-owner reads. Anonymous REST reads returned HTTP 401. Direct REST submission returned HTTP 201. Browser submission on the deployed production site displayed Request Sent and a request reference; SQL verified that record with unverified customer-supplied dimensions. Both generated test records were removed after verification. Deployed owner page displayed only a sign-in form while signed out; authenticated owner UI flow still requires the owner's existing credentials and was not exercised. Production modules and owner page returned HTTP 200 with appropriate content types. Unauthenticated HTTP access to the production homepage returned 200 with the new form, with no Vercel sign-in page.

## Access review
An attempted Vercel protection configuration change was rejected by automatic approval review as a persistent access-control change without specific authorization. No such change was applied or retried. Subsequent unauthenticated HTTP and browser checks established that the production customer URL already works with existing settings, so no protection change or additional permission is needed.

## Remaining work
Automatic FURY/JARVIS intake is not implemented by this release. Next: owner-reviewed quote import/deduplication and follow-up task integration, then cabinetry service page and expanded approved real-photo portfolio. Add spam/rate protection before paid or high-volume promotion. Existing Supabase advisor warnings remain documented in the milestone handoff; no new privileged functions or policies were added. Cost: no model calls or automatic external communications were introduced.
