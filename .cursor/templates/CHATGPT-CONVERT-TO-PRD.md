# Convert Technical Doc to PRD Prompt

Use this AFTER you've already done your research and have a technical document. This converts your existing work into the structured PRD format that Cursor expects.

---

## COPY BELOW THIS LINE

I have a technical document for a platform I've been researching. I need you to convert it into a structured PRD format for my AI coding assistant.

## My Technical Document

[PASTE YOUR EXISTING TECHNICAL DOCUMENT HERE]

---

## Convert to This PRD Format

Take everything from my technical document and restructure it into this exact format. **CRITICAL: Expand any features into FULL CRUD routes (Index, New, Detail, Edit).**

### Required Output Structure

```markdown
# [Platform Name] - Technical PRD

## 1. Overview
- What the platform does
- Target users
- Problem it solves
- Revenue model

## 2. User Roles & Permissions
| Role | Description | Access Level |
|------|-------------|--------------|

## 3. Routes (EXHAUSTIVE)

### 3.1 Public Routes
| Route | File | Description |
|-------|------|-------------|

### 3.2 Auth Routes  
| Route | File | Description |
|-------|------|-------------|

### 3.3 Dashboard Routes

#### Module: [Name] (4 routes per module)
| Route | File | Auth | Description |
|-------|------|------|-------------|
| /dashboard/[module] | dashboard.[module]._index.tsx | user | List all |
| /dashboard/[module]/new | dashboard.[module].new.tsx | user | Create new |
| /dashboard/[module]/:id | dashboard.[module].$id.tsx | user | View details |
| /dashboard/[module]/:id/edit | dashboard.[module].$id.edit.tsx | user | Edit |

[Repeat for EVERY module mentioned in my technical doc]

### 3.4 Admin Routes
| Route | File | Auth | Description |
|-------|------|------|-------------|

### 3.5 API Routes
| Route | Method | Auth | Description |
|-------|--------|------|-------------|

### 3.6 Route Summary
| Category | Count |
|----------|-------|
| Public | X |
| Auth | X |
| Dashboard | X |
| Admin | X |
| API | X |
| **TOTAL** | **X** |

## 4. Database Schema (Prisma)
\`\`\`prisma
[Complete schema with all models, relations, enums]
\`\`\`

## 5. Business Logic
### 5.1 [Feature Name]
- Trigger: [what starts this]
- Steps: [numbered steps]
- Output: [what gets created/updated]
- Validations: [rules]

[Repeat for each major feature]

## 6. Integrations
| Service | Purpose | Required |
|---------|---------|----------|

## 7. Security Requirements
- Authentication method
- Role-based access control
- Data protection
- Rate limiting

## 8. Acceptance Criteria
### [Feature Name]
- [ ] User can...
- [ ] System validates...
- [ ] Data is saved to...

## 9. Out of Scope
- [What this version does NOT include]
```

---

## CRITICAL: Route Expansion Rules

When converting my technical document:

1. **Every feature = 4 routes minimum**
   - If I mentioned "Leads management", create:
     - `/dashboard/leads` (list)
     - `/dashboard/leads/new` (create)
     - `/dashboard/leads/:id` (view)
     - `/dashboard/leads/:id/edit` (edit)

2. **Every button needs a destination**
   - "Create Lead" button → `/dashboard/leads/new` must exist
   - "View Details" link → `/dashboard/leads/:id` must exist
   - "Edit" button → `/dashboard/leads/:id/edit` must exist

3. **Settings/Profile pages**
   - `/dashboard/settings` (view settings)
   - `/dashboard/settings/edit` or sub-pages like `/dashboard/settings/profile`, `/dashboard/settings/billing`

4. **Admin equivalents**
   - If users can manage X, admins probably need to manage X too
   - `/admin/users`, `/admin/users/:id`, etc.

---

## Verification Checklist

Before you finish, confirm:

- [ ] Every feature from my technical doc has routes
- [ ] Every module has 4 CRUD routes (Index, New, Detail, Edit)
- [ ] Route counts are accurate
- [ ] Database schema covers all entities
- [ ] All relationships are defined with @relation
- [ ] Business logic covers all workflows I described
- [ ] Nothing from my technical doc was missed

---

Now convert my technical document to this PRD format.

## COPY ABOVE THIS LINE

---

## After Conversion

Once ChatGPT gives you the PRD:

1. **Quick Review** - Scan the route count. Does it seem right?
2. **Check CRUD** - Pick any module and verify it has all 4 routes
3. **Copy to Cursor** - Paste the PRD into your Cursor chat
4. **Cursor validates** - The pre-flight validator will catch any gaps

---

## Your Complete Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 1: RESEARCH (ChatGPT Project)                             │
│ • Back and forth ideation                                       │
│ • Work out all functions                                        │
│ • Refine the concept                                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 2: TECHNICAL DOC (ChatGPT)                                │
│ • Output comprehensive technical document                       │
│ • All features described                                        │
│ • Database concepts                                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 3: BRANDING DOC (ChatGPT)                                 │
│ • Colors, typography                                            │
│ • Voice and tone                                                │
│ • Component patterns                                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 4: CONVERT TO PRD (ChatGPT)                               │
│ • Use CHATGPT-CONVERT-TO-PRD.md prompt                          │
│ • Paste your technical doc                                      │
│ • Get structured PRD with ALL routes                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 5: BUILD (Cursor)                                         │
│ • Paste PRD into Cursor chat                                    │
│ • AI validates with pre-flight                                  │
│ • AI extracts route manifest                                    │
│ • You approve                                                   │
│ • Continuous build with testing                                 │
└─────────────────────────────────────────────────────────────────┘
```
