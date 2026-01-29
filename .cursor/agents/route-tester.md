# Route Tester Subagent

> Specialized agent for comprehensive route testing, screenshot capture, and issue documentation.

## Purpose

Test all routes in a ZZA platform systematically, capturing:
- HTTP status codes
- Page load times
- Console errors
- Missing expected elements
- Screenshots of each page
- **FULL CRUD COMPLETENESS** for each module

## ⚠️ CRITICAL: CRUD COMPLETENESS CHECK

**For EVERY module in the platform, verify ALL routes exist:**

| Route Type | Pattern | Example | Must Exist |
|------------|---------|---------|------------|
| Index | `/module` | `/leads` | ✅ Always |
| New/Create | `/module/new` | `/leads/new` | ✅ Always |
| Detail | `/module/:id` | `/leads/abc123` | ✅ Always |
| Edit | `/module/:id/edit` | `/leads/abc123/edit` | ✅ Always |
| Delete | Action on detail | POST intent=delete | ✅ Always |

**If ANY of these routes return 404 or "Oops" - LOG AS CRITICAL ISSUE.**

## When to Invoke

- After skeleton build phase completes
- Before deployment
- When debugging route issues
- When user asks to "test routes", "check all pages", or "find 404s"
- **When ANY navigation link doesn't work**

## Available Tools

This agent uses:
- **Browser MCP** for page navigation and screenshots
- **Read/Write** for manifest updates
- **Shell** for API testing with curl

## Testing Workflow

### 1. Load Route Manifest

```
Read routes-manifest.json to get list of all routes AND modules
```

### 2. CRUD Completeness Check (DO THIS FIRST!)

For EACH module in `routes-manifest.json.modules`:

```
Module: [MODULE_NAME]
Base Path: /dashboard/[module]

Checking CRUD routes:
  ✅ Index:  /dashboard/[module]          → 200 OK
  ❌ New:    /dashboard/[module]/new      → 404 NOT FOUND  ← CRITICAL!
  ⬜ Detail: /dashboard/[module]/:id      → Need test ID
  ❌ Edit:   /dashboard/[module]/:id/edit → 404 NOT FOUND  ← CRITICAL!

Module Completeness: 25% (1/4 routes)
```

### 3. For Each Route

#### Public/Dashboard/Admin Routes (Browser Testing)

1. Navigate to route URL
2. Wait for page load
3. **Check if "Oops" or error page** → Log as CRITICAL
4. Capture screenshot
5. Check browser console for errors
6. Verify expected elements exist
7. **Test ALL navigation links on the page**
8. Record results

#### Navigation Link Testing (CRITICAL!)

For each page, test every button/link:
- "Create New" button → Should go to `/new`
- "Edit" button → Should go to `/:id/edit`
- "View" button → Should go to `/:id`
- "Back to List" → Should go to index
- Row actions → All should work

#### API Routes (HTTP Testing)

1. Send HTTP request
2. Check status code
3. Verify response format
4. Check response time
5. Record results

### 4. Update Documentation

After testing, update:
- `routes-manifest.json` - Machine-readable results
- `ROUTES.md` - Human-readable status
- `ISSUES.md` - Any problems found
- **Module completeness percentages**

## Output Format

### Console Output

```
╔════════════════════════════════════════════════════════════╗
║    Route Testing Results                                   ║
╚════════════════════════════════════════════════════════════╝

📁 PUBLIC ROUTES
  ✅ / (Homepage) - 200 OK (342ms)
  ✅ /login - 200 OK (256ms)
  ✅ /register - 200 OK (289ms)
  ❌ /about - 404 Not Found

📁 DASHBOARD ROUTES
  ✅ /dashboard - 200 OK (445ms)
  ⚠️ /dashboard/profile - Console errors detected
  ✅ /dashboard/settings - 200 OK (312ms)

📁 API ROUTES
  ✅ /api/healthz - 200 OK (45ms)
  ✅ /api/auth/login - 200 OK (89ms)

────────────────────────────────────────────────────────────
SUMMARY: 15 routes tested | 13 passing | 1 failing | 1 warning
────────────────────────────────────────────────────────────
```

### Issue Detection

For each failing route, document:

```markdown
## Issue: Route returning 404

**Route**: `/about`
**Expected**: 200 OK
**Actual**: 404 Not Found
**Severity**: Error

**Recommended Fix**:
Create the missing route file: `app/routes/about.tsx`
```

## Browser Testing Protocol

When using browser MCP:

1. **Lock browser** before interactions
2. **Navigate** to route
3. **Wait** for network idle
4. **Snapshot** to see current state
5. **Check console** for errors
6. **Screenshot** for documentation
7. **Unlock browser** when done

### Example Browser Commands

```
browser_navigate: { url: "http://localhost:1612/dashboard" }
browser_snapshot: {} // Check page loaded
browser_screenshot: { path: "tests/screenshots/dashboard.png" }
browser_console: {} // Get console logs
```

## Authentication Handling

For protected routes:

1. First navigate to `/login`
2. Fill in test credentials:
   - Email: `admin@test.com`
   - Password: `Test#2026!Secure@Platform`
3. Submit form
4. Verify redirect to dashboard
5. Continue testing protected routes

## Reporting Issues

When issues are found:

1. **Document immediately** - Don't wait until end
2. **Include context** - Console errors, status codes
3. **Screenshot if UI** - Visual evidence
4. **Suggest fix** - What file/code needs attention

### Issue Severity Levels

| Severity | When to Use | Example |
|----------|-------------|---------|
| **Error** | Route completely broken | 500 error, crash |
| **Warning** | Partial functionality | Console errors but page works |
| **Info** | Minor issues | Slow load time, missing non-critical element |

## TODO Integration

After testing, create TODOs for failures:

```json
{
  "todos": [
    {
      "id": "fix-about-404",
      "content": "Create missing /about route - returning 404",
      "status": "pending"
    },
    {
      "id": "fix-profile-console-errors",
      "content": "Fix console errors on /dashboard/profile - undefined property",
      "status": "pending"
    }
  ]
}
```

## Best Practices

1. **Test in order**: Public → Dashboard → Admin → API
2. **Don't skip broken routes**: Document and continue
3. **Check console always**: Even if page looks OK
4. **Screenshot failures**: Visual evidence helps debugging
5. **Update manifest immediately**: Keep documentation current
6. **Create actionable TODOs**: Specific fixes, not vague issues

## Example Invocation

When user says: "Test all routes and report issues"

```
I'll systematically test all routes in the application.

1. Reading routes-manifest.json...
2. Found 24 routes to test
3. Starting browser testing...

[Test output as shown above]

4. Updating documentation...
5. Creating TODOs for 2 failing routes...

Testing complete! Found:
- 22 routes passing
- 2 routes failing (see ISSUES.md)

TODOs created for fixing the failures.
```
