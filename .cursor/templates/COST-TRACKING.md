# Platform Cost Tracking Template

**Version**: 1.0  
**Purpose**: Track all costs associated with building and running each platform

---

## Platform: [Name]

**Created**: [Date]  
**Status**: Build / Live / Retired  
**Client**: [Name/Internal]

---

## 1. Build Costs (One-Time)

### AI/API Usage During Build

| Service | Usage | Unit Cost | Total | Date |
|---------|-------|-----------|-------|------|
| OpenAI GPT-4 | X tokens | $0.03/1K | $X | |
| OpenAI GPT-4 Turbo | X tokens | $0.01/1K | $X | |
| Gemini Pro | X tokens | $0.001/1K | $X | |
| FAL.ai Images | X images | $0.02/image | $X | |
| FAL.ai Video | X videos | $0.10/video | $X | |
| **AI SUBTOTAL** | | | **$X** | |

### Development Time

| Phase | Hours | Rate | Total |
|-------|-------|------|-------|
| Phase 0: Requirements | X | £X/hr | £X |
| Phase 1: Skeleton | X | £X/hr | £X |
| Phase 2: Schema | X | £X/hr | £X |
| Phase 3: Enhancement | X | £X/hr | £X |
| Phase 4: Validation | X | £X/hr | £X |
| UAT & Fixes | X | £X/hr | £X |
| **DEV SUBTOTAL** | X hrs | | **£X** |

### Other Build Costs

| Item | Cost | Notes |
|------|------|-------|
| Design assets | £X | |
| Stock photos | £X | |
| Domain purchase | £X | |
| Third-party licenses | £X | |
| **OTHER SUBTOTAL** | **£X** | |

### Total Build Cost

| Category | Amount |
|----------|--------|
| AI/API Usage | £X |
| Development Time | £X |
| Other | £X |
| **TOTAL BUILD COST** | **£X** |

---

## 2. Monthly Operating Costs

### Infrastructure

| Item | Provider | Monthly Cost | Annual Cost |
|------|----------|--------------|-------------|
| VPS Hosting | Hostinger | £X | £X |
| Database (if separate) | | £X | £X |
| CDN | Cloudflare | Free | Free |
| SSL | Let's Encrypt | Free | Free |
| **INFRA SUBTOTAL** | | **£X/mo** | **£X/yr** |

### Third-Party Services

| Service | Plan | Monthly Cost | Annual Cost |
|---------|------|--------------|-------------|
| Email (SendGrid/SMTP) | [tier] | £X | £X |
| Stripe | 2.9% + 30p | Variable | Variable |
| Sentry | [tier] | £X | £X |
| Analytics (GA4) | Free | Free | Free |
| Error tracking | [tier] | £X | £X |
| **SERVICES SUBTOTAL** | | **£X/mo** | **£X/yr** |

### Domain & DNS

| Item | Registrar | Annual Cost |
|------|-----------|-------------|
| Primary domain | | £X |
| Additional domains | | £X |
| **DOMAIN SUBTOTAL** | | **£X/yr** |

### Total Monthly Operating Cost

| Category | Monthly | Annual |
|----------|---------|--------|
| Infrastructure | £X | £X |
| Third-Party Services | £X | £X |
| Domain (amortized) | £X | £X |
| **TOTAL OPERATING** | **£X/mo** | **£X/yr** |

---

## 3. Revenue Tracking

### Pricing Model

| Plan | Monthly | Annual | Features |
|------|---------|--------|----------|
| Basic | £X | £X | |
| Pro | £X | £X | |
| Enterprise | £X | Custom | |

### Revenue

| Month | Customers | MRR | Churn | Net MRR |
|-------|-----------|-----|-------|---------|
| Month 1 | X | £X | X | £X |
| Month 2 | X | £X | X | £X |
| Month 3 | X | £X | X | £X |
| ... | | | | |

### Revenue Milestones

| Milestone | Target | Actual | Date |
|-----------|--------|--------|------|
| First paying customer | £X | | |
| 10 customers | £X MRR | | |
| Break-even (covers costs) | £X MRR | | |
| 100 customers | £X MRR | | |
| Target (500 @ £50) | £25K MRR | | |

---

## 4. Profitability Analysis

### Monthly P&L

| | Amount |
|---|--------|
| **Revenue (MRR)** | £X |
| **Less: Operating Costs** | |
| - Infrastructure | (£X) |
| - Third-party services | (£X) |
| - Payment processing (~3%) | (£X) |
| **Gross Profit** | £X |
| **Gross Margin** | X% |

### Break-Even Analysis

```
Monthly Operating Cost: £X
Average Revenue Per User: £X
Break-Even Customers: X customers

Current Customers: X
Gap to Break-Even: X customers
```

### Lifetime Value (LTV)

```
Average Monthly Revenue: £X
Average Customer Lifespan: X months
LTV: £X

Customer Acquisition Cost (CAC): £X
LTV:CAC Ratio: X:1 (target: > 3:1)
```

---

## 5. AI/API Usage Monitoring

### Monthly AI Usage

| Month | Service | Tokens/Calls | Cost |
|-------|---------|--------------|------|
| | OpenAI | X tokens | $X |
| | Gemini | X tokens | $X |
| | FAL.ai | X images | $X |
| **TOTAL** | | | **$X** |

### AI Cost Alerts

| Threshold | Action |
|-----------|--------|
| > $10/day | Review usage patterns |
| > $50/day | Implement caching |
| > $100/day | Consider rate limits |

### Optimization Opportunities

```markdown
- [ ] Cache frequent AI responses
- [ ] Use cheaper models for simple tasks
- [ ] Implement response caching
- [ ] Rate limit per user
- [ ] Batch API calls where possible
```

---

## 6. Cost Projections

### Scaling Costs

| Customers | Infra | Services | Total Monthly |
|-----------|-------|----------|---------------|
| 10 | £X | £X | £X |
| 50 | £X | £X | £X |
| 100 | £X | £X | £X |
| 500 | £X | £X | £X |
| 1000 | £X | £X | £X |

### When to Upgrade

| Trigger | Current | Upgrade To | Est. Cost |
|---------|---------|------------|-----------|
| 50+ users | Basic VPS | Standard VPS | +£X/mo |
| 200+ users | Standard | Premium | +£X/mo |
| 500+ users | VPS | Cloud (K8s) | +£X/mo |
| Email > 10K/mo | Free tier | Paid tier | +£X/mo |

---

## 7. Cost Control Checklist

### Weekly
```markdown
- [ ] Check AI API usage dashboard
- [ ] Review any unexpected charges
- [ ] Monitor error rates (errors = wasted API calls)
```

### Monthly
```markdown
- [ ] Review all service invoices
- [ ] Compare actual vs projected costs
- [ ] Identify optimization opportunities
- [ ] Update cost tracking spreadsheet
```

### Quarterly
```markdown
- [ ] Review all subscriptions
- [ ] Cancel unused services
- [ ] Negotiate better rates (if volume warrants)
- [ ] Update cost projections
```

---

## Summary Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│  PLATFORM: [Name]                      Status: [Status]     │
├─────────────────────────────────────────────────────────────┤
│  BUILD COST        │  MONTHLY COST     │  REVENUE          │
│  £X                │  £X               │  £X MRR           │
├─────────────────────────────────────────────────────────────┤
│  CUSTOMERS: X      │  GROSS MARGIN: X% │  LTV:CAC: X:1     │
├─────────────────────────────────────────────────────────────┤
│  BREAK-EVEN: X customers needed                             │
│  PAYBACK: X months at current growth                        │
└─────────────────────────────────────────────────────────────┘
```

---

**Goal**: Every platform should reach break-even within 6 months and achieve 3:1 LTV:CAC ratio.
