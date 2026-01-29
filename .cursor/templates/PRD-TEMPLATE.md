# [Platform Name] - Technical PRD

**Version**: 1.0  
**Created**: [Date]  
**Author**: [Name]  
**Status**: Draft | Approved

---

## 1. Overview

### 1.1 What This Platform Does
[Clear 2-3 sentence description of the platform's core purpose]

### 1.2 Problem Statement
[What problem does this solve? Who experiences this problem?]

### 1.3 Target Audience
- **Primary Users**: [Who are the main users?]
- **Secondary Users**: [Admin, managers, etc.]

### 1.4 Revenue Model
- **Pricing**: £[X]/month per user
- **Target**: [X] customers × £[Y]/month = £[Z] MRR

---

## 2. Routes (EXHAUSTIVE LIST)

### 2.1 Dashboard Routes (`/dashboard/*`)

**IMPORTANT**: For each module, list ALL CRUD routes (Index, New, Detail, Edit)

#### Module: [Module Name]
| Route | Description | Auth | CRUD |
|-------|-------------|------|------|
| `/dashboard/[module]` | List all items | user | R |
| `/dashboard/[module]/new` | Create new item | user | C |
| `/dashboard/[module]/:id` | View item details | user | R |
| `/dashboard/[module]/:id/edit` | Edit item | user | U |

[Repeat for each module]

### 2.2 Admin Routes (`/admin/*`)

| Route | Description | Auth |
|-------|-------------|------|
| `/admin` | Admin dashboard | admin |
| `/admin/users` | User management | admin |
| `/admin/users/new` | Create user | admin |
| `/admin/users/:id` | View user | admin |
| `/admin/users/:id/edit` | Edit user | admin |
| `/admin/settings` | System settings | admin |

### 2.3 API Routes (`/api/*`)

| Method | Route | Description | Auth |
|--------|-------|-------------|------|
| GET | `/api/[module]` | List items | user |
| POST | `/api/[module]` | Create item | user |
| GET | `/api/[module]/:id` | Get single item | user |
| PUT | `/api/[module]/:id` | Update item | user |
| DELETE | `/api/[module]/:id` | Delete item | user |

### 2.4 Public Routes

| Route | Description |
|-------|-------------|
| `/` | Landing page |
| `/login` | Login page |
| `/register` | Registration page |
| `/forgot-password` | Password reset |
| `/pricing` | Pricing page |
| `/contact` | Contact form |

### 2.5 Auth Routes

| Route | Description |
|-------|-------------|
| `/auth/google` | Google OAuth |
| `/auth/google/callback` | OAuth callback |
| `/logout` | Logout action |

---

## 3. Route Summary

| Category | Count |
|----------|-------|
| Dashboard modules × 4 CRUD | [X] |
| Admin routes | [X] |
| API endpoints | [X] |
| Public routes | [X] |
| Auth routes | [X] |
| **TOTAL** | **[X]** |

---

## 4. Database Schema

### 4.1 Core Entities

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  role      Role     @default(USER)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  // Relations
  [related models]
}

model [EntityName] {
  id        String   @id @default(cuid())
  [fields]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  // Relations
  userId    String
  user      User     @relation(fields: [userId], references: [id])
}
```

### 4.2 Entity Relationship Diagram

```
User (1) ──── (N) [Entity1]
User (1) ──── (N) [Entity2]
[Entity1] (1) ──── (N) [Entity3]
```

### 4.3 Enums

```prisma
enum Role {
  USER
  ADMIN
  [other roles]
}

enum Status {
  DRAFT
  ACTIVE
  COMPLETED
  ARCHIVED
}
```

---

## 5. Business Logic

### 5.1 Core Workflows

#### Workflow: [Name]
```
1. User does X
2. System validates Y
3. System creates Z
4. User receives notification
```

### 5.2 Validation Rules

| Field | Rule |
|-------|------|
| email | Valid email format |
| password | Min 8 chars, 1 uppercase, 1 number |
| [field] | [rule] |

### 5.3 Permissions Matrix

| Action | User | Admin |
|--------|------|-------|
| View own data | ✅ | ✅ |
| Edit own data | ✅ | ✅ |
| View all data | ❌ | ✅ |
| Delete data | ❌ | ✅ |
| Manage users | ❌ | ✅ |

---

## 6. UI/UX Requirements

### 6.1 Color Scheme
- Primary: [color]
- Secondary: [color]
- Accent: [color]
- Background: gray-950
- Cards: gray-900

### 6.2 Key Components
- [ ] Dashboard layout with sidebar
- [ ] Data tables with sorting/filtering
- [ ] Forms with validation
- [ ] Modals for quick actions
- [ ] Toast notifications

### 6.3 Responsive Requirements
- [ ] Mobile-friendly tables
- [ ] Collapsible sidebar on mobile
- [ ] Touch-friendly buttons

---

## 7. Integrations

### 7.1 Required Integrations
- [ ] Stripe (payments)
- [ ] SendGrid (email)
- [ ] [Other integrations]

### 7.2 Optional Integrations
- [ ] Google Analytics
- [ ] Sentry (error tracking)
- [ ] [Other integrations]

---

## 8. Security Requirements

- [ ] Argon2id password hashing
- [ ] Session-based authentication
- [ ] CSRF protection
- [ ] Rate limiting on auth routes
- [ ] Input validation with Zod
- [ ] User data isolation

---

## 9. Acceptance Criteria

Before marking as complete:

- [ ] All routes from Section 2 exist and render (zero 404s)
- [ ] All database models from Section 4 created
- [ ] All workflows from Section 5 implemented
- [ ] All CRUD operations work for each module
- [ ] Authentication and authorization working
- [ ] `pnpm build` passes
- [ ] Zero console errors
- [ ] Basic responsive design works

---

## 10. Out of Scope (Future Phases)

- [Feature 1] - Phase 2
- [Feature 2] - Phase 2
- [Feature 3] - Phase 3

---

## Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Product Owner | | | |
| Tech Lead | | | |

**Type "APPROVED" to confirm this PRD and proceed with Route Manifest extraction.**
