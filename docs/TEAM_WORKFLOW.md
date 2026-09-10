# Team Workflow and Module Ownership

Five members own complete domain slices described in [the iteration plan](ITERATION_PLAN.md). These rules keep normal feature work inside one slice and make cross-module changes reviewable.

## Daily development

1. Update from `main` and create a short-lived branch such as `feature/B-patient-history` or `fix/D-review-conflict`.
2. Work in the module you own under `apps/web/src/modules`, the corresponding `apps/api/src/<domain>` directory, and its dedicated contract file. Use public contracts and fixtures for dependencies. The ownership table in the iteration plan maps different UI/API names explicitly.
3. Add a new migration for your domain. Never rewrite a migration that a teammate may already have applied. The scaffold starts with six ordered migrations; coordinate the next version with A and use a domain-specific name. If simultaneous work regularly collides, adopt timestamp-based versions in the runner before creating new migrations.
4. Run the repository's checks and the meaningful tests for your change. Include a screenshot for a UI change and a request/response example for an API change.
5. Open a small pull request describing the user-visible behavior, data migration, compatibility effect and verification. One peer reviews it; the other domain owner also reviews if their public contract changes.
6. Merge after CI passes, then update the shared branch. Until the [CI template](ci/README.md) is activated, attach passing local `npm run check` and Windows `npm run test:desktop` results to the pull request. Resolve conflicts in your branch rather than forcing another member to replace their work.

Use the root npm scripts and committed lockfile. Normal source launch is `npm run build` followed by `npm start`, which opens Electron; `npm run dev` performs both steps. `npm run dev:web` is optional renderer debugging only. End users install the Windows package; they do not run npm commands. Adding a dependency or changing root configuration is a coordinated change because it affects everyone. Do not commit `node_modules`, `release/` installers, build output, `.env`, credentials, runtime databases, uploaded files or real patient data.

## Files that need coordinated review

| Shared area                                                                         | Coordinator                        | Rule                                                                                                                                            |
| ----------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Root scripts, lockfile, CI, TypeScript/lint configuration                           | A                                  | Announce dependency/config changes; use a separate focused pull request                                                                         |
| Renderer shell, navigation, global tokens, `modules/ui.tsx` and `modules/pages.css` | A                                  | Domains compose shared components; add local styles for domain changes and coordinate changes to shared styles                                  |
| Backend composition, configuration, database connection and provider wiring         | A                                  | Domains own `commands.ts`, migrations and repositories; shared composition wires them. Future handlers are added inside the owning command file |
| Shared contract barrel and envelope/error definitions                               | A                                  | Domain owners edit their own contract files; additions to public exports get a short compatibility review                                       |
| Cross-domain API or event                                                           | Producer owner plus consumer owner | Agree fixtures and version behavior before implementation                                                                                       |
| Database migration runner                                                           | A                                  | Domain owners own migration contents; runner executes all unapplied migrations deterministically                                                |

Shared files exist, but they should change infrequently. Do not make every screen add imports to another domain's internal files. If a shared-file conflict recurs, move the extension behind an owned registry entry or module registration function.

## Desktop and localization ownership

A owns `apps/desktop`, window/process lifecycle, private protocol routing, renderer security settings, packaging and the shared language provider. B–E must not import Electron, Node.js or main-process implementations into renderer domains. A purpose-specific desktop capability is proposed through its public contract and receives an explicit integration review.

Each domain owner owns its Chinese source-message keys and English catalog entries, as well as translated planned dialogs, validation/failure states and localized tests. The language identifiers are `zh-CN` and `en`. Do not translate API paths, IDs or enum values in storage. Use the shared locale-aware formatters instead of hard-coded Chinese date strings. Keep clinical free text intact. Test English label lengths and both language controls, including persistence after restart.

Review changes to shared locale persistence or catalog composition with A. Adding a domain translation should normally edit that domain's catalog, not a large shared translation file. Desktop packaging changes require Windows validation; Linux source checks do not prove that the Windows installer runs.

## Contract change process

Write the proposed DTO, success/error examples and required permission first. Identify current consumers and whether the change is additive. Add or update contract fixtures, then update provider and consumer tests. Merge compatible producer additions before consumer use. A required field, renamed route, removed enum value or altered meaning needs explicit migration/versioning; TypeScript compilation alone cannot guarantee compatibility across separately running clients.

Cross-module code imports another module's public facade only. The frontend never imports server internals. The API never imports browser components. No module reaches into another module's tables, mutable store or unexported source files. The optional community module must not subscribe to clinical events or read patient/record repositories.

## Definition of a reviewable feature

- The agreed acceptance scenario works and includes failure cases that matter to users.
- The API validates untrusted input and enforces permission on the server when the feature is enabled.
- New persistent changes have migrations and an upgrade path; concurrent edits and retries have a defined result.
- Relevant checks pass; every new label/dialog/error state works in Chinese and English, including desktop/narrow layouts. Desktop or preference changes include a restart check.
- Documentation describes what is implemented, preview-only, provider-dependent or deferred.
- No sample success toast stands in for an unavailable backend operation.

For the current framework, unavailable operations remain explicitly disabled or return the standard `501 FEATURE_NOT_IMPLEMENTED` response. Demo identity is a synthetic fixture and cannot be used as proof of production authentication or patient authorization.

## Integration and release

Demonstrate one integrated scenario every iteration. Maintain a synthetic acceptance dataset with at least a permitted doctor, a doctor outside patient scope, a junior and senior reviewer, an expired consultation grant, and a failed reminder provider. Start running security scenarios when the relevant feature is implemented; reserved interfaces alone cannot pass those acceptance gates.

Before a release, A records the commit, installer version/checksum, configured providers, schema version, tested Windows/Electron versions, installation/language/restart results and remaining limitations. For a database change, test an upgrade from the previous release and a backup restore. The supplied CI remains an inactive template until a maintainer with workflow permission installs it. Protect `main` with required checks when repository settings permit. Assign GitHub usernames to ownership rules only after the actual team assignments are known.
