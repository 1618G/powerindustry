# Issue Tracker Subagent

> Specialized agent for tracking, documenting, and managing issues found during development and testing.

## Purpose

Maintain comprehensive issue tracking by:
- Logging all issues discovered during testing
- Tracking fix progress
- Updating documentation
- Creating actionable TODOs
- Verifying fixes

## When to Invoke

- When route-tester finds issues
- When user reports a bug
- When console errors are observed
- When 404/500 errors occur
- When asking "what's broken?" or "track this issue"

## Issue Categories

### 1. Route Issues
- 404 Not Found
- 500 Server Error
- Redirect loops
- Auth failures

### 2. UI Issues
- Missing elements
- Layout broken
- Responsive issues
- Accessibility problems

### 3. Console Errors
- JavaScript errors
- React errors
- Network failures
- Unhandled promises

### 4. Functionality Issues
- Form submission failures
- Data not loading
- Actions not working
- State management bugs

## Issue Documentation Format

### ISSUES.md Entry

```markdown
## ISS-001: Homepage returning 500 error

**Route**: `/`
**Severity**: 🔴 Critical
**Status**: Open
**Discovered**: 2026-01-26 14:30
**Discovered By**: route-tester

### Description
Homepage crashes on load with 500 Internal Server Error.

### Console Output
```
Error: Cannot read properties of undefined (reading 'user')
    at loader (app/routes/_index.tsx:15:23)
```

### Steps to Reproduce
1. Navigate to http://localhost:1612/
2. Observe 500 error

### Expected Behavior
Homepage should load with welcome message.

### Actual Behavior
500 Internal Server Error displayed.

### Suggested Fix
Check if user is defined before accessing properties in `app/routes/_index.tsx` line 15.

### Screenshot
![Error Screenshot](tests/screenshots/issues/iss-001.png)

---
```

### routes-manifest.json Update

```json
{
  "issues": [
    {
      "id": "ISS-001",
      "route": "/",
      "title": "Homepage returning 500 error",
      "description": "Loader crashes when user is undefined",
      "severity": "error",
      "status": "open",
      "consoleErrors": [
        "Error: Cannot read properties of undefined (reading 'user')"
      ],
      "screenshotPath": "tests/screenshots/issues/iss-001.png",
      "createdAt": "2026-01-26T14:30:00Z",
      "file": "app/routes/_index.tsx",
      "line": 15
    }
  ]
}
```

## Tracking Workflow

### 1. Issue Discovery

When an issue is found:

1. **Generate ID**: `ISS-XXX` format
2. **Categorize**: Route/UI/Console/Functionality
3. **Assess severity**: Critical/High/Medium/Low
4. **Document immediately**

### 2. Issue Assignment

Create TODO for fix:

```
TODO: [ISS-001] Fix homepage 500 error - check user undefined
File: app/routes/_index.tsx:15
```

### 3. Fix Verification

After fix is applied:

1. Re-run route-tester for that route
2. Verify console is clean
3. Update issue status to "fixed"
4. Add fix notes

### 4. Documentation Update

Update all relevant files:
- `ISSUES.md` - Mark as fixed
- `routes-manifest.json` - Update status
- `ROUTES.md` - Update route status

## Severity Classification

| Severity | Icon | Description | Action |
|----------|------|-------------|--------|
| Critical | 🔴 | App unusable, crash, data loss | Fix immediately |
| High | 🟠 | Major feature broken | Fix before deploy |
| Medium | 🟡 | Feature partially broken | Fix in next sprint |
| Low | 🟢 | Minor issue, cosmetic | Fix when possible |

## Issue Status Lifecycle

```
New → Open → In Progress → Fixed → Verified → Closed
         ↘ Won't Fix
         ↘ Duplicate
```

## Console Error Handling

When console errors are detected:

### JavaScript Errors
```javascript
// Error example
TypeError: Cannot read properties of undefined (reading 'name')

// Document as:
{
  "type": "javascript",
  "message": "Cannot read properties of undefined (reading 'name')",
  "file": "app/components/UserCard.tsx",
  "line": 23,
  "column": 15
}
```

### React Errors
```javascript
// Error example
Warning: Each child in a list should have a unique "key" prop.

// Document as:
{
  "type": "react",
  "message": "Missing key prop in list",
  "component": "UserList",
  "severity": "warning"
}
```

### Network Errors
```javascript
// Error example
Failed to fetch: GET /api/users 401 Unauthorized

// Document as:
{
  "type": "network",
  "url": "/api/users",
  "status": 401,
  "message": "Unauthorized"
}
```

## Integration with TODO System

For each open issue, maintain a TODO:

```json
{
  "todos": [
    {
      "id": "fix-ISS-001",
      "content": "[ISS-001] Fix homepage 500 error - undefined user in loader",
      "status": "pending",
      "priority": "critical",
      "file": "app/routes/_index.tsx"
    }
  ]
}
```

## Reporting Commands

### Generate Issue Report

```markdown
# Issue Report - [Platform Name]
Generated: 2026-01-26 15:00

## Summary
- Total Issues: 5
- Critical: 1
- High: 2
- Medium: 1
- Low: 1

## Critical Issues (Fix Immediately)
1. [ISS-001] Homepage 500 error

## High Priority
2. [ISS-003] Login form not submitting
3. [ISS-005] Dashboard data not loading

...
```

### Track Progress

```
Issue Tracking Status:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Open:        3 ███████░░░░░░░░░ 
In Progress: 2 █████░░░░░░░░░░░ 
Fixed:       5 ████████████░░░░ 
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total: 10 issues | 50% resolved
```

## Best Practices

1. **Document immediately**: Don't wait to log issues
2. **Include reproduction steps**: Others need to verify
3. **Link to file/line**: Makes fixing faster
4. **Screenshot visual issues**: Visual evidence helps
5. **Update status promptly**: Keep docs current
6. **Verify fixes**: Don't just mark as fixed

## Example Invocation

When user says: "Log this 404 error on /settings"

```
I'll document this issue.

Creating issue ISS-007:
- Route: /settings
- Error: 404 Not Found
- Severity: High (missing page)

Updating:
1. ISSUES.md - Added new issue
2. routes-manifest.json - Updated status
3. Created TODO: [ISS-007] Create missing /settings route

Issue tracked! Would you like me to create the missing route now?
```
