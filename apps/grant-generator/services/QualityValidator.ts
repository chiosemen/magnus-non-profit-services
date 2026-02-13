/**
 * Magnus Grant Generator — QualityValidator
 * Validates grant sections: word limits, completeness, quality scoring
 */

import { ValidationError } from '../utils/errors';
import { countWords } from '../utils/formatters';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SectionRequirement {
  sectionType: string;
  wordLimit: number;
  wordMinimum: number;
  requiredElements: string[];
  prohibitedPhrases: string[];
}

export interface ValidationResult {
  sectionType: string;
  isValid: boolean;
  wordCount: number;
  wordLimit: number;
  wordMinimum: number;
  completenessScore: number;    // 0–100
  qualityScore: number;          // 0–100
  overallScore: number;          // 0–100
  issues: ValidationIssue[];
  warnings: ValidationWarning[];
  suggestions: string[];
  passedChecks: string[];
}

export interface ValidationIssue {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  fix?: string;
}

export interface ValidationWarning {
  code: string;
  message: string;
  suggestion: string;
}

// ─── Section Requirements Registry ───────────────────────────────────────────

const SECTION_REQUIREMENTS: Record<string, SectionRequirement> = {
  executive_summary: {
    sectionType: 'executive_summary',
    wordLimit: 500,
    wordMinimum: 200,
    requiredElements: [
      'organization mission', 'amount requested', 'project name',
      'target population', 'expected outcomes',
    ],
    prohibitedPhrases: ['we believe', 'we feel', 'it is our opinion', 'unique', 'innovative solution'],
  },
  need_statement: {
    sectionType: 'need_statement',
    wordLimit: 750,
    wordMinimum: 300,
    requiredElements: [
      'statistics', 'data', 'community need', 'target population',
      'gap in services', 'source citation',
    ],
    prohibitedPhrases: ['we think', 'some people believe', 'it seems', 'obviously'],
  },
  program_design: {
    sectionType: 'program_design',
    wordLimit: 1000,
    wordMinimum: 400,
    requiredElements: [
      'activities', 'timeline', 'staffing', 'methodology',
      'number of people served', 'implementation plan',
    ],
    prohibitedPhrases: ['if funded', 'hopefully', 'we plan to try'],
  },
  evaluation_plan: {
    sectionType: 'evaluation_plan',
    wordLimit: 750,
    wordMinimum: 300,
    requiredElements: [
      'metrics', 'data collection', 'baseline', 'targets',
      'evaluation timeline', 'who conducts evaluation',
    ],
    prohibitedPhrases: ['we will track things', 'we will see how it goes', 'informal evaluation'],
  },
  organizational_capacity: {
    sectionType: 'organizational_capacity',
    wordLimit: 500,
    wordMinimum: 200,
    requiredElements: [
      'years of operation', 'track record', 'staff qualifications',
      'board oversight', 'financial management', 'similar programs',
    ],
    prohibitedPhrases: ['we are new to this', 'we are learning as we go'],
  },
  budget_narrative: {
    sectionType: 'budget_narrative',
    wordLimit: 600,
    wordMinimum: 200,
    requiredElements: [
      'personnel costs', 'expense justification', 'cost per person',
      'other funding sources', 'matching funds or in-kind',
    ],
    prohibitedPhrases: ['approximately', 'around', 'somewhere between', 'give or take'],
  },
  sustainability: {
    sectionType: 'sustainability',
    wordLimit: 400,
    wordMinimum: 150,
    requiredElements: [
      'funding plan', 'earned revenue', 'government funding',
      'individual donors', 'fee for service', 'capacity building',
    ],
    prohibitedPhrases: ['we will apply for more grants', 'future grants', 'hope to find funding'],
  },
};

// ─── Validator ────────────────────────────────────────────────────────────────

export class QualityValidator {

  validate(sectionType: string, content: string): ValidationResult {
    const req = SECTION_REQUIREMENTS[sectionType];
    if (!req) {
      throw new ValidationError(`Unknown section type: ${sectionType}`, 'sectionType');
    }

    const wordCount = countWords(content);
    const issues: ValidationIssue[] = [];
    const warnings: ValidationWarning[] = [];
    const suggestions: string[] = [];
    const passedChecks: string[] = [];

    // ─── Word Count Checks ────────────────────────────────────────────────────
    if (wordCount > req.wordLimit) {
      issues.push({
        code: 'WORD_LIMIT_EXCEEDED',
        severity: 'error',
        message: `Word count ${wordCount} exceeds limit of ${req.wordLimit}`,
        fix: `Remove ${wordCount - req.wordLimit} words`,
      });
    } else if (wordCount > req.wordLimit * 0.95) {
      warnings.push({
        code: 'NEAR_WORD_LIMIT',
        message: `Word count ${wordCount} is within 5% of limit (${req.wordLimit})`,
        suggestion: 'Trim slightly to ensure formatting doesn\'t push over limit',
      });
    } else {
      passedChecks.push(`Word count ${wordCount} is within limit (${req.wordLimit})`);
    }

    if (wordCount < req.wordMinimum) {
      issues.push({
        code: 'INSUFFICIENT_LENGTH',
        severity: 'error',
        message: `Word count ${wordCount} is below minimum of ${req.wordMinimum}`,
        fix: `Add ${req.wordMinimum - wordCount} more words of substantive content`,
      });
    } else {
      passedChecks.push(`Meets minimum word count (${req.wordMinimum})`);
    }

    // ─── Required Elements Check ──────────────────────────────────────────────
    const contentLower = content.toLowerCase();
    let elementsFound = 0;

    for (const element of req.requiredElements) {
      const keywords = element.split(' ');
      const found = keywords.some(kw => contentLower.includes(kw.toLowerCase()));
      if (found) {
        elementsFound++;
      } else {
        warnings.push({
          code: 'MISSING_ELEMENT',
          message: `Required element may be missing: "${element}"`,
          suggestion: `Ensure the ${sectionType} explicitly addresses: ${element}`,
        });
      }
    }
    const completenessScore = Math.round((elementsFound / req.requiredElements.length) * 100);

    // ─── Prohibited Phrases Check ─────────────────────────────────────────────
    for (const phrase of req.prohibitedPhrases) {
      if (contentLower.includes(phrase.toLowerCase())) {
        issues.push({
          code: 'PROHIBITED_PHRASE',
          severity: 'warning',
          message: `Weak or prohibited phrase detected: "${phrase}"`,
          fix: 'Replace with specific, evidence-based language',
        });
      }
    }

    // ─── Quality Checks ───────────────────────────────────────────────────────
    let qualityScore = 100;

    // Check for passive voice overuse
    const passiveMatches = (content.match(/\b(is|are|was|were|be|been|being)\s+\w+ed\b/g) ?? []).length;
    const passiveRatio = passiveMatches / (wordCount / 100);
    if (passiveRatio > 8) {
      qualityScore -= 15;
      suggestions.push('Reduce passive voice — aim for active, direct language');
    } else {
      passedChecks.push('Active voice usage is strong');
    }

    // Check for numbers/evidence
    const numberCount = (content.match(/\d+/g) ?? []).length;
    if (numberCount < 2 && sectionType !== 'executive_summary') {
      qualityScore -= 20;
      suggestions.push('Add specific data, statistics, or numerical evidence');
    } else {
      passedChecks.push('Contains quantitative evidence');
    }

    // Check sentence variety
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const avgSentenceLength = wordCount / Math.max(sentences.length, 1);
    if (avgSentenceLength > 35) {
      qualityScore -= 10;
      suggestions.push('Shorten average sentence length for readability (aim for ≤25 words/sentence)');
    }

    // Penalize for issues
    qualityScore -= issues.filter(i => i.severity === 'error').length * 10;
    qualityScore -= issues.filter(i => i.severity === 'warning').length * 5;
    qualityScore = Math.max(0, Math.min(100, qualityScore));

    const overallScore = Math.round((completenessScore * 0.5) + (qualityScore * 0.5));
    const hasErrors = issues.some(i => i.severity === 'error');

    return {
      sectionType,
      isValid: !hasErrors,
      wordCount,
      wordLimit: req.wordLimit,
      wordMinimum: req.wordMinimum,
      completenessScore,
      qualityScore,
      overallScore,
      issues,
      warnings,
      suggestions,
      passedChecks,
    };
  }

  validateAll(sections: Array<{ sectionType: string; content: string }>): {
    results: ValidationResult[];
    isFullyValid: boolean;
    averageScore: number;
    criticalIssues: number;
  } {
    const results = sections.map(s => this.validate(s.sectionType, s.content));
    const isFullyValid = results.every(r => r.isValid);
    const averageScore = results.reduce((s, r) => s + r.overallScore, 0) / results.length;
    const criticalIssues = results.reduce((s, r) => s + r.issues.filter(i => i.severity === 'error').length, 0);

    return { results, isFullyValid, averageScore: Math.round(averageScore), criticalIssues };
  }

  getRequirements(sectionType: string): SectionRequirement | null {
    return SECTION_REQUIREMENTS[sectionType] ?? null;
  }

  getAllRequirements(): SectionRequirement[] {
    return Object.values(SECTION_REQUIREMENTS);
  }
}

export default QualityValidator;
