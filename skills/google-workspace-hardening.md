---
name: google-workspace-hardening
description: Generate right-sized Google Workspace security configurations with compliance mappings to CIS Benchmarks, ISO 27001, and SOC 2. Use when a startup or SME needs documented, audit-ready Google Workspace settings based on their company size, industry, regulatory requirements, and external collaboration patterns. Triggers on requests like "harden our Google Workspace," "secure our Gmail/Drive," "Google Workspace security for SOC 2," or "configure Google Admin for compliance."
---

# Google Workspace Secure Configuration

Generate documented, compliance-mapped Google Workspace configurations tailored to organization context.

## Workflow

### Phase 1: Discovery

Gather context through conversation. Ask these in natural sequence, not as a checklist dump:

**Organization Profile**
- Company size (employees) and growth trajectory
- Industry vertical (healthcare, fintech, SaaS, etc.)
- Active compliance requirements (SOC 2, HIPAA, ISO 27001, PCI-DSS, none yet)

**Collaboration Patterns**
- External document sharing? (clients, investors, vendors)
- External users in shared drives?
- Contractors/consultants with workspace access?

**Technical Environment**
- Identity provider in use? (Okta, Azure AD, Google-native)
- Mobile device management? (Jamf, Intune, Google Endpoint)
- Google Workspace edition (Business Starter/Standard/Plus, Enterprise)

**Risk Tolerance**
- Sensitivity of data in Drive/Gmail (PII, PHI, financial, IP)
- Previous security incidents or audit findings?

### Phase 2: Profile Selection

Based on discovery, assign a security profile:

| Profile | Typical Fit | Key Characteristics |
|---------|-------------|---------------------|
| **Startup Standard** | <20 employees, pre-SOC 2, no regulated data | Balanced security/usability, external sharing enabled with guardrails |
| **Growth Stage** | 20-100 employees, SOC 2 in progress, B2B SaaS | Stricter DLP, audit logging, conditional access |
| **Regulated Industry** | Healthcare, fintech, or enterprise contracts | Maximum controls, PHI/PCI requirements, external sharing restricted |
| **Enterprise Ready** | 100+ employees, multiple compliance frameworks | Full CIS benchmark implementation, context-aware access |

### Phase 3: Configuration Document Generation

Generate a .docx document containing:

1. **Executive Summary** - Profile selected, rationale, key risk areas addressed

2. **Configuration Matrix** - For each setting:
   - Admin Console path (exact click sequence)
   - Recommended value
   - Compliance mapping (CIS control #, ISO 27001 Annex A, SOC 2 CC criteria)
   - Implementation priority (Critical/High/Medium)
   - Notes/caveats

3. **Exception Register Template** - For settings that cannot be implemented:
   - Business justification
   - Compensating controls
   - Risk acceptance signature block
   - Review date

4. **Verification Checklist** - Post-implementation audit steps

### Phase 4: Delivery

Load appropriate reference file based on profile:
- **Startup Standard / Growth Stage**: See `references/controls-baseline.md`
- **Regulated Industry / Enterprise Ready**: See `references/controls-regulated.md`

Admin Console navigation paths: See `references/admin-paths.md`
Exception templates: See `references/exception-templates.md`

Use the docx skill to generate the final document.

## Control Categories

The configuration covers these domains:

1. **Authentication & Access** - MFA, session controls, password policies, SSO
2. **Gmail Security** - SPF/DKIM/DMARC, attachment policies, external warnings
3. **Drive & Sharing** - External sharing, link defaults, DLP rules
4. **Mobile & Endpoints** - Device policies, app access, screen lock
5. **Admin & Audit** - Super admin controls, audit log retention, alerts
6. **Third-Party Apps** - OAuth app allowlisting, API access controls
7. **Groups & Collaboration** - Group creation policies, external membership

## Output Format

The document should use professional formatting suitable for:
- Audit evidence (SOC 2 / ISO 27001 readiness assessments)
- Client delivery (consulting deliverable)
- Internal IT handoff

Include version, date, and "Prepared by" fields.
