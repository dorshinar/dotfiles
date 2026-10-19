---
name: thermo-nuclear-migration-review
description: Extremely strict review of a route's search-params and/or preload migration against the migration skills' contracts. Reports evidence-backed findings only.
disable-model-invocation: true
argument-hint: '[pr-number | branch | path]'
---

# Thermo-Nuclear Migration Review

The migration-specific sibling of `thermo-nuclear-code-quality-review`. That skill hunts structural mess; this one hunts **contract drift**: every place a route migration quietly diverges from the pattern the two migration skills define. A migration that "works" but leaves the route half-in, half-out of the new model is the failure mode. Assume the diff contains at least one.

Rulebooks, read them before the diff and cite them in findings:

- `web/.claude/skills/migrate-route-to-search-params/SKILL.md` and its sibling files (`analytics-migration.md`, `parent-prerequisites.md`, `path-param-routes.md`, `navbar-sections.md`)
- `web/.claude/skills/migrate-route-to-preload/SKILL.md`

Their end-state checklists, hard rules, and common-pitfalls sections are the review's rubric. This skill adds the audit order, the presumptive blockers, and the corrections where field experience has overruled the rulebook text.

## Core prompt

> Audit the branch's route migration against the migration contracts. For every route touched: prove it is fully migrated, prove the preload verdict was made and honored, prove no consumer was left on the legacy path, and prove no behavior beyond the migration itself changed. Measure twice, cut once. A finding without a file:line and a rulebook citation is a hunch, not a finding.

## Step 0 — Scope

Establish the diff: `git diff origin/develop...HEAD --stat` (or the PR's diff). List every file route touched under `apps/portal/src/router/routes/`, every `defineRoute` file added or deleted under `apps/portal/src/common/routes/`, and every page/hook/consumer file in the diff. Then classify each touched route:

| Shape | Marker | Rulebook branch |
| --- | --- | --- |
| search-params route | inline Zod schema + `defineSearchParams` | main search-params flow |
| `{-$tab}` path-param route | `params.parse` on the route | `path-param-routes.md` |
| tab-split route | layout `route.tsx` + sibling `<tab>.tsx` files | `path-param-routes.md`, tab-split section |
| no-search route | `staticData` with no `searchParamKeys` | `path-param-routes.md`, no-search section |
| table preload | `preloadTableRouteQuery` | preload skill, flagship section |
| multi-query preload | `preloadMultiQueryRouteQuery` | preload skill, non-table section |

Wrong shape is itself a finding: a tabbed page with per-tab filter schemas or per-tab primary queries forced into one `{-$tab}` route, or a non-table page wired through `preloadTableRouteQuery` with an empty schema and a `() => undefined` converter.

Done when: every touched route has a shape and a rulebook branch written down.

## Step 1 — Completeness audit (search params)

Skip only if the branch touches no search-params migration. Otherwise, for each route, verify each item with a grep or file read and record the evidence:

1. `export const staticData = { … } satisfies PortalRouteDefinition` exists on the file route. A `const staticData: PortalRouteDefinition` annotation, or a missing `export`, is a blocker: `routeStaticData.gen.ts` will not pick it up and `useStaticData()` degrades.
2. The route's `defineRoute` file is deleted. `defineSearchParams` wired while the legacy file survives is **not migrated**, whatever the PR title says.
3. `grep -rn "<deletedRouteSymbol>\b" apps/portal/src` returns nothing, including barrel re-exports and `.pageView(` calls.
4. Both halves are wired when the route owns search params: `validateSearch: searchParams.validate` and `staticData.searchParamKeys: searchParams.keys`. Neither is wired when it owns none. An empty-schema `validateSearch` is a blocker: it collapses the app-wide search type.
5. Any `.default(...)` in the schema is matched by `search: { middlewares: searchParams.middlewares }`.
6. Analytics: `legacyRoute.pageView(...)` has no surviving call; `staticData.analytics` uses `definePageViewAnalytics` over the same inline schema; mixed routes use one `{ search, path }` policy, never `composePageViewAnalytics` bridging legacy hash.
7. Page identity: every `PortalLensPageId` the deleted route(s) carried is reachable from `staticData.pageId` or a `staticData.tabs` entry. This one drops silently and shows up only as zero traffic. Check it even when the route had no `.pageView`.
8. Page title comes from `useStaticData().title`; page-local `PAGE_TITLE` constants are gone.
9. `useFiltersEditorNext` / `useOrderByNext` / `useGroupBySearchParam` replaced their legacy counterparts; `columnsPersistence` tables have both `cols` in the schema and `columnsUrlStorage="search"`.
10. Parent prerequisites: the child declares only its own; inlined parent prereqs double-apply. A deleted legacy parent leaves each still-legacy child with the compatibility bridge from `parent-prerequisites.md`.
11. Lens nav pages: `lens-page-config.ts` entry switched to `PortalLensPageSearchConfig<'/path'>`, every preset lens renamed `pathParams:` → `searchParams:`.
12. `grep -rn "from .*router/router'" apps/portal/src` has not grown.

Done when: all twelve items have a recorded pass or a recorded finding for every route.

## Step 2 — Navigation-target audit

Every navigation target the diff produces must be strictly typed. Walk each one:

- Object form (`{ to, search, params }`), including inside `navigate(...)`, menu actions, link builders, and suggested views → wrapped in `linkOptions(...)` from `@wiz-ui/tanstack-router`. This is the single most common miss on `buildPath` translations. A `{ to: routePath('/x'), search: {…} }` object is a finding: `routePath` checks the path and leaves `search` unchecked.
- Bare string on a `to` / `navigateTo` / `settingsTo` / `settingsPath` prop → `getRouteApi(...).path` or `routePath(...)`. A bare literal type-checks a dead link.
- Correction to the rulebook: Step 6a of the search-params skill still shows `<Link to={routePath(...)} search={…}>`. Field practice (reviewer feedback, 2026-08-24) is `linkOptions` for anything that carries `search` or `params`, `Link` props included. Flag `routePath` used for a link target; leave it only on runtime path comparisons and navbar `path:` config fields where the file already uses it.

Done when: every target in the diff is listed with its form and its typing helper.

## Step 3 — Preload audit

Runs for every branch: a search-params migration without an explicit **preload verdict** is unfinished (search-params skill, Verification step 8). Find the verdict in the PR description or wrap-up. Eligible → preload must be in the same PR unless the user opted out explicitly. Ineligible → only two accepted reasons: nothing to fetch before mount, or detail-by-`$id`. "No `useQueryTable`" is not a reason; that shape uses `preloadMultiQueryRouteQuery`.

When preload is wired, verify:

1. **Prerequisite is whole.** Every query driver (filters, tab, order, group-by) reads from validated `location.search`. Any hash read inside the loader, on-mount redirect synthesizing search state, or "temporary" fallback is a blocker.
2. `staticData.pageId` is set. Without it the loader silently never preloads and the PR ships a no-op.
3. The same `searchParams` object feeds `validateSearch`, `searchParamKeys`, and the loader (nested preloaders included).
4. Route sets `staleTime: PORTAL_ROUTE_LOADER_STALE_TIME_MS`.
5. Converter is object-form `({ filters, projectId, tabConfig? })`. Inline converters have annotated param and return types; an un-annotated one widens the API filter to `unknown`.
6. Page reads the bundle via `getRouteApi(path).useLoaderData()`, takes `projectId` from it with no `useProjectScope()` fallback, and rebuilds `filterBy` / `orderBy` / `groupBy` from the **live** editors spread over `...variables`.
7. Capability fields (`tabConfig`, `groupByDocument`) are used without null-checks; `groupByVariables` is spread under `skip`, never guarded.
8. Static config (tab configs, filter options) is imported by the page, never returned from the loader.
9. Loader-driving lens defaults stay on the page through `usePortalLensPageConfig`; the loader is lens-agnostic.
10. `pageSize` on the loader equals the page's `useQueryTable` page size; `extraVariables` covers every required non-filter variable (flag-driven `@include` arguments especially), or the preload never hits cache.
11. Mixed pages nest a table loader under `preloaders` only for a `useQueryTable` consumer; plain-`useQuery` filter-driven queries live in `queries` with a variables function.
12. Section-level and card-level queries stayed on the page. The loader carries the page's own primary queries only; a loader that absorbed every eligible fetch is a complexity finding, not a bonus.

Done when: the verdict is quoted and all twelve items have evidence for every preloading route.

## Step 4 — Behavior-preservation audit

The migration moves code; it changes nothing else. Diff the old path against the new for each of these, and treat any delta as a finding unless the PR explains it:

- **Fetch policy.** The no-preload branch of `isPreloadEnabled ? 'cache-first' : X` must equal the query's pre-migration policy. A query that passed none gets `undefined` (the client default is `network-only`), never a copied `'cache-and-network'`. Detached-mutation routes (`/x/new`) stay on plain `cache-and-network` with the explaining comment.
- **Guards and error filters.** A query that fired ungated before fires ungated now; a `filterErrorTypes` context threads through to the preload entry. New scope or auth gates added "because a bot flagged it" are out of scope and a finding.
- **Defaults.** Filter, tab, group-by, and order defaults resolve to the same effective values, with the schema as single owner.
- **Mutations.** Every mutation that changes preloaded data has `refetchQueries` + `awaitRefetchQueries`, or the stale entry is served within `staleTime`.
- **Correction to the rulebook on `loaderDeps`.** The preload skill says tabbed routes put `tab` in `loaderDeps`. Field result (licenses page, 2026-09-16): with `defaultPendingMs: 0`, every tab click becomes a new match with no data and the pending spinner replaces the page. Flag `tab` in `loaderDeps` unless the loader genuinely must rerun per tab. The accepted shape is `loaderDeps: () => withProjectScope()` with the page rebuilding tab-driven variables from the live tab, taking only `projectId` and `isPreloadEnabled` from the bundle. `useCloudResourcesTable` predates this finding; do not cite it as precedent for `tab` in deps.

Done when: each bullet has a recorded "unchanged" or a finding.

## Step 5 — Structural pass

Apply the `thermo-nuclear-code-quality-review` standards to the migrated files, with these migration-specific smells on top:

- A sidecar `xSearchParams.ts` when the schema belongs inline in the file route (a shared schema across a tab split is the exception).
- A relocated prerequisite constant instead of an inlined `staticData.prerequisites` + `getRoutePrerequisites` consumers.
- Route static data threaded through context, factory params, or hooks when `getRouteApi(...).useStaticData()` / `getRouteStaticData` reaches it directly.
- A non-zero-arg `ResolvablePortalPrerequisites` thunk.
- `useSearchParam` called with a fresh object/array default literal, or N read-only `useSearchParam` calls re-bundled with `useMemo` where one `useSearch({ select })` fits.
- Two setter calls where one atomic `navigate({ search: prev => … })` was needed.
- A bespoke `getLoaderData` for a shape one of the two built loaders already covers.
- Variables derived twice (loader and page) with different logic; the bundle's converter and `...variables` exist to make that one definition.
- Hand-rolled hash `omit(cols)` or `useGetCurrentHashParams` on a migrated route.
- `createRenderer` on a tab-split child (forces a skeleton frame under mounted chrome).

## Output

Order findings by severity:

1. Incomplete migration (legacy file alive, consumer left behind, missing `staticData` export, missing `pageId`, empty `validateSearch`)
2. Preload prerequisite violations and silent no-op preloads
3. Behavior changes beyond the migration (fetch policy, guards, defaults, `tab` in `loaderDeps`)
4. Untyped navigation targets
5. Missing or wrong preload verdict
6. Structural smells

Each finding: `file:line`, the rulebook section it violates (or the correction above), what breaks or drifts, and the fix. One high-conviction finding beats five hedged ones. Findings verified as false on inspection are dropped, not softened.

Close with a per-route table: shape, search-params status (migrated / partial / n-a), preload status (wired / verdict-ineligible-with-reason / missing verdict), and blocker count.

## Approval bar

Approve only when every route in the diff meets all of:

- `defineRoute` deleted, zero straggler references, `export const staticData … satisfies` present
- search wiring matches the route's shape exactly (both halves, or neither)
- a preload verdict is stated and honored
- every preloading route has `pageId`, a whole URL-state prerequisite, live-filter rebuild, and no static config in the bundle
- no-preload fetch policy, guards, and defaults are unchanged from pre-migration
- every navigation target is typed through `linkOptions` or a checked path helper
- no `tab` in `loaderDeps` without a stated reason the loader must rerun

Anything short of that gets explicit, actionable feedback and stays unapproved.
