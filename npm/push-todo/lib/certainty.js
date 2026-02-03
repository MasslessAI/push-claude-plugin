/**
 * Certainty Analyzer for Push Task Execution
 *
 * Analyzes todos to determine execution certainty based on multiple signals.
 * High-certainty todos execute automatically; low-certainty todos trigger
 * planning mode or prompt for clarification.
 *
 * Architecture:
 * - Input: Task content, context, and metadata
 * - Output: Certainty score (0.0-1.0) + confidence reasons + clarification questions
 *
 * Certainty Signals:
 * 1. Content specificity - Does it clearly describe what to do?
 * 2. Scope clarity - Is the scope well-defined (vs "improve performance")?
 * 3. Codebase context - Does it reference specific files/functions?
 * 4. Action verb presence - Does it start with actionable verbs?
 * 5. Ambiguity markers - Are there question marks, "maybe", "or", etc.?
 *
 * Thresholds:
 * - High certainty (>= 0.7): Execute immediately
 * - Medium certainty (0.4-0.7): Execute with planning mode
 * - Low certainty (< 0.4): Request clarification before execution
 *
 * Ported from: plugins/push-todo/scripts/certainty_analyzer.py
 */

// ==================== Constants ====================

// High-confidence action verbs (imperative, specific)
const HIGH_CONFIDENCE_VERBS = [
  'add', 'create', 'implement', 'fix', 'update', 'remove', 'delete',
  'rename', 'refactor', 'migrate', 'upgrade', 'install', 'configure',
  'write', 'modify', 'change', 'replace', 'extract', 'move', 'copy',
  'integrate', 'connect', 'disconnect', 'enable', 'disable', 'test'
];

// Low-confidence words (vague, uncertain)
const LOW_CONFIDENCE_MARKERS = [
  'maybe', 'possibly', 'might', 'could', 'should consider',
  'think about', 'explore', 'investigate', 'look into',
  'try to', 'attempt to', 'see if', 'check if',
  'or something', 'or maybe', 'not sure', 'unclear',
  'somehow', 'whatever', 'something like', 'kind of'
];

// Question patterns that indicate uncertainty
const QUESTION_PATTERNS = [
  /\?/,                                    // Direct questions
  /\bwhat\s+(should|would|could)\b/i,
  /\bhow\s+(should|would|could|do)\b/i,
  /\bwhich\s+(one|approach|way|method)\b/i,
  /\bis\s+it\s+(better|possible|ok)\b/i
];

// Specificity indicators (file paths, function names, etc.)
const SPECIFICITY_PATTERNS = [
  /\b[A-Z][a-zA-Z]+\.(swift|ts|tsx|py|js|jsx|go|rs|java|kt)\b/,  // File names
  /\bfunc\s+\w+\b|\bfunction\s+\w+\b|\bdef\s+\w+\b/,              // Function defs
  /\bclass\s+[A-Z][a-zA-Z]+\b/,                                    // Class names
  /[a-zA-Z]+\.[a-zA-Z]+\(\)/,                                      // Method calls
  /\/[a-zA-Z][a-zA-Z0-9_/\-.]+/,                                   // File paths
  /\b(line|row)\s+\d+\b/,                                          // Line numbers
  /#\d+/,                                                          // Issue/PR numbers
  /\b(error|warning|bug)\s*:\s*\w+/                                // Error references
];

// Scope indicators that suggest well-defined tasks
const SCOPE_INDICATORS = [
  /\bin\s+(?:the\s+)?(\w+\.\w+|[\w/]+)\b/,                        // "in file.ts" or "in src/utils"
  /\bfor\s+(?:the\s+)?(\w+)\s+(component|service|module|class|function)\b/,
  /\bwhen\s+\w+/,                                                  // Condition-based scope
  /\bonly\s+(for|in|when)\b/                                       // Explicit scope limitation
];

// ==================== Certainty Levels ====================

export const CertaintyLevel = {
  HIGH: 'high',      // >= 0.7: Execute immediately
  MEDIUM: 'medium',  // 0.4-0.7: Execute with planning mode
  LOW: 'low'         // < 0.4: Request clarification
};

// ==================== CertaintyAnalyzer Class ====================

export class CertaintyAnalyzer {
  constructor() {
    // Base score starts at 0.5 (neutral)
    this.baseScore = 0.5;
  }

  /**
   * Analyze task content and return certainty assessment.
   *
   * @param {string} content - The normalized task content
   * @param {string|null} summary - Optional task summary
   * @param {string|null} transcript - Optional original voice transcript
   * @returns {Object} CertaintyAnalysis with score, level, reasons, and questions
   */
  analyze(content, summary = null, transcript = null) {
    // Combine all text for analysis
    const fullText = this._combineText(content, summary, transcript);
    const fullTextLower = fullText.toLowerCase();

    const reasons = [];
    const questions = [];
    let score = this.baseScore;

    // 1. Check for action verbs at the start
    const [verbScore, verbReason] = this._checkActionVerbs(fullTextLower);
    score += verbScore;
    if (verbReason) reasons.push(verbReason);

    // 2. Check for low-confidence markers
    const [markerScore, markerReasons] = this._checkLowConfidenceMarkers(fullTextLower);
    score += markerScore;
    reasons.push(...markerReasons);

    // 3. Check for questions/uncertainty
    const [questionScore, questionReason, questionQ] = this._checkQuestions(fullTextLower);
    score += questionScore;
    if (questionReason) reasons.push(questionReason);
    if (questionQ) questions.push(questionQ);

    // 4. Check for specificity (file names, functions, etc.)
    const [specScore, specReason] = this._checkSpecificity(fullText);
    score += specScore;
    if (specReason) reasons.push(specReason);

    // 5. Check for scope clarity
    const [scopeScore, scopeReason, scopeQ] = this._checkScope(fullTextLower);
    score += scopeScore;
    if (scopeReason) reasons.push(scopeReason);
    if (scopeQ) questions.push(scopeQ);

    // 6. Check content length (very short = potentially unclear)
    const [lengthScore, lengthReason, lengthQ] = this._checkContentLength(content);
    score += lengthScore;
    if (lengthReason) reasons.push(lengthReason);
    if (lengthQ) questions.push(lengthQ);

    // 7. Check for multiple alternatives (indicates decision needed)
    const [altScore, altReason, altQ] = this._checkAlternatives(fullTextLower);
    score += altScore;
    if (altReason) reasons.push(altReason);
    if (altQ) questions.push(altQ);

    // Clamp score to [0, 1]
    score = Math.max(0.0, Math.min(1.0, score));

    // Determine level
    let level;
    if (score >= 0.7) {
      level = CertaintyLevel.HIGH;
    } else if (score >= 0.4) {
      level = CertaintyLevel.MEDIUM;
    } else {
      level = CertaintyLevel.LOW;
    }

    // Sort questions by priority (higher first)
    questions.sort((a, b) => b.priority - a.priority);

    // Determine recommended action
    const recommendedAction = this._getRecommendedAction(level, questions);

    return {
      score: Math.round(score * 100) / 100,
      level,
      reasons,
      clarificationQuestions: questions,
      recommendedAction
    };
  }

  _combineText(content, summary, transcript) {
    const parts = [content];
    if (summary) parts.push(summary);
    if (transcript) parts.push(transcript);
    return parts.join(' ');
  }

  _checkActionVerbs(text) {
    const words = text.split(/\s+/);
    if (words.length === 0) {
      return [0.0, null];
    }

    const firstWord = words[0].replace(/[.,!?:;]/g, '');

    if (HIGH_CONFIDENCE_VERBS.includes(firstWord)) {
      return [0.15, {
        factor: 'action_verb',
        scoreDelta: 0.15,
        explanation: `Starts with clear action verb: '${firstWord}'`
      }];
    }

    // Check first 5 words for verb
    for (const word of words.slice(0, 5)) {
      const cleaned = word.replace(/[.,!?:;]/g, '');
      if (HIGH_CONFIDENCE_VERBS.includes(cleaned)) {
        return [0.08, {
          factor: 'action_verb',
          scoreDelta: 0.08,
          explanation: `Contains action verb: '${cleaned}'`
        }];
      }
    }

    return [-0.1, {
      factor: 'action_verb',
      scoreDelta: -0.1,
      explanation: 'No clear action verb found'
    }];
  }

  _checkLowConfidenceMarkers(text) {
    const reasons = [];
    let totalDelta = 0.0;

    for (const marker of LOW_CONFIDENCE_MARKERS) {
      if (text.includes(marker)) {
        const delta = -0.1;
        totalDelta += delta;
        reasons.push({
          factor: 'uncertainty_marker',
          scoreDelta: delta,
          explanation: `Contains uncertainty marker: '${marker}'`
        });
        // Cap at -0.3 total
        if (totalDelta <= -0.3) {
          break;
        }
      }
    }

    return [totalDelta, reasons];
  }

  _checkQuestions(text) {
    for (const pattern of QUESTION_PATTERNS) {
      if (pattern.test(text)) {
        return [-0.15, {
          factor: 'question_present',
          scoreDelta: -0.15,
          explanation: 'Task contains questions or uncertainty'
        }, {
          question: 'The task seems to ask a question. Can you clarify what action to take?',
          options: ['Investigate and recommend', 'Make a decision for me', 'Skip this task'],
          priority: 2
        }];
      }
    }
    return [0.0, null, null];
  }

  _checkSpecificity(text) {
    const matches = [];
    for (const pattern of SPECIFICITY_PATTERNS) {
      const found = text.match(pattern);
      if (found) {
        matches.push(found[0]);
      }
    }

    if (matches.length >= 3) {
      return [0.2, {
        factor: 'high_specificity',
        scoreDelta: 0.2,
        explanation: `Multiple specific references found (${matches.length} items)`
      }];
    } else if (matches.length >= 1) {
      return [0.1, {
        factor: 'specificity',
        scoreDelta: 0.1,
        explanation: `Contains specific references: ${matches.slice(0, 3).join(', ')}`
      }];
    }

    return [-0.05, {
      factor: 'low_specificity',
      scoreDelta: -0.05,
      explanation: 'No specific file/function references found'
    }];
  }

  _checkScope(text) {
    const hasScope = SCOPE_INDICATORS.some(pattern => pattern.test(text));

    // Check for overly broad terms
    const broadTerms = ['everything', 'all files', 'entire', 'whole codebase',
      'the system', 'performance', 'improve'];
    const hasBroad = broadTerms.some(term => text.includes(term));

    if (hasScope && !hasBroad) {
      return [0.1, {
        factor: 'clear_scope',
        scoreDelta: 0.1,
        explanation: 'Task has well-defined scope'
      }, null];
    } else if (hasBroad) {
      return [-0.15, {
        factor: 'broad_scope',
        scoreDelta: -0.15,
        explanation: 'Task scope is very broad'
      }, {
        question: 'The task scope seems broad. Can you narrow it down?',
        options: ['Focus on most critical area', 'Start with a specific file',
          'Analyze first, then decide'],
        priority: 3
      }];
    }

    return [0.0, null, null];
  }

  _checkContentLength(content) {
    const words = content.split(/\s+/).filter(w => w.length > 0).length;

    if (words < 5) {
      return [-0.2, {
        factor: 'very_short',
        scoreDelta: -0.2,
        explanation: `Task description very short (${words} words)`
      }, {
        question: 'Can you provide more detail about what specifically needs to be done?',
        options: [],
        priority: 4
      }];
    } else if (words < 10) {
      return [-0.05, {
        factor: 'short',
        scoreDelta: -0.05,
        explanation: `Task description brief (${words} words)`
      }, null];
    } else if (words > 50) {
      return [0.1, {
        factor: 'detailed',
        scoreDelta: 0.1,
        explanation: 'Task has detailed description'
      }, null];
    }

    return [0.0, null, null];
  }

  _checkAlternatives(text) {
    const altPatterns = [
      /\bor\s+\w+\b.*\bor\s+\w+\b/i,  // Multiple "or"s
      /\beither\b.*\bor\b/i,
      /option\s*[a-d1-4]/i,
      /\balternative(ly)?\b/i,
      /\bversus\b|\bvs\.?\b/i
    ];

    for (const pattern of altPatterns) {
      if (pattern.test(text)) {
        return [-0.15, {
          factor: 'multiple_alternatives',
          scoreDelta: -0.15,
          explanation: 'Task presents multiple alternatives'
        }, {
          question: 'Which approach should I take?',
          options: [],
          priority: 5
        }];
      }
    }

    return [0.0, null, null];
  }

  _getRecommendedAction(level, questions) {
    if (level === CertaintyLevel.HIGH) {
      return 'execute';
    } else if (level === CertaintyLevel.MEDIUM) {
      return 'execute_with_plan';
    } else {
      if (questions.length > 0) {
        return 'clarify';
      }
      return 'skip_or_clarify';
    }
  }
}

// ==================== Convenience Functions ====================

/**
 * Convenience function to analyze task certainty.
 *
 * @param {string} content - The normalized task content
 * @param {string|null} summary - Optional task summary
 * @param {string|null} transcript - Optional original voice transcript
 * @returns {Object} CertaintyAnalysis with score, level, reasons, and questions
 */
export function analyzeCertainty(content, summary = null, transcript = null) {
  const analyzer = new CertaintyAnalyzer();
  return analyzer.analyze(content, summary, transcript);
}

/**
 * Quick check if task should be executed.
 *
 * @param {string} content - The normalized task content
 * @param {string|null} summary - Optional task summary
 * @param {string|null} transcript - Optional original voice transcript
 * @param {number} threshold - Minimum certainty score (default 0.4 = medium confidence)
 * @returns {boolean} True if task certainty meets threshold
 */
export function shouldExecute(content, summary = null, transcript = null, threshold = 0.4) {
  const analysis = analyzeCertainty(content, summary, transcript);
  return analysis.score >= threshold;
}

/**
 * Get execution mode based on certainty.
 *
 * @param {Object} analysis - CertaintyAnalysis result
 * @returns {string} 'immediate' | 'planning' | 'clarify'
 */
export function getExecutionMode(analysis) {
  if (!analysis) {
    return 'immediate';
  }

  if (analysis.score >= 0.7) {
    return 'immediate';
  } else if (analysis.score >= 0.4) {
    return 'planning';
  } else {
    return 'clarify';
  }
}
