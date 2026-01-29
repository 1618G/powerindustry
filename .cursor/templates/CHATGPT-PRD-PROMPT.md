# ChatGPT PRD Generation Prompt

Copy everything below the line and paste into ChatGPT with your platform idea.

---

# PROMPT START

I need you to create a complete technical PRD (Product Requirements Document) for a platform I'm building. This PRD will be used by an AI coding assistant to build the entire platform, so it must be EXHAUSTIVE and leave nothing ambiguous.

## Platform Idea

**Name:** [ENTER PLATFORM NAME]

**Description:** [DESCRIBE YOUR PLATFORM IN 2-3 SENTENCES]

**Target Users:** [WHO WILL USE THIS PLATFORM?]

**Revenue Model:** [HOW WILL THIS MAKE MONEY?]

---

## CRITICAL REQUIREMENTS FOR THE PRD

### 1. ROUTES - MOST IMPORTANT

For EVERY feature module in the platform, you MUST provide ALL 4 CRUD routes:

| Route Type | Pattern | Purpose |
|------------|---------|---------|
| **Index** | `/dashboard/module` | List all items |
| **New** | `/dashboard/module/new` | Create new item form |
| **Detail** | `/dashboard/module/:id` | View single item |
| **Edit** | `/dashboard/module/:id/edit` | Edit item form |

⚠️ **DO NOT** give me just an index route. If there's a "Create New" button, the `/new` route MUST exist. If there's a "View" or "Edit" button, those routes MUST exist.

Format routes in tables like this:

```markdown
### Module: Leads (4 routes)
| Route | File | Auth | Description |
|-------|------|------|-------------|
| /dashboard/leads | dashboard.leads._index.tsx | user | List all leads |
| /dashboard/leads/new | dashboard.leads.new.tsx | user | Create new lead |
| /dashboard/leads/:id | dashboard.leads.$id.tsx | user | View lead details |
| /dashboard/leads/:id/edit | dashboard.leads.$id.edit.tsx | user | Edit lead |
```

### 2. DATABASE SCHEMA

Provide a complete Prisma schema with:
- All models with their fields and types
- Relations between models (@relation)
- Indexes for frequently queried fields
- Enums for status fields

Format like this:
```prisma
model Lead {
  id          String   @id @default(cuid())
  name        String
  email       String
  status      LeadStatus @default(NEW)
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@index([userId])
  @@index([status])
}

enum LeadStatus {
  NEW
  CONTACTED
  QUALIFIED
  CONVERTED
  LOST
}
```

### 3. USER ROLES

Define all user roles and what each can access:

| Role | Can Access | Cannot Access |
|------|------------|---------------|
| admin | Everything | - |
| user | Dashboard, their own data | Admin panel, other users' data |
| guest | Public pages only | Dashboard, any authenticated routes |

### 4. BUSINESS LOGIC

For each major feature, describe:
- What triggers it
- What it does step by step
- What data it creates/updates
- Any validations required
- Any external API calls

### 5. INTEGRATIONS

List any third-party services needed:
- Payment processing (Stripe?)
- Email sending (SendGrid, Resend?)
- File storage (S3, Cloudflare R2?)
- Authentication (OAuth providers?)
- AI features (OpenAI, Gemini?)

### 6. SECURITY REQUIREMENTS

- Which routes require authentication?
- Which routes require specific roles?
- Any rate limiting needed?
- Any sensitive data that needs encryption?

---

## OUTPUT FORMAT

Structure your PRD with these exact sections:

```markdown
# [Platform Name] - Technical PRD

## 1. Overview
[What the platform does, who it's for, the problem it solves]

## 2. User Roles
[Table of roles and permissions]

## 3. Routes

### 3.1 Public Routes
[Table of unauthenticated routes]

### 3.2 Auth Routes
[Login, register, forgot password, etc.]

### 3.3 Dashboard Routes
[ALL dashboard routes with FULL CRUD per module]

### 3.4 Admin Routes
[ALL admin routes with FULL CRUD per module]

### 3.5 API Routes
[ALL API endpoints with methods]

### 3.6 Route Summary
| Category | Count |
|----------|-------|
| Public | X |
| Auth | X |
| Dashboard | X |
| Admin | X |
| API | X |
| **TOTAL** | **X** |

## 4. Database Schema
[Complete Prisma schema]

## 5. Business Logic
[Workflows for each major feature]

## 6. Integrations
[Third-party services]

## 7. Security Requirements
[Authentication, authorization, data protection]

## 8. UI/UX Requirements
[Color scheme, component patterns, responsive requirements]

## 9. Acceptance Criteria
[How we know each feature is "done"]

## 10. Out of Scope
[What this platform does NOT include]
```

---

## FINAL CHECKLIST

Before you finish, verify:

- [ ] Every module has 4 CRUD routes (Index, New, Detail, Edit)
- [ ] Every "Create" button has a corresponding `/new` route
- [ ] Every "View" link has a corresponding `/:id` route
- [ ] Every "Edit" button has a corresponding `/:id/edit` route
- [ ] Database schema covers all entities mentioned
- [ ] All relations between models are defined
- [ ] User roles and permissions are clear
- [ ] Route counts are accurate

---

Now create the complete PRD for my platform:

[PASTE YOUR PLATFORM DESCRIPTION HERE OR DESCRIBE IT IN DETAIL]

# PROMPT END

---

## Tips for Better Results

1. **Be specific about your industry** - "A CRM for real estate agents" is better than "A CRM"

2. **Mention similar products** - "Like Notion but for project management" helps ChatGPT understand scope

3. **List your must-have features** - Don't leave it to ChatGPT to guess

4. **Specify your tech stack** - Mention "Remix, Prisma, PostgreSQL, Tailwind" if relevant

5. **Ask for iterations** - After the first response, say "Now add [missing feature]" or "Expand on the [X] module"

---

## Follow-Up Prompts

After getting the PRD, use these follow-up prompts:

### To Get Branding
```
Now create a Brand Guidelines document for [PLATFORM NAME] including:
- Color palette (hex codes for dark theme: background, cards, accents)
- Typography (font families, sizes)
- Logo concepts
- Voice and tone
- Component styling patterns
```

### To Get Marketing Copy
```
Create marketing copy for [PLATFORM NAME]:
- Homepage headline and subheadline
- Feature descriptions (benefit-focused)
- Call-to-action text
- Email templates (welcome, onboarding, re-engagement)
- Social media posts (launch announcement)
```

### To Expand a Module
```
The [MODULE NAME] section needs more detail. Provide:
- All fields for the create/edit forms
- Validation rules for each field
- Status workflow (what statuses can transition to what)
- Any automated actions (emails, notifications)
```

### To Get API Documentation
```
Document the API for [MODULE NAME]:
- Endpoint URL and method
- Request body schema
- Response schema
- Error responses
- Authentication requirements
- Rate limits
```
