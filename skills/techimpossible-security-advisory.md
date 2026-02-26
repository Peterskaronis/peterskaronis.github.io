---
name: techimpossible-security-advisory
description: This skill should be used when writing security advisories in the Techimpossible (TISA) format. It applies when analyzing vulnerabilities, threat research, or security incidents that need formal advisory documentation for CTOs, CISOs, and engineering leads.
license: Complete terms in LICENSE.txt
---

This skill produces security advisories following the Techimpossible Security Advisory (TISA) format. Each advisory is a comprehensive, actionable document designed for technical decision-makers at technology companies.

The user provides a vulnerability, threat technique, or security incident to analyze. They may include CVE IDs, research links, vendor advisories, or a general topic.

## Advisory Structure

Every TISA advisory follows this exact structure. Do not skip or reorder sections.

See the full skeleton at [tisa-template.md](./references/tisa-template.md).

### Required Metadata Block

```
# TISA-YYYY-NNN: [Descriptive Title]
## Techimpossible Security Advisory

**Advisory ID:** TISA-YYYY-NNN
**Published:** YYYY-MM-DD
**Severity:** CRITICAL | HIGH | MEDIUM | LOW
**Affected Platforms:** [list]
**Status:** [vendor response status]
**Author:** Techimpossible Security Research Team
**TLP:** WHITE | GREEN | AMBER | RED — [distribution note]
```

Assign the next sequential Advisory ID for the current year. If unsure of the last number, use NNN as placeholder and note it.

### CISO Brief (NEW — Required, immediately after metadata block)

The CISO Brief is a **single-page** executive overview designed to be read in under 2 minutes. It appears between the metadata block and the Executive Summary. Structure:

- **Severity / Action Required / Exploited in the Wild** — one-line status bar
- **What happened** — 1 sentence, plain language, no jargon
- **Who is affected** — 1 sentence
- **Business impact** — 1 sentence
- **Key findings** — numbered list, 3-5 items, single line each
- **Top actions (this week)** — table with Priority, Action, Owner (Security/Engineering/DevOps), Effort (Low/Medium/High)
- **Transition line** — e.g., "*Full technical analysis and N detailed recommendations follow below.*"

The CISO Brief must stand alone. A reader who stops after this section must know the severity, the risk, and the top 3 actions to take. Do not reference later sections.

### Required Sections (in order)

1. **Executive Summary** — 2-3 paragraphs. Lead with the business impact, not the technical details. State what happened, why it matters, and who is affected. End with a clear scope statement.

2. **Technical Analysis** — The deepest section. Include:
   - Attack mechanics (staged breakdown)
   - Why traditional defenses fail (table format preferred)
   - Platform-specific technical details
   - Related attack surface and connected techniques

3. **Risk Assessment** — Include:
   - Threat actor profile and likelihood
   - MITRE ATT&CK mapping (table with ID, Technique, Relevance)
   - MITRE ATLAS mapping if AI-specific
   - Risk rating by organization type (startups, enterprises, regulated industries)

4. **Recommended Actions** — Three tiers, always:
   - **Immediate (48 Hours)** — Quick wins, no productivity impact
   - **Short-Term (2 Weeks)** — Deeper controls, some effort
   - **Strategic (30-90 Days)** — Architecture and policy changes
   - Number all recommendations sequentially across tiers
   - Include specific technical guidance (KQL queries, domain lists, config snippets)

5. **Compliance and Regulatory Implications** — Map to SOC 2, ISO 27001, GDPR, HIPAA, PCI-DSS, EU AI Act as applicable. State specific control IDs and obligations.

6. **Indicators of Compromise** — Process indicators, network indicators, and a correlation pattern showing the full attack chain.

7. **Vendor Responses** — Current status from each affected vendor with dates.

8. **References** — Grouped by category:
   - Primary Research
   - Related CVEs and Vulnerabilities
   - In-the-Wild incidents
   - Foundational Research
   - Vendor Guidance
   - ATT&CK / ATLAS

9. **About This Advisory** — Standard Techimpossible boilerplate with contact info, series name, and next review date (30 days from publish).

10. **Footer** — `*Techimpossible Security Advisory TISA-YYYY-NNN | TLP:COLOR | Published YYYY-MM-DD*`

## Brand Voice and Style

Follow the guidelines in [brand-guidelines.md](./references/brand-guidelines.md).

Key principles:
- **Authoritative and direct.** State findings as facts, not possibilities. "This technique bypasses EDR" not "This technique could potentially bypass EDR."
- **Technical but accessible.** A CISO with 10 years of experience should understand every sentence. No jargon without context.
- **Actionable over theoretical.** Every technical finding must connect to a specific defensive action.
- **No AI slop.** No filler phrases ("In today's rapidly evolving threat landscape..."), no hedging, no padding. Every sentence must carry information.

## Research Process

Before writing:

1. **Gather primary sources** — Original research papers, vendor advisories, CVE details, proof-of-concept analysis
2. **Verify claims** — Cross-reference across multiple sources. Do not amplify unverified vendor marketing claims.
3. **Map to frameworks** — Identify MITRE ATT&CK and ATLAS techniques before writing the risk assessment
4. **Check vendor status** — Document what each affected vendor has said or done, with dates
5. **Identify compliance hooks** — Determine which regulatory frameworks apply based on the data types and systems involved

## Output

Produce the complete advisory as a single Markdown document. Save to the working directory as `TISA-YYYY-NNN.md`.

If a CVE is the primary subject, include it in the filename: `TISA-YYYY-NNN-brief-description.md`.

## Export and Delivery Formatting

Advisories are often converted to PDF, pasted into email, or shared via document platforms. Follow these rules to prevent rendering artifacts:

- **No leading whitespace or blank lines** before the H1 title. The document must start at line 1 with `# TISA-...`
- **No trailing whitespace or blank lines** after the footer line. The final line of the file must be the italic footer (`*Techimpossible Security Advisory...`) with no trailing newline beyond what the OS requires.
- **No HTML tags** unless absolutely necessary (tables, code blocks, and standard markdown handle 99% of cases). HTML breaks many PDF converters and email clients.
- **Keep ASCII diagrams inside fenced code blocks** (```` ``` ````) to preserve formatting in proportional-font renderers.
- **Test export** — if the recipient will view as PDF, verify the H1 title appears on the first page and the footer is the last content on the last page. Blank cover pages and appended email signatures are common artifacts of tools that add headers/footers around the content.
