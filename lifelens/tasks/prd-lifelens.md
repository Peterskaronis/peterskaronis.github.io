# PRD: LifeLens - Life Reflection & Future Planning App

## Introduction

LifeLens is a web application that helps users gain perspective on their life through philosophical frameworks and AI-powered reflection. By visualizing the finite nature of life (4000 weeks), exploring purpose through Ikigai, and applying mental models to future decisions, users move from passive existence to intentional living.

The app combines mortality awareness (Memento Mori, 4000 Weeks by Oliver Burkeman), purpose discovery (Ikigai), regret prevention (Bronnie Ware's research), and decision frameworks (Eisenhower Matrix, Stoic dichotomy of control, 80/20 principle) into a single cohesive experience.

**Core Philosophy:** "You have approximately 4,000 weeks to live. How will you spend them?"

**Target User:** Adults seeking clarity on life direction, career changers, people at life crossroads, anyone wanting to live more intentionally.

**Tone:** Motivational, warm, honest about mortality but focused on empowerment.

---

## Goals

- Help users viscerally understand the finite nature of life through visual representation
- Guide users through structured self-reflection using proven frameworks
- Generate personalized AI narratives that synthesize their life story
- Identify potential future paths aligned with their Ikigai
- Provide mental model analysis to evaluate life decisions
- Create an emotionally impactful experience that motivates action
- Respect user privacy (no accounts, localStorage only)

---

## Technical Context

| Component | Technology |
|-----------|------------|
| Frontend | Vanilla HTML/CSS/JavaScript (no frameworks) |
| Hosting | Cloudflare Pages |
| API Backend | Cloudflare Workers |
| AI | Claude API (claude-sonnet-4-20250514 for cost-effectiveness) |
| Data Storage | Browser localStorage |
| Design | Dark theme matching parent site (skaronis.com) |

**Design System (from parent site):**
- Background: `#0a0a0a`
- Text: `#e5e5e5`
- Accent: `#c45c3e` (rusty orange)
- Weeks lived: `#39ff14` (neon green)
- Headings: Instrument Serif
- Body: Inter
- Max width: 900px

---

## User Flow Overview

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  1. LANDING │────▶│  2. PROFILE │────▶│  3. IKIGAI  │────▶│4. EXPERIENCE│
│  Birth Year │     │Skills/Occ.  │     │ 4 Quadrants │     │Timeline/Reg.│
└─────────────┘     └─────────────┘     └─────────────┘     └──────┬──────┘
                                                                   │
┌─────────────┐     ┌─────────────┐                                │
│  6. PATHS   │◀────│ 5. DASHBOARD│◀───────────────────────────────┘
│Mental Models│     │ Viz + AI    │
└─────────────┘     └─────────────┘
```

---

## User Stories

### Epic 1: Landing & Initial Hook

#### US-001: Landing Page with Birth Year Input
**Description:** As a visitor, I want to immediately understand what this app does and enter my birth year so that I can see my life in weeks.

**Acceptance Criteria:**
- [ ] Page displays compelling headline: "In approximately 4,000 weeks, your life will be over."
- [ ] Subheadline: "This isn't morbid. It's motivating. See your life. Plan your future."
- [ ] Single input field for birth year (4-digit number, 1920-2020 valid range)
- [ ] Real-time calculation as user types: "You've lived X weeks. Y remain."
- [ ] Preview visualization: small grid showing ~100 dots with a few filled
- [ ] CTA button: "Begin Your Reflection" (disabled until valid year entered)
- [ ] Matches parent site dark theme and typography
- [ ] Mobile responsive (input centered, readable on phone)
- [ ] Typecheck passes (if using any build tools)
- [ ] Verify in browser that week calculation is accurate

#### US-002: Week Calculation Logic
**Description:** As a developer, I need accurate week calculation so that the mortality visualization is correct.

**Acceptance Criteria:**
- [ ] Calculate weeks from birth year to current date
- [ ] Assume average lifespan of 80 years (4,160 weeks, rounded to 4,000 for messaging)
- [ ] Handle edge cases: very old users (100+), very young users (under 18)
- [ ] Display remaining weeks (4000 - weeksLived), minimum 0
- [ ] Store birth year in localStorage for use across pages

---

### Epic 2: Profile Collection

#### US-003: Profile Input Page
**Description:** As a user, I want to share my occupation, skills, and interests so that the AI can understand who I am.

**Acceptance Criteria:**
- [ ] Progress indicator showing "Step 2 of 5"
- [ ] Back button to return to previous step
- [ ] Text input for occupation (e.g., "Software Engineer", "Teacher", "Entrepreneur")
- [ ] Tag input for skills: type and press Enter to add, click X to remove
- [ ] Tag input for interests: same interaction pattern
- [ ] Minimum 1 skill and 1 interest required to proceed
- [ ] "Continue" button saves to localStorage and navigates to next step
- [ ] Conversational prompt text: "Tell me a bit about yourself"
- [ ] Mobile responsive
- [ ] Verify in browser that tags add/remove correctly

#### US-004: Tag Input Component
**Description:** As a user, I want an intuitive way to add multiple skills/interests so that entry is fast and flexible.

**Acceptance Criteria:**
- [ ] Text input with placeholder "Type and press Enter"
- [ ] On Enter, text becomes a pill/chip below the input
- [ ] Pills show X button on hover/tap for removal
- [ ] Clicking X removes that pill
- [ ] Prevent duplicate entries (case-insensitive)
- [ ] Maximum 10 items per field (show message at limit)
- [ ] Pills wrap to multiple lines on mobile
- [ ] Keyboard accessible (Tab to pills, Enter to remove focused pill)

---

### Epic 3: Ikigai Framework Input

#### US-005: Ikigai Four Quadrants Page
**Description:** As a user, I want to explore the four Ikigai questions so that I can discover my purpose.

**Acceptance Criteria:**
- [ ] Progress indicator showing "Step 3 of 5"
- [ ] Brief explanation of Ikigai concept (2-3 sentences)
- [ ] Four distinct sections with prompting questions:
  1. **What You Love** - "What activities make you lose track of time?"
  2. **What You're Good At** - "What do people come to you for help with?"
  3. **What The World Needs** - "What problems in the world concern you most?"
  4. **What You Can Be Paid For** - "What have you been paid for? What could you be?"
- [ ] Each section has textarea (3-5 lines visible)
- [ ] Minimum 1 entry per quadrant required
- [ ] Optional: example suggestions that fade on focus
- [ ] Save all inputs to localStorage on continue
- [ ] Verify in browser all four sections display and save correctly

#### US-006: Ikigai Visual Hint
**Description:** As a user, I want a visual representation of Ikigai while filling in the form so I understand how the pieces connect.

**Acceptance Criteria:**
- [ ] Small Venn diagram (4 overlapping circles) visible on page
- [ ] Circles labeled: Love, Skill, Need, Payment
- [ ] Current section highlighted as user fills each quadrant
- [ ] Shows intersection labels: Passion, Mission, Profession, Vocation
- [ ] Center shows "Ikigai" label
- [ ] SVG-based, matches color scheme
- [ ] Hidden on mobile (space constraints) or shown above form

---

### Epic 4: Life Experiences & Regret Assessment

#### US-007: Life Experiences Timeline
**Description:** As a user, I want to record key life moments so the AI understands my journey.

**Acceptance Criteria:**
- [ ] Progress indicator showing "Step 4 of 5"
- [ ] Section header: "Key Life Experiences"
- [ ] Prompt: "What moments shaped who you are today?"
- [ ] Add experience form:
  - Textarea for description (what happened)
  - Textarea for impact (how it changed you)
  - Dropdown for decade: Childhood, Teens, 20s, 30s, 40s, 50s, 60s+
- [ ] "Add Experience" button appends to list
- [ ] List displays added experiences with remove option
- [ ] Minimum 1 experience required, maximum 10
- [ ] Experiences saved to localStorage
- [ ] Verify in browser experiences add, display, and persist

#### US-008: Bronnie Ware Regret Assessment
**Description:** As a user, I want to assess my current life against common end-of-life regrets so I can identify areas to focus on.

**Acceptance Criteria:**
- [ ] Section header: "Life Balance Check"
- [ ] Brief context: "Based on research of end-of-life reflections, these 5 areas often bring regret. How are you doing?"
- [ ] Five slider inputs (1-5 scale):
  1. "I live true to myself, not others' expectations"
  2. "I maintain good work-life balance"
  3. "I express my feelings honestly"
  4. "I stay in touch with friends"
  5. "I allow myself to be happy"
- [ ] Each slider shows current value (1=Needs work, 5=Doing well)
- [ ] Labels at ends: "Needs Focus" / "Doing Well"
- [ ] Values saved to localStorage
- [ ] Continue button proceeds to dashboard
- [ ] Verify in browser sliders work and values persist

---

### Epic 5: Main Dashboard & Visualizations

#### US-009: Dashboard Layout
**Description:** As a user, I want to see all my insights on one powerful page so I can reflect on my life.

**Acceptance Criteria:**
- [ ] Full-width hero section with 4000 weeks grid
- [ ] AI-generated narrative section below grid
- [ ] Two-column layout (on desktop) for Ikigai diagram and Regret radar
- [ ] Loading states while AI generates content
- [ ] "Explore Future Paths" CTA at bottom
- [ ] Responsive: single column on mobile
- [ ] All sections animate in on scroll/load
- [ ] Verify in browser all sections render correctly

#### US-010: 4000 Weeks Mortality Grid
**Description:** As a user, I want to see my entire life represented as 4000 dots so I viscerally understand time's passage.

**Acceptance Criteria:**
- [ ] Grid of 4000 small squares/circles (80 rows x 50 columns)
- [ ] Each dot represents one week of life
- [ ] Weeks lived: filled with color (neon green `#39ff14`)
- [ ] Weeks remaining: dark/empty (`#1a1a1a`)
- [ ] Current week: highlighted white with pulse animation
- [ ] Color coding by decade (subtle shade variations)
- [ ] Hover on any dot shows: "Week X - Age Y years"
- [ ] Responsive: smaller dots on mobile, maintains grid
- [ ] Canvas or SVG implementation (Canvas preferred for performance)
- [ ] Animate on load: dots fill in sequentially (fast, ~2 seconds total)
- [ ] Stats above grid: "X weeks lived · Y weeks remaining · Z% of life"
- [ ] Verify in browser animation plays and hover works

#### US-011: AI Narrative Generation
**Description:** As a user, I want an AI-generated narrative of my life so far so I can see my story reflected back.

**Acceptance Criteria:**
- [ ] Section header: "Your Story So Far"
- [ ] Loading state: skeleton placeholder while generating
- [ ] 2-3 paragraph narrative generated by Claude API
- [ ] Narrative incorporates: occupation, skills, interests, experiences
- [ ] Tone: warm, reflective, forward-looking, specific (not generic)
- [ ] Displays identified life themes as tags below narrative
- [ ] Error state: graceful message if API fails, option to retry
- [ ] Verify in browser narrative displays after generation

#### US-012: Ikigai Visualization
**Description:** As a user, I want to see my Ikigai inputs as an interactive diagram so I can understand where purpose lies.

**Acceptance Criteria:**
- [ ] Four overlapping circles (Venn diagram) in SVG
- [ ] Each circle colored distinctly:
  - Love: `#ff6b6b` (coral)
  - Skill: `#4ecdc4` (teal)
  - Need: `#45b7d1` (blue)
  - Payment: `#96ceb4` (sage)
- [ ] Circles animate in on load (grow from center)
- [ ] Hover on circle shows user's entries for that quadrant
- [ ] Intersection zones highlighted on hover with labels:
  - Love + Skill = Passion
  - Skill + Payment = Profession
  - Payment + Need = Vocation
  - Need + Love = Mission
  - Center (all 4) = Ikigai
- [ ] AI-generated "Ikigai hypothesis" displayed below diagram
- [ ] Verify in browser circles animate and hover states work

#### US-013: Regret Radar Chart
**Description:** As a user, I want to see my Bronnie Ware assessment visualized so I know where to focus.

**Acceptance Criteria:**
- [ ] Five-axis radar/spider chart
- [ ] Axes: Authenticity, Work-Life, Feelings, Friends, Happiness
- [ ] User's scores plotted and filled
- [ ] Ideal (score 5 on all) shown as faint outer boundary
- [ ] Axes with low scores (1-2) highlighted in warning color
- [ ] Legend explaining what each axis means
- [ ] Canvas implementation for smooth rendering
- [ ] Verify in browser chart renders with correct values

---

### Epic 6: Cloudflare Worker API

#### US-014: Worker Project Setup
**Description:** As a developer, I need the Cloudflare Worker configured so the frontend can call Claude API securely.

**Acceptance Criteria:**
- [ ] `wrangler.toml` configured with project name "lifelens-api"
- [ ] CORS configured for Cloudflare Pages domain
- [ ] `ANTHROPIC_API_KEY` stored as Worker secret
- [ ] Rate limiting: max 10 requests per hour per IP (stored in KV)
- [ ] Request validation: reject malformed inputs
- [ ] Error responses follow consistent JSON format
- [ ] Local development works with `wrangler dev`

#### US-015: Narrative Generation Endpoint
**Description:** As a frontend, I need an API to generate the life narrative so users see their personalized story.

**Acceptance Criteria:**
- [ ] Endpoint: `POST /api/narrative`
- [ ] Input schema:
  ```json
  {
    "birthYear": 1985,
    "occupation": "string",
    "skills": ["string"],
    "interests": ["string"],
    "experiences": [{ "description": "string", "impact": "string", "decade": "string" }]
  }
  ```
- [ ] Output schema:
  ```json
  {
    "narrative": "string (2-3 paragraphs)",
    "themes": ["string (3-5 life themes)"]
  }
  ```
- [ ] Claude prompt instructs: warm tone, specific to inputs, no clichés
- [ ] Input token limit: 2000 tokens
- [ ] Timeout: 30 seconds
- [ ] Returns 400 for invalid input, 500 for API errors

#### US-016: Ikigai Analysis Endpoint
**Description:** As a frontend, I need an API to analyze Ikigai inputs and find intersections.

**Acceptance Criteria:**
- [ ] Endpoint: `POST /api/ikigai`
- [ ] Input schema:
  ```json
  {
    "love": ["string"],
    "skill": ["string"],
    "need": ["string"],
    "payment": ["string"]
  }
  ```
- [ ] Output schema:
  ```json
  {
    "hypothesis": "string (one sentence Ikigai statement)",
    "intersections": {
      "passion": "string",
      "profession": "string",
      "vocation": "string",
      "mission": "string"
    },
    "gaps": ["string (areas that don't connect)"],
    "strengths": ["string (areas with strong alignment)"]
  }
  ```
- [ ] Analysis identifies overlaps between quadrants
- [ ] Returns actionable insight, not generic advice

#### US-017: Future Paths Endpoint
**Description:** As a frontend, I need an API to suggest future life directions based on the full profile.

**Acceptance Criteria:**
- [ ] Endpoint: `POST /api/paths`
- [ ] Input: full profile object (all collected data + ikigai analysis)
- [ ] Output schema:
  ```json
  {
    "paths": [
      {
        "name": "string",
        "description": "string (2-3 sentences)",
        "alignment": "string (why it fits their ikigai)",
        "challenges": ["string"],
        "firstSteps": ["string (3 concrete actions)"]
      }
    ]
  }
  ```
- [ ] Always returns exactly 3 distinct paths
- [ ] Paths are specific and actionable, not vague
- [ ] Each path connects to their inputs explicitly

#### US-018: Mental Model Analysis Endpoint
**Description:** As a frontend, I need an API to analyze a selected path through various mental models.

**Acceptance Criteria:**
- [ ] Endpoint: `POST /api/analyze`
- [ ] Input schema:
  ```json
  {
    "path": { "name": "string", "description": "string" },
    "profile": { /* full profile */ },
    "models": ["eisenhower", "80-20", "stoic", "opportunity-cost", "regret-minimization"]
  }
  ```
- [ ] Output schema:
  ```json
  {
    "analyses": {
      "eisenhower": {
        "quadrant": "string (urgent-important, etc)",
        "insight": "string"
      },
      "80-20": {
        "highImpact": ["string (20% actions)"],
        "lowImpact": ["string (80% to deprioritize)"]
      },
      "stoic": {
        "canControl": ["string"],
        "cannotControl": ["string"],
        "focusAdvice": "string"
      },
      "opportunity-cost": {
        "givingUp": ["string"],
        "worthIt": "boolean",
        "reasoning": "string"
      },
      "regret-minimization": {
        "futureRegret": "string (if you don't do this)",
        "recommendation": "string"
      }
    }
  }
  ```
- [ ] Each model provides specific, personalized analysis
- [ ] Models can be requested individually or all at once

---

### Epic 7: Future Paths Page

#### US-019: Paths Display Page
**Description:** As a user, I want to see AI-suggested future directions so I can consider my options.

**Acceptance Criteria:**
- [ ] Three path cards displayed in grid
- [ ] Each card shows:
  - Path name (heading)
  - Description
  - "Why it fits you" section
  - Challenges list
  - First steps list
- [ ] Cards have distinct visual styling (different accent colors)
- [ ] Hover state on cards
- [ ] "Analyze This Path" button on each card
- [ ] Responsive: single column on mobile
- [ ] Verify in browser cards display correctly

#### US-020: Mental Model Analysis UI
**Description:** As a user, I want to analyze a selected path through mental models so I can make better decisions.

**Acceptance Criteria:**
- [ ] Clicking "Analyze This Path" opens analysis panel
- [ ] Panel shows path name and description
- [ ] Six mental model sections (collapsible accordions):
  1. Eisenhower Matrix - shows quadrant placement
  2. 80/20 Principle - shows high-impact focus areas
  3. Stoic Dichotomy - shows control/acceptance split
  4. Opportunity Cost - shows trade-offs
  5. Regret Minimization - shows future-self perspective
  6. Second-Order Effects - shows downstream consequences
- [ ] Loading state while analysis generates
- [ ] "Try Another Path" button returns to path selection
- [ ] Option to analyze multiple paths for comparison
- [ ] Verify in browser analysis displays for selected path

#### US-021: Session Summary & Export
**Description:** As a user, I want to save or share my reflection so I can revisit it later.

**Acceptance Criteria:**
- [ ] "Save Your Reflection" section at bottom of paths page
- [ ] "Download as PDF" button (generates PDF with all insights)
- [ ] "Copy Summary" button (copies text summary to clipboard)
- [ ] "Start Fresh" button (clears localStorage, returns to landing)
- [ ] Optional: "Share" button generates shareable link (if time permits - mark as stretch goal)
- [ ] Verify in browser download and copy functions work

---

### Epic 8: Shared Components & Polish

#### US-022: Progress Indicator Component
**Description:** As a user, I want to see my progress through the reflection so I know how much remains.

**Acceptance Criteria:**
- [ ] Displays "Step X of 5" text
- [ ] Five dots or segments showing progress
- [ ] Current step highlighted
- [ ] Completed steps show checkmark or filled state
- [ ] Clickable to navigate back (but not forward past current)
- [ ] Consistent position across all step pages
- [ ] Verify in browser navigation works correctly

#### US-023: Loading States
**Description:** As a user, I want clear feedback when AI is generating so I know the app is working.

**Acceptance Criteria:**
- [ ] Skeleton loaders for text sections
- [ ] Animated pulse effect on loading elements
- [ ] "Generating your insights..." message with spinner
- [ ] Estimated time indicator (e.g., "Usually takes 10-15 seconds")
- [ ] Cancel option for long-running requests
- [ ] Error state with retry button if generation fails

#### US-024: Mobile Responsiveness
**Description:** As a mobile user, I want the app to work well on my phone so I can reflect anywhere.

**Acceptance Criteria:**
- [ ] All pages render correctly on 375px width (iPhone SE)
- [ ] Touch targets minimum 44px
- [ ] No horizontal scrolling
- [ ] 4000 weeks grid adapts (smaller dots or scrollable)
- [ ] Forms use appropriate mobile keyboards (numeric for year)
- [ ] Progress indicator fits on mobile header
- [ ] Verify in browser using device emulation

#### US-025: Error Handling
**Description:** As a user, I want helpful error messages so I can recover from issues.

**Acceptance Criteria:**
- [ ] Form validation errors show inline (not alerts)
- [ ] API errors show user-friendly messages
- [ ] Network offline detection with appropriate message
- [ ] LocalStorage full handling (rare but possible)
- [ ] Retry mechanisms for failed API calls
- [ ] Fallback content if AI generation completely fails

---

## Functional Requirements

### Data Collection
- FR-1: System must validate birth year is between 1920 and current year minus 10
- FR-2: System must calculate weeks lived as `floor((today - Jan 1 of birth year) / (7 * 24 * 60 * 60 * 1000))`
- FR-3: System must persist all user inputs to localStorage under key `lifelens_session`
- FR-4: System must require minimum 1 entry per Ikigai quadrant before proceeding
- FR-5: System must limit experiences to 10 entries maximum

### Visualizations
- FR-6: 4000 weeks grid must render 4000 elements (80 rows x 50 columns)
- FR-7: Grid must highlight current week with distinct visual treatment
- FR-8: Grid must show hover state with week number and age
- FR-9: Ikigai diagram must show all four circles with distinct colors
- FR-10: Regret radar must plot five axes with user's values

### API Integration
- FR-11: All API calls must include timeout of 30 seconds
- FR-12: API must rate limit to 10 requests per IP per hour
- FR-13: API must validate input against schema before calling Claude
- FR-14: API must return structured JSON matching defined schemas
- FR-15: API errors must return appropriate HTTP status codes (400, 429, 500)

### Navigation
- FR-16: Users must be able to navigate backward through all completed steps
- FR-17: Users must not be able to skip ahead to incomplete steps
- FR-18: Browser back button must work correctly within the flow
- FR-19: Page refresh must restore current session from localStorage

---

## Non-Goals (Out of Scope)

- User accounts or authentication
- Saving multiple profiles (single session focus)
- Social sharing features (beyond copy/download)
- Email capture or notifications
- Comparison with other users
- Community features
- Gamification or streaks
- Integration with calendars or todo apps
- Native mobile app (web only)
- Internationalization (English only for v1)
- Accessibility beyond basic keyboard navigation (full a11y is future work)
- Offline mode (requires connection for AI)
- Custom branding or white-labeling

---

## Design Considerations

### Visual Hierarchy
1. **Primary Focus**: 4000 weeks grid (the emotional hook)
2. **Secondary**: AI narrative (personal connection)
3. **Tertiary**: Ikigai + Regret charts (analytical insights)
4. **Action**: Future paths + mental models (what to do)

### Emotional Journey
- **Landing**: Confrontation (mortality reality)
- **Inputs**: Reflection (structured introspection)
- **Dashboard**: Revelation (seeing patterns)
- **Paths**: Empowerment (actionable direction)

### Component Reuse
- Tag input: used for skills, interests, and potentially Ikigai entries
- Card component: used for paths, mental model analyses
- Progress indicator: consistent across all step pages
- Button styles: primary (continue), secondary (back), danger (clear)

---

## Technical Considerations

### Performance
- 4000 weeks grid: use Canvas for rendering (not 4000 DOM elements)
- Lazy load visualizations: render above-fold content first
- API calls: single request for all AI content to minimize latency
- localStorage: compress if data exceeds 5MB limit

### Browser Support
- Target: last 2 versions of Chrome, Firefox, Safari, Edge
- No IE11 support
- Test on iOS Safari and Chrome Android

### Security
- Sanitize all user inputs before displaying
- API key stored in Worker secrets, never exposed to client
- No PII stored server-side (all in localStorage)
- CORS restricted to app domain

### Cloudflare Configuration
```toml
# wrangler.toml
name = "lifelens-api"
main = "worker/index.js"
compatibility_date = "2024-01-01"

[vars]
ALLOWED_ORIGIN = "https://lifelens.pages.dev"
MAX_REQUESTS_PER_HOUR = "10"

[[kv_namespaces]]
binding = "RATE_LIMITS"
id = "xxx" # Created via wrangler kv:namespace create RATE_LIMITS
```

---

## Success Metrics

- **Completion Rate**: >60% of users who enter birth year complete to paths page
- **Time on Dashboard**: >3 minutes average (indicates engagement with visualizations)
- **Path Exploration**: >80% of users who reach paths analyze at least one
- **Session Duration**: Average session >10 minutes
- **Return Rate**: Track via localStorage flag if user returns (stretch goal)
- **Error Rate**: <5% of API calls result in user-facing errors

---

## Open Questions

1. **Lifespan assumption**: Should we use 80 years (4160 weeks) or stick with 4000 for simplicity? Current plan: 4000 for emotional impact.

2. **PDF generation**: Use browser print styles or a library? Recommend browser print for simplicity.

3. **Rate limiting scope**: Per IP may block shared networks (offices). Consider fingerprinting? Recommend starting with IP, monitor abuse.

4. **Path persistence**: Should analyzed paths persist for the session? Recommend yes, store in localStorage.

5. **Fallback for AI failures**: Generic content or no content? Recommend simple static message encouraging retry.

---

## Implementation Phases

### Phase 1: Foundation (US-001, US-002, US-022, US-024)
- Landing page with week calculation
- Progress indicator component
- Basic responsive layout
- localStorage wrapper

### Phase 2: Data Collection (US-003, US-004, US-005, US-006, US-007, US-008)
- Profile page with tag inputs
- Ikigai page with four quadrants
- Experiences page with timeline and sliders

### Phase 3: Visualizations (US-009, US-010, US-012, US-013)
- Dashboard layout
- 4000 weeks Canvas grid
- Ikigai SVG diagram
- Regret radar chart

### Phase 4: API & AI (US-014, US-015, US-016, US-017, US-018, US-011)
- Cloudflare Worker setup
- All four API endpoints
- AI narrative integration

### Phase 5: Future Paths (US-019, US-020, US-021)
- Paths display page
- Mental model analysis UI
- Export functionality

### Phase 6: Polish (US-023, US-025)
- Loading states
- Error handling
- Final testing and refinement
