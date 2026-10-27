# Website service pages and mobile navigation

Base: dfa6e815897f71472dc0e4e24aae041dc5fd6c27, the verified READY website production commit. Preserves existing quote backend, owner inbox, business contact email and data.

Adds cabinetry.html and barn-doors.html with distinct service copy, process, FAQs and inquiry links. Barn doors uses the existing real custom-barn-door.jpeg only. Cabinetry content contains no fabricated project images or testimonials. Home links to both pages. Mobile navigation remains visible and wraps below 900px; skip links and reduced-motion behavior added. Exact allowlisted project query preselects the existing quote form. Invalid query values are ignored.

Checks: all four existing quote-client tests passed against the current production module; JS syntax passed; DOM checks verified each page's single h1, local navigation/fragment targets and project-type quote links. No new live inquiry was submitted; complete owner-session submission, private inbox visibility, duplicate-safe FURY import and native iPad layout remain unverified in this increment.

Still required: approved cabinetry/gallery assets, signed-in live inquiry-to-FURY acceptance, and spam/rate controls before paid/high-volume promotion. Do not claim the website or full delivery flow finished based on these static changes.
