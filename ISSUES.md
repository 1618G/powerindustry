# Known Issues

> **Generated**: [DATE]  
> **Platform**: [PLATFORM_NAME]  
> **Total Open Issues**: 0

---

## Summary

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 0 |
| 🟡 Medium | 0 |
| 🟢 Low | 0 |

---

## Open Issues

✅ No open issues! All routes are working correctly.

---

## Issue Template

When logging issues, use this format:

```markdown
## ISS-XXX: [Title]

**Route**: `/path`
**Severity**: 🔴 Critical / 🟠 High / 🟡 Medium / 🟢 Low
**Status**: Open / In Progress / Fixed / Won't Fix
**Discovered**: YYYY-MM-DD HH:MM
**Discovered By**: [Name or Agent]

### Description
[What's happening]

### Console Output
```
[Any relevant console errors]
```

### Steps to Reproduce
1. Navigate to [URL]
2. [Action]
3. Observe [result]

### Expected Behavior
[What should happen]

### Actual Behavior
[What's happening instead]

### Suggested Fix
[What needs to change]

### Screenshot
![Screenshot](tests/screenshots/issues/iss-xxx.png)

### Fix Notes
_Added when issue is resolved_

---
```

---

## Fixed Issues

_No fixed issues recorded._

---

## Issue Severity Guide

| Severity | Icon | Description | Action |
|----------|------|-------------|--------|
| Critical | 🔴 | App crashes, data loss, security issue | Fix immediately, block deploy |
| High | 🟠 | Feature broken, 404 error, major bug | Fix before deploy |
| Medium | 🟡 | Feature partially works, UI issue | Fix in next sprint |
| Low | 🟢 | Minor issue, cosmetic, enhancement | Fix when possible |

---

## Issue Status Definitions

| Status | Meaning |
|--------|---------|
| **Open** | Issue confirmed, not yet being worked on |
| **In Progress** | Someone is actively working on a fix |
| **Fixed** | Fix has been implemented |
| **Verified** | Fix has been tested and confirmed |
| **Won't Fix** | Decided not to fix (with explanation) |
| **Duplicate** | Same as another issue (link provided) |

---

## Testing Commands

```bash
# Run route tests to find issues
pnpm test:routes

# View testing dashboard
open tests/testing-dashboard.html

# Test specific category
pnpm test:routes --category=dashboard
```

---

**Last Updated**: [DATE]  
**Updated By**: [NAME]  
**Next Review**: [DATE]
