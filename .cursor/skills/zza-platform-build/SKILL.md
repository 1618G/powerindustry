---
name: zza-platform-build
description: Build production-ready platforms from ZZA_Build V5.6 Enterprise starter template. Use when building a new platform, creating dashboard pages, extracting route manifests from specs, or working with ZZA ecosystem projects. Triggers on mentions of ZZA_Build, platform building, route manifest, or dashboard creation.
---

# ZZA Platform Build Skill V5.6

Build enterprise-grade platforms from the ZZA_Build starter template. This skill ensures complete builds with zero 404s, zero stubs, and 100% feature completion on first pass.

## ⛔ CRITICAL: PHASE 0 - REQUIREMENTS LOCK (MANDATORY)

**Before writing ANY code, Phase 0 MUST complete.**

### Phase 0 Workflow

```
1. CHECK: Does PRD/Spec exist?
   ├── YES → Proceed to step 2
   └── NO → STOP, ask user for PRD, offer to help create one

2. EXTRACT: Use route-extractor subagent
   └── Extract FULL CRUD for every module (Index, New, Detail, Edit)

3. PRESENT: Show Route Manifest with exact counts
   └── Module Completeness Summary table
   └── Every route with file name
   └── Total count

4. WAIT: User must type "APPROVED"
   └── DO NOT proceed without explicit approval

5. LOCK: Save manifest as routes-manifest.json
   └── Proceed to Phase 1
```

### If No PRD Exists

```
❌ DO NOT start coding
❌ DO NOT create route files
❌ DO NOT design database schema

✅ Say:
"I need a PRD or technical specification document before I can build. Please provide:
1. PRD.md or SPEC.md with all features described
2. Complete list of all routes/pages
3. Database schema requirements
4. Business logic workflows

Would you like me to help you create a PRD using our template?"
```

## ⛔ CRITICAL: NO STUB CODE POLICY

**NEVER create code that throws "not implemented":**

```typescript
// ❌ ABSOLUTELY FORBIDDEN:
export async function findById(id: string) {
  throw new Error("Not implemented");
}

export async function action({ request }: ActionFunctionArgs) {
  return json({ error: "Not implemented" }, { status: 501 });
}

// ✅ CORRECT - Either implement fully or don't create:
export async function findById(id: string) {
  return db.entity.findUnique({ where: { id } });
}
```

**If blocked on implementation:**
1. STOP and ask user which features to prioritize
2. DO NOT create stub files
3. Either implement fully or defer entirely

## Critical Rules

### 1. NEVER Scaffold From Scratch
```
❌ "Let me create a new Remix app..."
❌ "First, let's set up authentication..."
✅ "Using your ZZA_Build project, I'll extend..."
```

### 2. Route Manifest First (MANDATORY)
Before ANY coding, extract and confirm ALL routes from specs:

```markdown
## 📋 ROUTE MANIFEST FOR [PROJECT NAME]

### Module Completeness Summary
| Module | Index | New | Detail | Edit | Total |
|--------|-------|-----|--------|------|-------|
| Leads | ⬜ | ⬜ | ⬜ | ⬜ | 4 |
| Accounts | ⬜ | ⬜ | ⬜ | ⬜ | 4 |
| Jobs | ⬜ | ⬜ | ⬜ | ⬜ | 4 |

---

### Dashboard Routes (X total)

#### Module: Leads (4 routes)
| Route | File | Description | Status |
|-------|------|-------------|--------|
| `/dashboard/leads` | `dashboard.leads._index.tsx` | List all leads | ⬜ To Build |
| `/dashboard/leads/new` | `dashboard.leads.new.tsx` | Create new lead | ⬜ To Build |
| `/dashboard/leads/:id` | `dashboard.leads.$id.tsx` | View lead details | ⬜ To Build |
| `/dashboard/leads/:id/edit` | `dashboard.leads.$id.edit.tsx` | Edit lead | ⬜ To Build |

### Admin Routes (X total)
| Route | File | Description | Status |
|-------|------|-------------|--------|

### API Routes (X total)
| Method | Route | Description | Status |
|--------|-------|-------------|--------|

### Navigation Links to Verify
| From Page | Link Text | Target Route | Status |
|-----------|-----------|--------------|--------|
| Leads Index | "Create New" | /dashboard/leads/new | ⬜ |
| Leads Index | Row "View" | /dashboard/leads/:id | ⬜ |
| Leads Index | Row "Edit" | /dashboard/leads/:id/edit | ⬜ |

---

**TOTAL ROUTES TO BUILD: X modules × 4 CRUD = Y routes**
```

### 3. Test Every Feature (CRUD + Database)

**Before marking any feature "done" or moving to the next:**

1. **Create** – Form/action creates a record; verify it appears in DB (e.g. Prisma Studio or list page).
2. **Read** – Index shows list; detail page shows single record; data comes from DB.
3. **Update** – Edit form loads existing data; submit updates record in DB; verify change persists.
4. **Delete** – Delete/archive action removes or soft-deletes; verify in DB and list/detail.

Do not proceed to the next feature until the current one has all four operations working and linked to the database.

### 4. Build Order (Phase Gates)
```
PHASE 0: REQUIREMENTS LOCK ⛔
├── PRD exists and routes extracted
├── User typed "APPROVED" on manifest
└── GATE: Cannot proceed without APPROVED

PHASE 1: SKELETON ALL ROUTES ⛔
├── Create ALL route files with basic shells
├── Run `pnpm build` - MUST pass
├── Navigate to EVERY route - zero 404s
└── GATE: `pnpm build` must pass, zero 404s

PHASE 2: DATABASE SCHEMA ⛔
├── Design Prisma schema (use schema-designer)
├── Run pnpm db:push:safe
├── NO stub repositories
└── GATE: `pnpm build` must pass, no stub code

PHASE 3: ENHANCE (Vertical Slices) ⛔
├── Complete ONE route/feature at a time
├── For EACH feature: implement full CRUD linked to database
├── TEST every feature: Create → Read (list + detail) → Update → Delete; verify data persists in DB
├── Run security-auditor every 5 routes
├── Update manifest status to "tested" only after CRUD + DB verified
└── GATE: Route must work AND CRUD tested with database before next route

PHASE 4: FINAL VALIDATION ⛔
├── Run full route test
├── Zero 404s, Zero 500s
├── Zero console errors
└── GATE: User confirms "BUILD COMPLETE"
```

### 5. Always Use pnpm
```bash
✅ pnpm install / pnpm dev / pnpm add
❌ npm / yarn / npx
```

### 6. Route Naming Convention (MANDATORY)
```
✅ CORRECT:
dashboard.client._index.tsx      → /dashboard/client
dashboard.client.jobs.tsx        → /dashboard/client/jobs
dashboard.declutterer.earnings.tsx → /dashboard/declutterer/earnings

❌ WRONG (neatly2 mistake):
client._index.tsx                → /client (WRONG!)
declutterer.earnings.tsx         → /declutterer/earnings (WRONG!)
```

## Pre-Build Questions (MANDATORY)

Ask these BEFORE writing any code:

1. "Do you have a PRD or technical specification document for this project?"
   - If NO: Offer to help create one
   - DO NOT proceed without PRD

2. "I've extracted X routes from the specs (Y modules × 4 CRUD each). Is this list complete?"
   - Present the Route Manifest
   - Wait for "APPROVED"

3. "Are there additional pages not in the specs?"
   - Capture any missing requirements

4. "Type 'APPROVED' to proceed with building all X routes."
   - DO NOT create files until approved

## Existing Services (DO NOT RECREATE)

The template includes 19+ production services:

| Service | Purpose |
|---------|---------|
| stripe.server.ts | Payments, subscriptions, Connect |
| ai.server.ts | OpenAI, Gemini |
| email.server.ts | SendGrid, Gmail |
| soc2-compliance.server.ts | Audit logging |
| file-upload.server.ts | WebP optimization |
| rate-limit.server.ts | Per-endpoint limiting |
| oauth.server.ts | Google, GitHub |
| magic-link.server.ts | Passwordless auth |
| mfa.server.ts | 2FA |
| paywall.server.ts | Feature gating |
| feature-flags.server.ts | Feature flags |
| dead-letter.server.ts | Failed job handling |

## Architecture Layers

```
Routes (app/routes/) → Services (app/services/) → Repositories (app/repositories/) → Database
```

**Rules:**
- Routes: CAN import services, middleware. CANNOT import db.
- Services: CAN import repositories. CANNOT import db.
- Repositories: ONLY place to import db from ~/lib/prisma.

## Route Skeleton Template

```tsx
// app/routes/dashboard.feature.tsx
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { requireUser } from "~/utils/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  return json({ user });
}

export default function FeaturePage() {
  const { user } = useLoaderData<typeof loader>();
  
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-6">Feature Name</h1>
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <p className="text-gray-400">Feature content coming soon...</p>
      </div>
    </div>
  );
}
```

## UI Standards

```
Background: gray-950
Cards: gray-900
Inputs: gray-800
Borders: gray-700
Text Primary: white
Text Secondary: gray-400
Accent: red-500
```

## Verification Checklist

Before saying "build complete":
- [ ] Phase 0 complete (PRD exists, manifest APPROVED)
- [ ] ALL routes render (zero 404s)
- [ ] ALL navigation works
- [ ] No stub code (no "not implemented" errors)
- [ ] `pnpm build` passes
- [ ] Database schema complete
- [ ] All features functional
- [ ] User confirmed "BUILD COMPLETE"

## Continuous Testing Protocol

**Test after EVERY route enhancement:**
```
1. Run `pnpm build` (must pass)
2. Navigate to route in browser
3. Check console for errors (must be clean)
4. Verify data loads correctly
5. Test any actions/forms
6. Update manifest status to "tested"
7. ONLY THEN proceed to next route
```

**Every 5 routes:**
```
1. Run security-auditor subagent
2. Run full route crawl
3. Check for regressions
```

## Subagent Sequence for New Builds

```
1. pre-flight-validator → Check PRD exists, no blockers
2. route-extractor → Extract and present Route Manifest
3. [User types APPROVED]
4. schema-designer → Design Prisma schema
5. [Build phases 1-3]
6. security-auditor → Pre-deployment review
```

## neatly2 Lessons Learned (January 2026)

| What Went Wrong | Prevention |
|-----------------|------------|
| No PRD before build | Phase 0 blocks until PRD provided |
| Manifest created during build | Manifest extracted and APPROVED before coding |
| Routes at wrong path (`/client/*` vs `/dashboard/client/*`) | Route naming convention enforced |
| 4 stub repositories ("not implemented") | No-Stub Policy blocks stub code |
| 3 different "complete" summaries (55%, 66%, 66%) | Single source of truth, user confirms "BUILD COMPLETE" |
| Testing was post-build | Continuous testing after each route |
| 37 TODOs, 20 API routes returning 501 | Either implement or defer, no stubs |

## Additional Resources

- See [build-profiles/james.profile.md](../../build-profiles/james.profile.md) for detailed patterns
- See [.cursorrules](../../../../.cursorrules) for full methodology
- See [.cursor/templates/PRD-TEMPLATE.md](../../.cursor/templates/PRD-TEMPLATE.md) for PRD format
