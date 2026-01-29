# Master QA Checklist - ZZA Build V5.6

**Version**: 1.0  
**Purpose**: Complete quality assurance checklist for enterprise platform builds

---

## Overview

This is the definitive checklist for ensuring every ZZA platform build meets enterprise quality standards. Use this checklist at each phase gate and before any client delivery.

---

## Phase 0: Requirements Lock

### PRD Validation
```markdown
- [ ] PRD.md or SPEC.md exists
- [ ] All features are described
- [ ] All routes are listed (exhaustive)
- [ ] Database schema is defined
- [ ] Business logic is documented
- [ ] User roles are defined
- [ ] Integration requirements are listed
```

### Route Manifest
```markdown
- [ ] Route manifest extracted from PRD
- [ ] FULL CRUD for every module (Index, New, Detail, Edit)
- [ ] Module completeness summary included
- [ ] Navigation links documented
- [ ] User typed "APPROVED"
- [ ] Manifest locked (routes-manifest.json)
```

### Phase 0 Gate Check
```bash
pnpm preflight
# Must pass before proceeding
```

**⛔ STOP if any Phase 0 checks fail**

---

## Phase 1: Skeleton Build

### Route Files
```markdown
- [ ] ALL dashboard routes created
- [ ] ALL admin routes created
- [ ] ALL API routes created
- [ ] ALL public routes created
- [ ] Every route has basic loader
- [ ] Every route has authentication check
- [ ] Every route renders placeholder UI
```

### Build Verification
```markdown
- [ ] `pnpm build` passes with zero errors
- [ ] `pnpm dev` starts without errors
- [ ] Navigate to EVERY route - zero 404s
- [ ] Check console - zero errors
```

### Phase 1 Gate Check
```bash
pnpm phase1:check
# Must pass before proceeding
```

**⛔ STOP if any 404s exist**

---

## Phase 2: Database Schema

### Schema Design
```markdown
- [ ] All entities from PRD created in schema.prisma
- [ ] Relationships properly defined
- [ ] Indexes added for query performance
- [ ] Enums defined
- [ ] Timestamps on all models (createdAt, updatedAt)
- [ ] User isolation (userId foreign key where needed)
```

### Repository Layer
```markdown
- [ ] Repository for each entity
- [ ] NO stub methods (no "not implemented")
- [ ] Full CRUD operations implemented
- [ ] Proper error handling
- [ ] Type-safe queries
```

### Database Verification
```markdown
- [ ] `pnpm db:push:safe` succeeds
- [ ] `pnpm db:generate` succeeds
- [ ] `pnpm build` still passes
- [ ] Prisma Studio shows correct schema
```

### No-Stub Check
```bash
pnpm detect-stubs:strict
# Must find zero stubs
```

### Phase 2 Gate Check
```bash
pnpm phase2:check
# Must pass before proceeding
```

**⛔ STOP if stubs detected**

---

## Phase 3: Enhancement (Per Route)

### For EACH Route Enhancement
```markdown
- [ ] Loader fetches real data
- [ ] Action handles form submissions
- [ ] UI matches design/requirements
- [ ] Forms have validation (Zod)
- [ ] Error states handled
- [ ] Loading states implemented
- [ ] Success/error toasts work
- [ ] Navigation links work
```

### Per-Route Testing
```markdown
- [ ] Route renders in browser
- [ ] Console has zero errors
- [ ] Data loads correctly
- [ ] CRUD operations work:
  - [ ] Create works
  - [ ] Read works
  - [ ] Update works
  - [ ] Delete works
- [ ] Validation errors display
- [ ] Navigation works
- [ ] Mobile responsive
```

### Update Manifest Status
```markdown
- [ ] Update route status in routes-manifest.json to "tested"
- [ ] Record any issues in ISSUES.md
```

### Every 5 Routes: Batch Check
```markdown
- [ ] Run security-auditor subagent
- [ ] Run `pnpm test:routes`
- [ ] Check for regressions
- [ ] Review ISSUES.md
```

---

## Phase 4: Final Validation

### Functional Testing
```markdown
- [ ] All CRUD operations work for every module
- [ ] Authentication flow works
- [ ] Authorization (role checks) work
- [ ] Password reset works
- [ ] File uploads work
- [ ] Email sending works
- [ ] Payment flow works (if applicable)
- [ ] All integrations work
```

### Quality Testing
```markdown
- [ ] Zero 404 errors
- [ ] Zero 500 errors
- [ ] Zero console errors
- [ ] All forms validate correctly
- [ ] All navigation works
- [ ] Mobile responsive
- [ ] Page load < 3 seconds
```

### Security Testing
```markdown
- [ ] Security audit passed (security-auditor)
- [ ] No exposed secrets in code
- [ ] No SQL injection vulnerabilities
- [ ] No XSS vulnerabilities
- [ ] Authentication required on protected routes
- [ ] Authorization enforced (role checks)
- [ ] Rate limiting configured
- [ ] HTTPS configured
```

### Code Quality
```markdown
- [ ] No TypeScript errors
- [ ] No ESLint errors
- [ ] No stub code (detect-stubs passes)
- [ ] Code reviewed (code-reviewer subagent)
- [ ] Consistent naming conventions
- [ ] Proper error handling
```

### Documentation
```markdown
- [ ] README.md updated
- [ ] ROUTES.md complete
- [ ] API.md complete (if APIs)
- [ ] Environment variables documented
- [ ] Deployment instructions documented
```

### Final Gate Check
```bash
pnpm validate-gates:strict
pnpm test:routes --all
pnpm detect-stubs:strict
pnpm build
# All must pass
```

---

## Pre-UAT Checklist

### Environment Ready
```markdown
- [ ] Staging environment deployed
- [ ] Test accounts created
- [ ] Demo data populated
- [ ] SSL working
- [ ] Domain configured
- [ ] External integrations connected
```

### UAT Preparation
```markdown
- [ ] UAT checklist prepared
- [ ] Known issues documented
- [ ] Screen recording ready (optional)
- [ ] Client meeting scheduled
```

---

## Pre-Deployment Checklist

### Infrastructure
```markdown
- [ ] Production environment ready
- [ ] Database backed up
- [ ] Environment variables set
- [ ] SSL certificate valid
- [ ] DNS configured
- [ ] CDN configured (if applicable)
```

### Monitoring
```markdown
- [ ] Error tracking configured (Sentry)
- [ ] Uptime monitoring configured
- [ ] Log aggregation configured
- [ ] Alerts configured
- [ ] Analytics configured (GA4)
```

### Security
```markdown
- [ ] Security headers configured
- [ ] Rate limiting enabled
- [ ] CORS configured correctly
- [ ] Session security configured
- [ ] Secrets not in code
```

### Backup
```markdown
- [ ] Database backup scheduled
- [ ] Backup retention configured
- [ ] Restore procedure documented
- [ ] Restore tested
```

---

## Post-Launch Checklist

### Day 0 (Launch Day)
```markdown
- [ ] Deploy completed successfully
- [ ] Smoke tests passed
- [ ] Client notified
- [ ] First hour monitoring complete
- [ ] No critical errors
```

### Day 1-7
```markdown
- [ ] Daily error log review
- [ ] Daily performance check
- [ ] Client check-ins completed
- [ ] Issues addressed promptly
- [ ] Week 1 summary report sent
```

### Handover
```markdown
- [ ] Access credentials delivered (securely)
- [ ] Documentation complete
- [ ] Training completed
- [ ] Support terms agreed
- [ ] Handover acceptance signed
```

---

## Quality Metrics

### Build Metrics (Track These)

| Metric | Target | Actual |
|--------|--------|--------|
| Phase 0 → 1 time | < 2 hours | |
| Phase 1 (skeleton) time | < 4 hours | |
| Phase 2 (schema) time | < 2 hours | |
| Phase 3 (enhancement) time | X hours | |
| Total build time | < 40 hours | |
| Routes delivered | X | |
| First-pass UAT pass rate | > 80% | |
| Post-launch issues (P1/P2) | 0 | |

### Quality Gates

| Gate | Status |
|------|--------|
| Phase 0: PRD Approved | ⬜ |
| Phase 0: Manifest Approved | ⬜ |
| Phase 1: Zero 404s | ⬜ |
| Phase 1: Build Passes | ⬜ |
| Phase 2: No Stubs | ⬜ |
| Phase 2: Build Passes | ⬜ |
| Phase 3: All Routes Tested | ⬜ |
| Phase 3: Security Audit Passed | ⬜ |
| Phase 4: Final Validation | ⬜ |
| Phase 4: User Confirmed "BUILD COMPLETE" | ⬜ |
| UAT: Client Sign-Off | ⬜ |
| Deployment: Successful | ⬜ |
| Post-Launch: Week 1 Complete | ⬜ |

---

## Quick Commands Reference

```bash
# Phase Gates
pnpm preflight              # Phase 0 check
pnpm phase1:check           # Phase 1 check
pnpm phase2:check           # Phase 2 check
pnpm validate-gates         # All gates
pnpm validate-gates:strict  # Fail on any gate

# Testing
pnpm test:routes            # Route testing
pnpm detect-stubs           # Stub detection
pnpm detect-stubs:strict    # Fail if stubs found

# Build
pnpm build                  # Production build
pnpm typecheck              # TypeScript check
pnpm lint                   # ESLint check

# Database
pnpm db:push:safe           # Safe schema push
pnpm db:studio              # Prisma Studio
```

---

## Sign-Off

```markdown
## Build Completion Sign-Off

**Platform**: [Name]
**Date**: [Date]
**Builder**: [Name]

### Gates Completed
- [ ] All Phase 0-4 gates passed
- [ ] All QA checks completed
- [ ] Security audit passed
- [ ] UAT completed
- [ ] Client signed off

### User Confirmation
Type "BUILD COMPLETE" to finalize:

_______________________________________________

**Build Status**: ✅ COMPLETE / ❌ INCOMPLETE
```

---

**Remember**: Quality is not negotiable. Every platform represents ZZA and impacts real businesses. Take the time to do it right.
