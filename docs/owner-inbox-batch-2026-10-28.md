# Owner inbox: browsing, session lifecycle and design review

Continues draft c40037261534f66d99c76f32eef373e507bfb41b and preserves the planner, schedule, quote editor and original production release. This batch changes the existing owner inbox only; no schema, grants, RLS policy, customer status or public inquiry records are changed.

## Browsing and search

The inbox now loads 25 requests with a one-row lookahead. Older paging uses descending created_at plus descending UUID, retaining microsecond timestamps exactly; the next boundary comes from the last displayed raw record rather than the lookahead. Newer re-requests prior page boundaries and Refresh returns to the latest page. Pages are live queries, not a frozen snapshot. Search filters name, email, phone, project, town or reference within the current loaded page, stays during paging and clears on sign-out/page leave. It is not server-wide search.

Unsupported records are counted without suppressing readable records. A malformed paging boundary disables Older and suggests refreshing. Failed reads clear displayed records and retain Refresh; authorization failures clear the session. No records or search terms enter browser storage.

## Session lifecycle

Requests capture their token and epoch; every owner lookup and inquiry response is checked again before rendering. Logout, page leave and expiry abort pending requests and invalidate responses even if transport ignores abort. Old errors cannot clear a newer sign-in. Expiry is checked on actions, response completion and visibility changes in addition to the timer. No refresh token is stored. Local sign-out clears this page immediately; the existing scope=local server sign-out is requested without claiming that already-issued access tokens are instantly revoked.

Owner membership must match the authenticated session user on every page read. Server grants and RLS remain the authority. The client uses only the existing public configuration and owner session token. Search and page controls are disabled during loading; removed or filtered reference-copy buttons cannot act, and late clipboard completion cannot change a later session's status.

## Review details

Cards now separate contact/location, customer description, unverified measurements, recorded consent and submitted design fields. Exact design notes/layout context are preserved within existing field bounds and rendered with textContent. Missing attachments are explicit. Copy request reference copies only the inquiry UUID; no email, customer reply, FURY import or external message is sent.

## Verification

All 61 website tests and five-page asset/module/syntax checks passed locally. New tests cover tied-timestamp paging across 55 synthetic records, lookahead boundaries, search, unreadable records, safe text rendering, ownership, duplicate operations, stale login/owner/data/logout responses, expired sessions, removed controls and read-failure recovery. All seven separate offline website → FURY → STARK checks passed with existing synthetic records.

Read-only inspection of the existing backend confirmed RLS enabled on both owner_accounts and quote_requests; anonymous SELECT is not granted; authenticated SELECT is restricted to own owner membership and owner-only inquiries. A read-only transaction under an authenticated synthetic non-owner identity saw zero owner memberships and zero inquiries, then rolled back. No customer data was returned and no account was created or changed. Relevant Supabase changelog/docs and PostgREST filtering/order guidance were checked before implementation.

Signed-in hosted owner acceptance and hardware iPad acceptance still require an existing owner session. These are not claimed from synthetic tests or administrative metadata checks. Hosted CI, preview build and signed-out browser verification are recorded in the draft PR after saving.
