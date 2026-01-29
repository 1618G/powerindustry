# Quick ChatGPT Prompt for PRD

Copy this shorter version for quick platform PRDs.

---

## COPY BELOW THIS LINE

Create a complete technical PRD for: **[PLATFORM NAME]**

**What it does:** [1-2 sentences]

**Users:** [who uses it]

**Revenue:** [how it makes money]

---

## REQUIREMENTS

### Routes (CRITICAL)
For EVERY feature, give me ALL 4 routes:
- `/dashboard/feature` (list)
- `/dashboard/feature/new` (create)
- `/dashboard/feature/:id` (view)
- `/dashboard/feature/:id/edit` (edit)

Format as tables with: Route | File | Auth | Description

### Include These Sections
1. **Overview** - what/who/why
2. **User Roles** - permissions table
3. **ALL Routes** - grouped by category, with counts
4. **Database Schema** - complete Prisma models
5. **Business Logic** - step-by-step workflows
6. **Integrations** - third-party services
7. **Security** - auth requirements
8. **Acceptance Criteria** - definition of done

### Route Count Summary
End with a table showing total routes:
| Category | Count |
|----------|-------|
| Public | ? |
| Dashboard | ? |
| Admin | ? |
| API | ? |
| **TOTAL** | **?** |

---

## VERIFICATION
Before finishing, confirm:
✅ Every module has 4 CRUD routes
✅ Every button has a destination route
✅ Database covers all entities
✅ Route counts are accurate

Now create the complete PRD.

---

## COPY ABOVE THIS LINE
