/**
 * Magnus Grant Generator — Prompt Templates
 * ============================================================
 * The 7 core grant section prompts — this is the platform IP.
 * Each template is purpose-built for maximum funder appeal,
 * IRS/charity watchdog compliance, and measurable outcomes.
 *
 * Templates use {{variable}} placeholders filled by PromptBuilder.ts
 * ============================================================
 */

export interface PromptTemplate {
  sectionType: string;
  title: string;
  wordLimit: number;
  systemPrompt: string;
  userPrompt: string;
  revisionPrompt: string;
  qualityCheckPrompt: string;
  examples: { good: string; bad: string };
}

// ─── 1. EXECUTIVE SUMMARY ─────────────────────────────────────────────────────

export const executiveSummaryTemplate: PromptTemplate = {
  sectionType: 'executive_summary',
  title: 'Executive Summary',
  wordLimit: 500,

  systemPrompt: `You are an expert nonprofit grant writer with 20+ years of experience securing funding from major foundations, government agencies, and community foundations. You write compelling, evidence-based grant proposals that consistently achieve 65%+ funding rates.

Your executive summaries are known for:
- Opening with impact, not organizational history
- Making the funding decision obvious in the first 3 sentences
- Using active voice and specific numbers
- Never using vague language like "innovative," "unique," or "we believe"
- Showing clear logic: Problem → Solution → Impact → Ask

Always write in third person. Never start with "We" or the organization's name.`,

  userPrompt: `Write a compelling executive summary for the following grant application.

ORGANIZATION DATA:
- Organization: {{orgName}}
- EIN: {{ein}}
- Mission: {{missionStatement}}
- Years Operating: {{yearsInOperation}}
- Annual Budget: ${{annualBudget}}
- Program Ratio: {{programRatio}}%
- Location: {{city}}, {{state}}

FUNDING REQUEST:
- Funder: {{funderName}}
- Program: {{funderProgramName}}
- Amount Requested: ${{requestedAmount}}
- Project Name: {{projectName}}
- Project Duration: {{projectDuration}}

TARGET POPULATION:
- Population Served: {{targetPopulation}}
- Geographic Area: {{geographicArea}}
- Number to be Served: {{numberToBeServed}}

COMMUNITY NEED:
{{communityNeedSummary}}

PROJECT OUTCOMES:
{{outcomesHighlights}}

ALIGNMENT WITH FUNDER:
- Funder Focus Areas: {{funderFocusAreas}}
- Why This Funder: {{funderAlignmentReason}}

Write the executive summary in 400-500 words. Structure as follows:
1. Opening hook: The problem and scale (2-3 sentences with data)
2. The solution: What {{orgName}} will do (2-3 sentences)
3. Impact: Specific, measurable outcomes (2-3 sentences)
4. Organizational credibility: Track record brief (1-2 sentences)
5. The ask: Amount, purpose, timeline (1-2 sentences)

Do NOT include headers. Write as flowing paragraphs. Use third person. No passive voice.`,

  revisionPrompt: `Revise the following executive summary based on feedback.

ORIGINAL SUMMARY:
{{originalContent}}

FEEDBACK:
{{feedback}}

FUNDER REQUIREMENTS:
{{funderRequirements}}

Keep the word count under {{wordLimit}} words. Preserve the strongest elements while addressing all feedback. Maintain active voice and specific metrics.`,

  qualityCheckPrompt: `Review this executive summary and score it on the following criteria (1-10 each):

SUMMARY TO REVIEW:
{{content}}

CRITERIA:
1. Opening Impact: Does it hook the reader with a compelling problem statement?
2. Clarity of Ask: Is the funding request clear (amount, purpose, timeline)?
3. Evidence Use: Are statistics and data used effectively?
4. Outcome Specificity: Are outcomes specific and measurable?
5. Organizational Credibility: Is the track record established concisely?
6. Funder Alignment: Does it connect to {{funderName}}'s priorities?
7. Writing Quality: Active voice, no jargon, clear and direct?

Return scores as JSON: {"scores": {"opening_impact": X, "clarity_of_ask": X, ...}, "total": X, "top_strength": "...", "top_improvement": "..."}`,

  examples: {
    good: `Every night, more than 2,400 children in San Bernardino County go to bed without adequate nutrition—a crisis that costs the county $340 million annually in reduced educational outcomes and increased healthcare spending. Community Food Alliance requests $75,000 from the Green Family Foundation to expand its School Pantry Program to three additional Title I elementary schools, directly serving 720 food-insecure children during the 2025-2026 academic year.

Since 2017, Community Food Alliance has distributed over 1.8 million pounds of nutritious food to 15,000 families annually through its network of 22 school-based pantries. Our evidence-based model—validated by UC Riverside researchers—reduces food insecurity by 68% among participating families while increasing school attendance by 12% and improving reading proficiency scores by an average of 1.4 grade levels.

With Green Family Foundation's investment, we will establish pantries at Lincoln, Roosevelt, and Jefferson Elementary Schools, hire one part-time Pantry Coordinator, and train 45 parent volunteers. By June 2026, we project serving 720 students monthly, with 85% reporting reduced food insecurity and 90% of parents reporting improved household stability.`,

    bad: `We at Community Food Alliance believe we are doing innovative and unique work to address hunger in our community. We feel that food insecurity is a big problem and we hope that with your funding we can help some people who need food. We have been around for many years and have helped a lot of families.

We would like to request $75,000 to expand our program. We think this is a good amount that will allow us to do more of what we do. We are excited about the possibility of working with your foundation and believe we would be a great partner.`,
  },
};

// ─── 2. NEED STATEMENT ────────────────────────────────────────────────────────

export const needStatementTemplate: PromptTemplate = {
  sectionType: 'need_statement',
  title: 'Statement of Need',
  wordLimit: 750,

  systemPrompt: `You are an expert nonprofit grant writer specializing in evidence-based need statements. Your need statements establish compelling community problems using data, not emotion.

Rules for need statements:
- Every claim must be backed by data (cite specific sources: Census Bureau, CDC, county health departments, peer-reviewed studies)
- Focus on the COMMUNITY'S need, not the organization's need for funding
- Use local/regional data when possible, national data to contextualize
- Quantify the gap between current conditions and what is needed
- Never use anecdotes as primary evidence — they support data, they don't replace it
- Establish that the problem is solvable (not hopeless) and that this organization is positioned to solve it`,

  userPrompt: `Write a compelling Statement of Need for this grant application.

ORGANIZATION: {{orgName}} | {{city}}, {{state}} | NTEE: {{nteeCode}}
PROJECT: {{projectName}}
TARGET POPULATION: {{targetPopulation}} in {{geographicArea}}

COMMUNITY NEED DATA PROVIDED:
{{communityNeedData}}

LOCAL STATISTICS (use these):
{{localStatistics}}

NATIONAL CONTEXT:
{{nationalStatistics}}

GAP IN SERVICES:
{{gapInServices}}

ROOT CAUSES TO ADDRESS:
{{rootCauses}}

FUNDER'S STATED INTEREST AREA:
{{funderFocusAreas}}

Write the Statement of Need in 600-750 words. Structure:
1. Lead with local data showing scale of problem (cite source inline)
2. Contextualize with state/national data to show this isn't isolated
3. Identify the specific population most affected and why
4. Document the gap: what services exist vs. what is needed
5. Show the cost of inaction (economic, social, or health cost)
6. Bridge to solution: why this geographic area and population need intervention now
7. Establish urgency without catastrophizing

Use inline citations: (Source, Year). Do not editorialize. Let data speak.`,

  revisionPrompt: `Revise this Statement of Need based on the following feedback.

ORIGINAL:
{{originalContent}}

FEEDBACK / MISSING ELEMENTS:
{{feedback}}

ADDITIONAL DATA TO INCORPORATE:
{{additionalData}}

Word limit: {{wordLimit}}. Strengthen evidence. Add specific citations where noted.`,

  qualityCheckPrompt: `Score this Statement of Need (1-10 per criterion):

CONTENT:
{{content}}

SCORE ON:
1. Data Quality: Are claims backed by cited, credible sources?
2. Specificity: Is the population and geography precisely defined?
3. Gap Documentation: Is the service gap clearly quantified?
4. Urgency: Is the case for acting NOW clear?
5. Local Relevance: Does local data appear prominently?
6. Objectivity: Is it factual vs. emotional/editorial?
7. Funder Alignment: Does it connect to {{funderName}}'s priorities?

Return: {"scores": {...}, "total": X, "missing_citations": [...], "strongest_section": "...", "weakest_section": "..."}`,

  examples: {
    good: `San Bernardino County ranks last among California's 58 counties in health outcomes, with adult diabetes rates of 14.2%—nearly double the state average of 7.4% (California Health Interview Survey, 2023). In the Arrowhead Valley zip codes served by this project, 34% of residents live below 200% of the federal poverty level and 67% report cost as the primary barrier to medical care (County Department of Public Health Community Health Assessment, 2024).`,
    bad: `Many people in our community are struggling with health problems. Diabetes is a very serious illness that affects many families. We have heard from community members that they cannot afford healthcare and this is very sad. Our programs have helped many people over the years.`,
  },
};

// ─── 3. PROGRAM DESIGN ────────────────────────────────────────────────────────

export const programDesignTemplate: PromptTemplate = {
  sectionType: 'program_design',
  title: 'Program Design & Implementation Plan',
  wordLimit: 1000,

  systemPrompt: `You are an expert grant writer specializing in program design sections. You describe programs with operational precision and evidence-based methodology.

Program design principles:
- Be concrete: name activities, not aspirations
- Use logic model thinking: Inputs → Activities → Outputs → Outcomes
- Specify: who does what, when, how often, to how many people
- Reference evidence base (best practices, proven models)
- Show organizational capacity through specifics (staff roles, credentials, partners)
- Timeline must be realistic and account for ramp-up
- Never use "if funded" — write as if implementation is certain`,

  userPrompt: `Write a Program Design & Implementation Plan for this grant.

PROJECT DETAILS:
- Organization: {{orgName}}
- Project: {{projectName}}
- Duration: {{projectDuration}} ({{startDate}} to {{endDate}})
- Location: {{geographicArea}}
- Population: {{targetPopulation}}
- Target Number Served: {{numberToBeServed}}

GRANT AMOUNT: ${{requestedAmount}} from {{funderName}}

PROGRAM ACTIVITIES (use all):
{{programActivities}}

STAFFING PLAN:
{{staffingPlan}}

PARTNER ORGANIZATIONS:
{{partnerOrganizations}}

EVIDENCE BASE / BEST PRACTICE MODEL:
{{evidenceBase}}

TIMELINE MILESTONES:
{{timelineMilestones}}

OUTPUTS (deliverables):
{{expectedOutputs}}

Write the Program Design in 800-1000 words. Structure:
1. Program Overview: What, who, where, how many (2 paragraphs)
2. Evidence Base: What research/model informs this approach (1 paragraph)
3. Key Activities: Describe each activity with frequency, participants, responsible staff
4. Staffing & Qualifications: Who leads implementation (brief but specific)
5. Partner Roles: Named partners and their specific contributions
6. Implementation Timeline: Quarterly milestones from {{startDate}} to {{endDate}}
7. Outputs: Specific, countable deliverables

Write with operational specificity. No vague language. Present tense.`,

  revisionPrompt: `Revise this Program Design section.

ORIGINAL:
{{originalContent}}

CHANGES REQUIRED:
{{feedback}}

ADDITIONAL DETAILS:
{{additionalData}}

Maintain operational specificity. Word limit: {{wordLimit}}.`,

  qualityCheckPrompt: `Score this Program Design (1-10):

CONTENT:
{{content}}

CRITERIA:
1. Activity Specificity: Are activities concrete and countable?
2. Staffing Clarity: Are roles and qualifications clear?
3. Evidence Base: Is the methodology grounded in research?
4. Timeline Realism: Is the timeline detailed and achievable?
5. Partner Integration: Are partner roles specific?
6. Output Clarity: Are outputs measurable and realistic?
7. Logic Model Integrity: Is there clear input→activity→output flow?

Return: {"scores": {...}, "total": X, "vague_sections": [...], "missing_elements": [...]}`,

  examples: {
    good: `Community Food Alliance will operate the School Pantry Program at three Title I elementary schools—Lincoln, Roosevelt, and Jefferson—serving 720 students monthly from September 2025 through June 2026. Each school-based pantry will distribute USDA-compliant food packages every other Friday, with distribution supervised by the hired Pantry Coordinator and 15 trained parent volunteers per site.`,
    bad: `We will work with schools to help students with food needs. Our staff will coordinate with teachers and parents to make sure kids have what they need. We hope to serve many families throughout the year.`,
  },
};

// ─── 4. EVALUATION PLAN ───────────────────────────────────────────────────────

export const evaluationPlanTemplate: PromptTemplate = {
  sectionType: 'evaluation_plan',
  title: 'Evaluation Plan',
  wordLimit: 750,

  systemPrompt: `You are an expert grant writer and program evaluator. You write rigorous evaluation plans that demonstrate accountability to funders and provide genuine learning opportunities for organizations.

Evaluation plan standards:
- Every outcome must have at least one measurable indicator
- Specify data collection tools (surveys, assessments, records, interviews)
- Define baseline, target, and measurement timeline for each indicator
- Name who conducts data collection (staff role, external evaluator, or partner)
- Use SMART format for all targets: Specific, Measurable, Achievable, Relevant, Time-bound
- Distinguish between process evaluation (are we doing what we said?) and outcome evaluation (is it working?)
- For grants over $100K, suggest independent or external evaluation component`,

  userPrompt: `Write a rigorous Evaluation Plan for this grant proposal.

PROJECT: {{projectName}} | {{orgName}}
FUNDER: {{funderName}} | Grant Amount: ${{requestedAmount}}
DURATION: {{startDate}} to {{endDate}}

PROJECT OUTCOMES (must evaluate all):
{{projectOutcomes}}

TARGET METRICS:
{{targetMetrics}}

DATA ALREADY COLLECTED (baseline data):
{{baselineData}}

EVALUATION CAPACITY:
{{evaluationCapacity}}

REPORTING REQUIREMENTS:
{{reportingRequirements}}

Write the Evaluation Plan in 600-750 words. Structure:
1. Evaluation Framework (1 paragraph): Overall approach (process + outcome)
2. Outcome Metrics Table: For each outcome — Indicator | Baseline | Target | Data Source | Frequency | Responsible Party
3. Data Collection Methods: Specific tools (survey names, database systems, etc.)
4. Baseline Establishment: When and how baseline will be set if not yet available
5. Data Analysis: How data will be analyzed and who reviews it
6. Learning & Adaptation: How findings will inform program adjustments
7. Reporting to {{funderName}}: Schedule and format for progress reports

Make all targets SMART. Name specific data collection instruments.`,

  revisionPrompt: `Revise this Evaluation Plan.

ORIGINAL:
{{originalContent}}

FEEDBACK:
{{feedback}}

Add missing indicators and make targets SMART. Word limit: {{wordLimit}}.`,

  qualityCheckPrompt: `Score this Evaluation Plan (1-10):

CONTENT:
{{content}}

CRITERIA:
1. Indicator Quality: Are all indicators specific and measurable?
2. SMART Targets: Do targets meet SMART criteria?
3. Data Sources: Are data collection methods clearly specified?
4. Baseline Data: Is baseline established or process for establishing it defined?
5. Evaluation Timeline: Does data collection align with project timeline?
6. Learning Culture: Does the plan show how data informs practice?
7. Feasibility: Is the evaluation plan achievable with stated capacity?

Return: {"scores": {...}, "total": X, "non_smart_targets": [...], "missing_indicators": [...]}`,

  examples: {
    good: `Community Food Alliance will conduct both process and outcome evaluation to ensure program fidelity and measure impact. Process evaluation will track monthly distribution statistics using our Salesforce nonprofit CRM, while outcome evaluation will measure food security and school attendance using validated tools.

Outcome 1: 85% of participating students will report reduced food insecurity by June 2026.
Indicator: Score reduction on the USDA 6-item Household Food Security Survey
Baseline: 94% food insecurity rate (spring 2025 intake survey, n=720)
Target: 85% report food security by May 2026
Data Source: Biannual student/family surveys administered by Pantry Coordinator
Responsible: Program Director`,
    bad: `We will track how our program is doing by asking participants how they feel. We will also look at attendance records if we can get them. At the end of the year we will evaluate everything and write up what we learned. We think we will be able to show good results.`,
  },
};

// ─── 5. ORGANIZATIONAL CAPACITY ──────────────────────────────────────────────

export const organizationalCapacityTemplate: PromptTemplate = {
  sectionType: 'organizational_capacity',
  title: 'Organizational Capacity & Qualifications',
  wordLimit: 500,

  systemPrompt: `You write organizational capacity sections that build funder confidence through demonstrated track record, not claims.

Capacity section principles:
- Show, don't tell: replace "we are experienced" with specific accomplishments
- Use numbers: years operating, people served, funds managed, grants won
- Name key staff by title and specific qualification relevant to this project
- Reference financial health briefly (audited financials, program ratio)
- Highlight board oversight and governance
- Mention relevant previous grants, especially from similar funders
- Address any potential weaknesses proactively (very young org, change in leadership)`,

  userPrompt: `Write an Organizational Capacity section for this grant application.

ORGANIZATION PROFILE:
- Name: {{orgName}}
- Founded: {{foundingYear}} ({{yearsInOperation}} years operating)
- Mission: {{missionStatement}}
- Annual Budget: ${{annualBudget}}
- Program Expense Ratio: {{programRatio}}%
- Staff: {{fullTimeStaff}} FTE, {{partTimeStaff}} part-time
- Volunteers: {{volunteerCount}}

TRACK RECORD:
{{organizationTrackRecord}}

KEY LEADERSHIP (include all):
{{keyLeadership}}

RELEVANT PREVIOUS GRANTS:
{{previousGrants}}

FINANCIAL MANAGEMENT:
{{financialManagementSummary}}

BOARD COMPOSITION:
{{boardSummary}}

RELEVANT PARTNERSHIPS:
{{partnerships}}

FUNDER: {{funderName}} | PROJECT: {{projectName}}

Write in 400-500 words. Structure:
1. Organizational overview: scale, scope, years of impact (brief and factual)
2. Track record: specific programs similar to proposed project
3. Financial health: audit status, program ratio, funding diversity
4. Key personnel: 2-3 people by title and specific relevant experience
5. Board oversight: composition and financial controls
6. Why we are the right organization to implement this specific project

Third person. Specific numbers. Avoid superlatives.`,

  revisionPrompt: `Revise this Organizational Capacity section.

ORIGINAL:
{{originalContent}}

FEEDBACK:
{{feedback}}

Replace vague claims with specific evidence. Word limit: {{wordLimit}}.`,

  qualityCheckPrompt: `Score this Organizational Capacity section (1-10):

CONTENT:
{{content}}

CRITERIA:
1. Track Record Evidence: Are accomplishments specific and quantified?
2. Staff Qualifications: Are key staff roles and credentials cited?
3. Financial Health: Is financial health addressed with data?
4. Governance: Is board/oversight mentioned?
5. Project Fit: Does capacity connect specifically to this project?
6. Objectivity: Are claims factual vs. superlative?
7. Appropriate Length: Comprehensive but concise?

Return: {"scores": {...}, "total": X, "vague_claims": [...], "missing_elements": [...]}`,

  examples: {
    good: `Community Food Alliance, founded in 2008, has operated school-based food pantries in the San Bernardino Valley for 15 years, distributing more than 1.8 million pounds of food annually to 15,000 families through 22 school-based locations. The organization's 2023 audited financial statements show a program expense ratio of 82%—exceeding Charity Navigator's "Give with Confidence" threshold—and a six-month operating reserve. Annual revenue of $2.4 million is diversified across 34 grants, 1,200 individual donors, and $180,000 in fee-for-service contracts.`,
    bad: `Community Food Alliance is a great organization that has been helping the community for many years. We have very experienced staff who care deeply about our mission. Our financial management is excellent and we are well-governed. We believe we are the ideal organization to implement this program.`,
  },
};

// ─── 6. BUDGET NARRATIVE ──────────────────────────────────────────────────────

export const budgetNarrativeTemplate: PromptTemplate = {
  sectionType: 'budget_narrative',
  title: 'Budget Narrative',
  wordLimit: 600,

  systemPrompt: `You write budget narratives that justify every line item with precision and demonstrate fiscal responsibility.

Budget narrative standards:
- Every personnel cost includes: FTE%, salary rate, calculation (e.g., "0.5 FTE × $48,000 = $24,000")
- Benefits are calculated as explicit percentage of salary (e.g., "22% benefits")
- Non-personnel costs are justified with unit costs (e.g., "$45/food box × 1,440 boxes = $64,800")
- Show how requested amount fits within total project budget (if leveraging other funding)
- Identify matching funds, in-kind contributions, and other grant sources
- Use precise language — no "approximately," "around," or "estimated"
- Cost per participant should be clearly derivable from the budget`,

  userPrompt: `Write a Budget Narrative justifying every line item in this grant budget.

GRANT REQUEST: ${{requestedAmount}} from {{funderName}}
TOTAL PROJECT BUDGET: ${{totalProjectBudget}}
LEVERAGED FUNDS: ${{leveragedFunds}} from {{otherFundingSources}}
PROJECT PERIOD: {{startDate}} to {{endDate}}
PARTICIPANTS SERVED: {{numberToBeServed}}

PERSONNEL (include all):
{{personnelDetail}}

NON-PERSONNEL LINE ITEMS:
{{nonPersonnelDetail}}

INDIRECT COST RATE: {{indirectCostRate}}% ({{indirectCostJustification}})

Write the Budget Narrative in 400-600 words. Format each section:

PERSONNEL ($X,XXX):
- [Role]: [FTE]% × $[annual salary] = $[amount]. [Brief justification of relevance to project]
- Benefits: [%] × $[salaries total] = $[amount]

NON-PERSONNEL ($X,XXX):
- [Item]: [Unit] × [cost] = $[amount]. [Justification]

INDIRECT COSTS ($X,XXX):
- [Rate]% × [base] = $[amount]. [Justification]

BUDGET SUMMARY:
- Total Request: ${{requestedAmount}} ({{percentOfTotal}}% of total project cost)
- Cost per Participant: $[calculation]
- Matching/Leverage: $[amount] from [sources]

Be mathematically precise. Every number must be calculable.`,

  revisionPrompt: `Revise this Budget Narrative.

ORIGINAL:
{{originalContent}}

FEEDBACK:
{{feedback}}

Ensure all calculations are explicit. Add any missing justifications. Word limit: {{wordLimit}}.`,

  qualityCheckPrompt: `Score this Budget Narrative (1-10):

CONTENT:
{{content}}

CRITERIA:
1. Personnel Justification: Are all FTE% and salary calculations shown?
2. Non-Personnel Justification: Are unit costs explicit?
3. Benefits Calculation: Are benefits calculated as % of salary?
4. Leveraged Funding: Is other funding documented?
5. Cost per Participant: Is cost per person derivable?
6. Indirect Cost Justification: Is indirect rate explained?
7. Mathematical Accuracy: Do numbers add up correctly?

Return: {"scores": {...}, "total": X, "calculation_gaps": [...], "vague_justifications": [...]}`,

  examples: {
    good: `PERSONNEL ($48,240):
Pantry Coordinator (0.6 FTE): 0.6 × $52,000 = $31,200. The Coordinator oversees daily pantry operations across all three sites, manages volunteer scheduling, and maintains USDA compliance documentation. This position requires 24 hours/week during the 9-month academic year.
Benefits (22%): 22% × $31,200 = $6,864. Includes health insurance, retirement (403b), payroll taxes, and workers compensation per organizational policy.
Program Director (0.1 FTE): 0.1 × $72,000 = $7,200. Supervises Coordinator, manages funder relationships, and reviews quarterly data.
Benefits (22%): 22% × $7,200 = $1,584.
Personnel Subtotal: $46,848`,
    bad: `Personnel costs will be around $48,000 approximately. This includes salary for our coordinator who will work on this project, plus some benefits. We also have management staff who will oversee things. Non-personnel costs will be about $27,000 for food and supplies and other things we need.`,
  },
};

// ─── 7. SUSTAINABILITY PLAN ────────────────────────────────────────────────────

export const sustainabilityTemplate: PromptTemplate = {
  sectionType: 'sustainability',
  title: 'Sustainability Plan',
  wordLimit: 400,

  systemPrompt: `You write sustainability sections that reassure funders their investment will create lasting impact — not dependency.

Sustainability plan principles:
- Identify at least 3 specific funding sources (not just "more grants")
- Include earned revenue, government funding, and individual giving where applicable
- Be concrete about timeline: by Year 2, by grant end, within 18 months
- Show organizational infrastructure being built, not just activities
- Acknowledge that some grants are appropriate for time-limited projects (if applicable)
- For infrastructure projects, show how ongoing costs are lower than startup costs
- Never say "we will apply for more grants" without naming specific funders or programs`,

  userPrompt: `Write a Sustainability Plan for this grant application.

PROJECT: {{projectName}} | Duration: {{projectDuration}}
ORGANIZATION: {{orgName}} | Annual Budget: ${{annualBudget}}
GRANT REQUEST: ${{requestedAmount}} from {{funderName}}
ONGOING ANNUAL COST AFTER GRANT: ${{ongoingCost}}

SUSTAINABILITY STRATEGY (use all applicable):
{{sustainabilityStrategies}}

IDENTIFIED FUTURE FUNDERS:
{{futureFundingPipeline}}

EARNED REVENUE POTENTIAL:
{{earnedRevenuePotential}}

GOVERNMENT FUNDING OPPORTUNITIES:
{{governmentFundingOpportunities}}

CAPACITY BEING BUILT:
{{capacityBuilding}}

BOARD COMMITMENT:
{{boardCommitment}}

Write in 300-400 words. Structure:
1. Summary of ongoing cost and funding gap after grant period
2. Diversified funding plan with specific sources and realistic amounts
3. Earned revenue or fee-for-service component (if applicable)
4. Government/public funding path (if applicable)
5. How this grant builds infrastructure that reduces future costs
6. Board and organizational commitment to long-term viability

Be specific about funders, amounts, and timelines. No vague assurances.`,

  revisionPrompt: `Revise this Sustainability Plan.

ORIGINAL:
{{originalContent}}

FEEDBACK:
{{feedback}}

Replace vague statements with specific funders, amounts, and timelines. Word limit: {{wordLimit}}.`,

  qualityCheckPrompt: `Score this Sustainability Plan (1-10):

CONTENT:
{{content}}

CRITERIA:
1. Funding Source Diversity: Are 3+ specific sources identified?
2. Timeline Specificity: Are sustainability milestones time-bound?
3. No "Grant Dependency": Avoids relying solely on future grants?
4. Earned Revenue: Is self-sufficiency component present (where applicable)?
5. Government Funding Path: Is public funding explored?
6. Capacity Building: Does grant build lasting infrastructure?
7. Realism: Are funding projections credible?

Return: {"scores": {...}, "total": X, "grant_dependency_flags": [...], "missing_revenue_sources": [...]}`,

  examples: {
    good: `After Green Family Foundation's 12-month investment, the School Pantry Program will require $68,000 annually to serve 720 students at the three new sites. Community Food Alliance has secured commitments from two sources totaling $45,000: (1) San Bernardino County Department of Aging and Adult Services has approved $25,000 in CDBG funding beginning July 2026, and (2) the Foothill Community Foundation has indicated intent to fund $20,000 annually through its Food Security Initiative.`,
    bad: `We plan to apply for more grants after this funding period ends. We are confident that other funders will be interested in our work once they see the results. Our board is committed to finding funding. We will also try to get donations from the community.`,
  },
};

// ─── Template Registry ────────────────────────────────────────────────────────

export const PROMPT_TEMPLATES: Record<string, PromptTemplate> = {
  executive_summary: executiveSummaryTemplate,
  need_statement: needStatementTemplate,
  program_design: programDesignTemplate,
  evaluation_plan: evaluationPlanTemplate,
  organizational_capacity: organizationalCapacityTemplate,
  budget_narrative: budgetNarrativeTemplate,
  sustainability: sustainabilityTemplate,
};

export function getTemplate(sectionType: string): PromptTemplate | null {
  return PROMPT_TEMPLATES[sectionType] ?? null;
}

export function getAllTemplates(): PromptTemplate[] {
  return Object.values(PROMPT_TEMPLATES);
}

export function getSectionTypes(): string[] {
  return Object.keys(PROMPT_TEMPLATES);
}

export default PROMPT_TEMPLATES;
