---
name: zza-route-testing
description: Comprehensive route testing and documentation skill for ZZA platforms. Use when testing routes, finding 404s, documenting endpoints, checking console errors, or validating builds. Triggers on "test routes", "check pages", "find 404s", "document endpoints", "validate build".
---

# ZZA Route Testing Skill V5.6

Complete methodology for testing, documenting, and fixing route issues in ZZA platforms.

## ⛔ CRITICAL: CONTINUOUS TESTING (Not Post-Build)

**Testing happens DURING the build, not after.**

The neatly2 failure taught us that testing after "completion" is too late. By then:
- Issues have compounded
- Multiple "complete" summaries exist at different percentages
- Expensive rework is required

### Continuous Testing Protocol

```
┌─────────────────────────────────────────────────────────────────────┐
│  AFTER EVERY ROUTE ENHANCEMENT                                     │
│  1. Run `pnpm build` (must pass)                                   │
│  2. Navigate to route in browser                                   │
│  3. Check browser console (zero errors)                            │
│  4. Verify data loads correctly (from database)                    │
│  5. TEST CRUD linked to database:                                  │
│     • Create: add record → verify in DB / list                     │
│     • Read: list + detail show correct data from DB               │
│     • Update: edit form → save → verify change in DB                │
│     • Delete: delete/archive → verify in DB / list                  │
│  6. Update manifest status to "tested"                             │
│  7. ONLY THEN proceed to next route                                │
└─────────────────────────────────────────────────────────────────────┘
                                │
                          Every 5 routes
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  BATCH TESTING                                                     │
│  1. Run security-auditor subagent                                  │
│  2. Run full route crawl (pnpm test:routes)                        │
│  3. Check for regressions                                          │
│  4. Review ISSUES.md for new problems                              │
└─────────────────────────────────────────────────────────────────────┘
```

## When to Use This Skill

- **After skeleton build** (Phase 1 gate check)
- **After each route enhancement** (Phase 3 continuous)
- **Every 5 routes** (batch validation)
- **Before deployment** (Phase 4 final validation)
- **When debugging issues**
- **When user asks about route status**
- **When 404 or 500 errors occur**

## Core Files

| File | Purpose |
|------|---------|
| `routes-manifest.json` | Locked manifest from Phase 0 approval |
| `ROUTES.md` | Human-readable route documentation with status |
| `ISSUES.md` | Known issues and fix tracking |
| `tests/testing-dashboard.html` | Interactive HTML dashboard |
| `scripts/test-routes.ts` | Automated testing script |

## Route Manifest Format (V5.6)

```json
{
  "project": "platform-name",
  "version": "1.0",
  "approved_by": "user",
  "approved_at": "2026-01-28T10:00:00Z",
  "locked": true,
  "phase": 3,
  "summary": {
    "total_routes": 46,
    "skeleton_complete": 46,
    "tested": 12,
    "passing": 10,
    "failing": 2,
    "completion_percentage": 26
  },
  "modules": [
    {
      "name": "leads",
      "routes": [
        {
          "path": "/dashboard/leads",
          "file": "dashboard.leads._index.tsx",
          "description": "List all leads",
          "type": "index",
          "status": "tested",
          "testing": {
            "status": "passing",
            "lastTestedAt": "2026-01-28T15:00:00Z",
            "httpStatus": 200,
            "loadTime": 342,
            "consoleErrors": []
          }
        },
        {
          "path": "/dashboard/leads/new",
          "file": "dashboard.leads.new.tsx",
          "description": "Create new lead",
          "type": "new",
          "status": "skeleton",
          "testing": null
        },
        {
          "path": "/dashboard/leads/:id",
          "file": "dashboard.leads.$id.tsx",
          "description": "View lead details",
          "type": "detail",
          "status": "skeleton",
          "testing": null
        },
        {
          "path": "/dashboard/leads/:id/edit",
          "file": "dashboard.leads.$id.edit.tsx",
          "description": "Edit lead",
          "type": "edit",
          "status": "skeleton",
          "testing": null
        }
      ]
    }
  ],
  "navigation_links": [
    {
      "from": "/dashboard/leads",
      "text": "Create New",
      "to": "/dashboard/leads/new",
      "verified": false
    }
  ]
}
```

## Testing Workflow

### Phase 1 Gate: Skeleton Verification

After creating all skeleton routes:

```bash
# 1. Build check
pnpm build
# Must pass without errors

# 2. Route existence check
pnpm test:routes --skeleton
# Every route in manifest must return 200 or redirect to login
```

### Phase 3: Per-Route Testing (CRUD + Database)

After enhancing each route, verify **Create, Read, Update, Delete** are linked to the database:

```markdown
## Route Test: /dashboard/leads

### Quick Check (Required)
- [ ] `pnpm build` passes
- [ ] Route renders in browser
- [ ] Console is clean (no errors)
- [ ] Loader data loads correctly from DB

### CRUD + Database (MANDATORY before next feature)
- [ ] **Create**: Form creates record → verify in DB (Prisma Studio or list page)
- [ ] **Read**: List shows records from DB; detail page loads single record from DB
- [ ] **Update**: Edit form loads existing data; submit updates record in DB; verify persists
- [ ] **Delete**: Delete/archive removes or soft-deletes; verify in DB and list
- [ ] Navigation links work
```

### Batch Testing (Every 5 Routes)

```bash
# Run security audit
# Use security-auditor subagent

# Run full route crawl
pnpm test:routes --all

# Check for regressions
# Compare current status to previous test results
```

### Phase 4: Final Validation

```bash
# Complete test suite
pnpm test:routes --all --verbose

# Required results:
# - Zero 404s
# - Zero 500s  
# - Zero console errors
# - 100% route coverage

# User must confirm
# Type "BUILD COMPLETE" to finalize
```

## Automated Testing Commands

```bash
# Test all routes
pnpm test:routes

# Test with screenshots
pnpm test:routes --screenshots

# Test specific category
pnpm test:routes --category=dashboard

# Test specific module
pnpm test:routes --module=leads

# Generate detailed report
pnpm test:routes --report

# Skeleton check only (Phase 1)
pnpm test:routes --skeleton

# Open testing dashboard
open tests/testing-dashboard.html
```

## Browser Testing Protocol

When using browser MCP for testing:

```
1. browser_tabs list - Check if browser open
2. browser_navigate - Go to route
3. browser_snapshot - See current state
4. browser_console (if available) - Check errors
5. browser_screenshot - Capture evidence
```

### Authentication for Protected Routes

1. Navigate to `/login`
2. Fill credentials:
   - Email: `admin@test.com` or test user
   - Password: Per platform
3. Submit and verify redirect
4. Continue testing protected routes

## Route Status Definitions

| Status | Icon | Meaning |
|--------|------|---------|
| Skeleton | ⬜ | Route file exists, basic shell |
| Enhanced | 🔨 | Full functionality implemented |
| Tested | ✅ | Tested and passing |
| Failing | ❌ | Tested and has errors |
| Warning | ⚠️ | Works but has issues |

## Issue Severity Guide

| Severity | When to Use | Priority |
|----------|-------------|----------|
| 🔴 Critical | App crashes, data loss, security issue | Fix immediately |
| 🟠 High | Feature broken, 500 error | Fix before next route |
| 🟡 Medium | Partial issues, UI problems | Fix soon |
| 🟢 Low | Minor/cosmetic | Fix eventually |

## Documentation Updates

### After Each Route Test

Update `routes-manifest.json`:

```json
{
  "testing": {
    "status": "passing",
    "lastTestedAt": "2026-01-28T15:00:00Z",
    "httpStatus": 200,
    "loadTime": 342,
    "consoleErrors": []
  }
}
```

### For Failures

Create issue in `ISSUES.md`:

```markdown
## ISS-001: Login route returns 500

**Route**: `/login`
**Severity**: 🔴 Critical
**Status**: Open
**Discovered**: 2026-01-28
**Assigned**: [Name]

### Description
The login route crashes when...

### Steps to Reproduce
1. Navigate to /login
2. ...

### Console Errors
```
Error: Cannot read property...
```

### Fix
[After fixing, document the solution]

### Verified
- [ ] Fix applied
- [ ] Route tested
- [ ] Manifest updated
```

## Pre-Deployment Checklist

Before deploying, verify:

- [ ] Phase 0: PRD approved, manifest locked
- [ ] Phase 1: All routes exist (zero 404s)
- [ ] Phase 3: All routes enhanced and tested
- [ ] Phase 4: Final validation passed
- [ ] All routes tested (0 untested)
- [ ] No critical/high severity issues open
- [ ] Console errors resolved
- [ ] Screenshots captured for key pages
- [ ] ROUTES.md updated
- [ ] ISSUES.md shows all known issues
- [ ] User confirmed "BUILD COMPLETE"

## Integration with Build Process

### After Skeleton Build (Phase 1)
```
1. Verify routes-manifest.json exists (from Phase 0)
2. Run pnpm test:routes --skeleton
3. Verify zero 404s
4. Update manifest status for all skeleton routes
5. GATE: Must pass before Phase 2
```

### During Enhancement (Phase 3)
```
For each route:
1. Implement full functionality
2. Run single-route test
3. Update manifest status
4. GATE: Must pass before next route

Every 5 routes:
1. Run batch test
2. Run security audit
3. Check for regressions
```

### Before Deployment (Phase 4)
```
1. Run pnpm test:routes --all --verbose
2. Review ISSUES.md for blockers
3. Verify no critical issues
4. Generate final report
5. User types "BUILD COMPLETE"
```

## Subagent Usage

### route-tester
Use for systematic testing:
```
"Use route-tester to test all dashboard routes"
```

### issue-tracker
Use for issue management:
```
"Use issue-tracker to log this 500 error"
```

### security-auditor
Use every 5 routes and before deployment:
```
"Use security-auditor to review the leads module"
```

## Quick Reference

### Start Testing
```bash
pnpm dev  # Start app
pnpm test:routes  # Run tests
```

### View Results
```bash
open tests/testing-dashboard.html  # Interactive
cat ISSUES.md  # Issues list
cat ROUTES.md  # Route status
```

### Fix Workflow
```
1. See failing route in ISSUES.md
2. Fix the code
3. Re-run: pnpm test:routes --module=X
4. Verify status changes to passing
5. Update manifest status
6. Mark issue as fixed
```

## neatly2 Lessons Learned

| What Went Wrong | Prevention |
|-----------------|------------|
| Testing was post-build | Test after EVERY route enhancement |
| Issues discovered after "completion" | Continuous testing during build |
| Multiple "complete" summaries | Single locked manifest, one "BUILD COMPLETE" |
| 6 open issues at launch | No critical issues allowed before deploy |

## Best Practices

1. **Test early and continuously** - After every route, not at the end
2. **Document everything** - Screenshots, console logs, manifest updates
3. **Fix critical first** - Prioritize blockers
4. **Update docs immediately** - Keep manifest current
5. **Verify fixes** - Re-test after fixing
6. **Single source of truth** - One manifest, one completion confirmation
7. **Gate enforcement** - Don't proceed until gates pass
