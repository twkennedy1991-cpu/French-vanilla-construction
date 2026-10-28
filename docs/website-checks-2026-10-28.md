# Website regression checks and preview verification

Continues planner draft commit 1709cf82355a96bc0a4c1b65c611acfc250a1f8d. The existing Vercel Git integration had already built that exact commit as preview dpl_BBMyDr68TmuqdCNE9h9hso3qXwHF, status READY. No manual redeploy or production promotion was needed.

The browser reached Vercel Authentication, not the planner. The connector's protected fetch was rejected by automatic approval review because it creates or reuses a temporary share link. No access setting was changed and no authentication or sharing workaround was attempted. Browser layout, print pagination and iPad acceptance remain pending.

The new offline source checker found the homepage CSS referencing a nonexistent assets/custom-barn-door.jpeg. Corrected it to the existing root-level custom-barn-door.jpeg, which is already used by the gallery. The checker validates root HTML/CSS local file references, root module-relative imports, and JavaScript syntax in root/scripts/tests. It does not fetch external URLs, execute application modules, submit inquiries, validate fragment IDs, or replace browser visual acceptance.

Adds a read-only GitHub Actions workflow for pull requests and pushes to main/build/parker branches. It uses commit-pinned checkout/setup-node, Node 24, npm ci with lifecycle scripts disabled, the source checker, and website tests. No deployment step, credentials, secrets or private JARVIS source is used. Cross-repository FURY/STARK checks remain a separate offline development check; this workflow does not claim to run them or enforce repository branch protection.

Local validation: source checks passed for all five HTML pages after restoring the existing owner inbox files unchanged into the local source fixture. All 37 website tests passed, including regression fixtures reproducing missing CSS assets, missing navigation/module references and invalid JavaScript. Workflow YAML, event configuration, minimal permissions and 40-character action pins were validated. Cloud workflow status is recorded separately after the commit is saved; local execution is not a claim of hosted CI completion.
