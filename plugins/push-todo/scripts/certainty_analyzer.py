#!/usr/bin/env python3
"""
Certainty Analyzer for Push Task Execution

Analyzes todos to determine execution certainty based on multiple signals.
High-certainty todos execute automatically; low-certainty todos trigger
planning mode or prompt for clarification.

Architecture:
- Input: Task content, context, and metadata
- Output: Certainty score (0.0-1.0) + confidence reasons + clarification questions

Certainty Signals:
1. Content specificity - Does it clearly describe what to do?
2. Scope clarity - Is the scope well-defined (vs "improve performance")?
3. Codebase context - Does it reference specific files/functions?
4. Action verb presence - Does it start with actionable verbs?
5. Ambiguity markers - Are there question marks, "maybe", "or", etc.?

Thresholds:
- High certainty (>= 0.7): Execute immediately
- Medium certainty (0.4-0.7): Execute with planning mode
- Low certainty (< 0.4): Request clarification before execution

See: Task #968 - Certainty-based execution system
"""

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional, Tuple

# ==================== Constants ====================

# High-confidence action verbs (imperative, specific)
HIGH_CONFIDENCE_VERBS = [
    "add", "create", "implement", "fix", "update", "remove", "delete",
    "rename", "refactor", "migrate", "upgrade", "install", "configure",
    "write", "modify", "change", "replace", "extract", "move", "copy",
    "integrate", "connect", "disconnect", "enable", "disable", "test",
]

# Low-confidence words (vague, uncertain)
LOW_CONFIDENCE_MARKERS = [
    "maybe", "possibly", "might", "could", "should consider",
    "think about", "explore", "investigate", "look into",
    "try to", "attempt to", "see if", "check if",
    "or something", "or maybe", "not sure", "unclear",
    "somehow", "whatever", "something like", "kind of",
]

# Question patterns that indicate uncertainty
QUESTION_PATTERNS = [
    r"\?",  # Direct questions
    r"\bwhat\s+(should|would|could)\b",
    r"\bhow\s+(should|would|could|do)\b",
    r"\bwhich\s+(one|approach|way|method)\b",
    r"\bis\s+it\s+(better|possible|ok)\b",
]

# Specificity indicators (file paths, function names, etc.)
SPECIFICITY_PATTERNS = [
    r"\b[A-Z][a-zA-Z]+\.(swift|ts|tsx|py|js|jsx|go|rs|java|kt)\b",  # File names
    r"\bfunc\s+\w+\b|\bfunction\s+\w+\b|\bdef\s+\w+\b",  # Function defs
    r"\bclass\s+[A-Z][a-zA-Z]+\b",  # Class names
    r"[a-zA-Z]+\.[a-zA-Z]+\(\)",  # Method calls
    r"\/[a-zA-Z][a-zA-Z0-9_\/\-\.]+",  # File paths
    r"\b(line|row)\s+\d+\b",  # Line numbers
    r"#\d+",  # Issue/PR numbers
    r"\b(error|warning|bug)\s*:\s*\w+",  # Error references
]

# Scope indicators that suggest well-defined tasks
SCOPE_INDICATORS = [
    r"\bin\s+(?:the\s+)?(\w+\.\w+|[\w\/]+)\b",  # "in file.ts" or "in src/utils"
    r"\bfor\s+(?:the\s+)?(\w+)\s+(component|service|module|class|function)\b",
    r"\bwhen\s+\w+",  # Condition-based scope
    r"\bonly\s+(for|in|when)\b",  # Explicit scope limitation
]


# ==================== Data Classes ====================

class CertaintyLevel(Enum):
    """Execution certainty levels"""
    HIGH = "high"      # >= 0.7: Execute immediately
    MEDIUM = "medium"  # 0.4-0.7: Execute with planning mode
    LOW = "low"        # < 0.4: Request clarification


@dataclass
class CertaintyReason:
    """A single factor contributing to certainty score"""
    factor: str
    score_delta: float
    explanation: str


@dataclass
class ClarificationQuestion:
    """A question to ask user for low-certainty tasks"""
    question: str
    options: List[str] = field(default_factory=list)
    priority: int = 0  # Higher = more important


@dataclass
class CertaintyAnalysis:
    """Complete analysis of task certainty"""
    score: float
    level: CertaintyLevel
    reasons: List[CertaintyReason]
    clarification_questions: List[ClarificationQuestion]
    recommended_action: str

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization"""
        return {
            "score": round(self.score, 2),
            "level": self.level.value,
            "reasons": [
                {"factor": r.factor, "delta": round(r.score_delta, 2), "explanation": r.explanation}
                for r in self.reasons
            ],
            "clarification_questions": [
                {"question": q.question, "options": q.options, "priority": q.priority}
                for q in self.clarification_questions
            ],
            "recommended_action": self.recommended_action,
        }


# ==================== Analyzer Class ====================

class CertaintyAnalyzer:
    """
    Analyzes todo content to determine execution certainty.

    Uses multiple heuristic signals combined with a weighted scoring system.
    Designed to be fast (no LLM calls) and deterministic.
    """

    def __init__(self):
        # Base score starts at 0.5 (neutral)
        self.base_score = 0.5

    def analyze(self, content: str, summary: Optional[str] = None,
                transcript: Optional[str] = None) -> CertaintyAnalysis:
        """
        Analyze task content and return certainty assessment.

        Args:
            content: The normalized task content
            summary: Optional task summary
            transcript: Optional original voice transcript

        Returns:
            CertaintyAnalysis with score, level, reasons, and questions
        """
        # Combine all text for analysis
        full_text = self._combine_text(content, summary, transcript)
        full_text_lower = full_text.lower()

        reasons: List[CertaintyReason] = []
        questions: List[ClarificationQuestion] = []
        score = self.base_score

        # 1. Check for action verbs at the start
        verb_score, verb_reason = self._check_action_verbs(full_text_lower)
        score += verb_score
        if verb_reason:
            reasons.append(verb_reason)

        # 2. Check for low-confidence markers
        marker_score, marker_reasons = self._check_low_confidence_markers(full_text_lower)
        score += marker_score
        reasons.extend(marker_reasons)

        # 3. Check for questions/uncertainty
        question_score, question_reason, q = self._check_questions(full_text_lower)
        score += question_score
        if question_reason:
            reasons.append(question_reason)
        if q:
            questions.append(q)

        # 4. Check for specificity (file names, functions, etc.)
        spec_score, spec_reason = self._check_specificity(full_text)
        score += spec_score
        if spec_reason:
            reasons.append(spec_reason)

        # 5. Check for scope clarity
        scope_score, scope_reason, scope_q = self._check_scope(full_text_lower)
        score += scope_score
        if scope_reason:
            reasons.append(scope_reason)
        if scope_q:
            questions.append(scope_q)

        # 6. Check content length (very short = potentially unclear)
        length_score, length_reason, length_q = self._check_content_length(content)
        score += length_score
        if length_reason:
            reasons.append(length_reason)
        if length_q:
            questions.append(length_q)

        # 7. Check for multiple alternatives (indicates decision needed)
        alt_score, alt_reason, alt_q = self._check_alternatives(full_text_lower)
        score += alt_score
        if alt_reason:
            reasons.append(alt_reason)
        if alt_q:
            questions.append(alt_q)

        # Clamp score to [0, 1]
        score = max(0.0, min(1.0, score))

        # Determine level
        if score >= 0.7:
            level = CertaintyLevel.HIGH
        elif score >= 0.4:
            level = CertaintyLevel.MEDIUM
        else:
            level = CertaintyLevel.LOW

        # Sort questions by priority
        questions.sort(key=lambda q: -q.priority)

        # Determine recommended action
        recommended = self._get_recommended_action(level, questions)

        return CertaintyAnalysis(
            score=score,
            level=level,
            reasons=reasons,
            clarification_questions=questions,
            recommended_action=recommended,
        )

    def _combine_text(self, content: str, summary: Optional[str],
                      transcript: Optional[str]) -> str:
        """Combine all text sources for analysis"""
        parts = [content]
        if summary:
            parts.append(summary)
        if transcript:
            parts.append(transcript)
        return " ".join(parts)

    def _check_action_verbs(self, text: str) -> Tuple[float, Optional[CertaintyReason]]:
        """Check if task starts with actionable verbs"""
        words = text.split()
        if not words:
            return 0.0, None

        first_word = words[0].strip(".,!?:;")

        if first_word in HIGH_CONFIDENCE_VERBS:
            return 0.15, CertaintyReason(
                factor="action_verb",
                score_delta=0.15,
                explanation=f"Starts with clear action verb: '{first_word}'"
            )

        # Check first 5 words for verb
        for word in words[:5]:
            cleaned = word.strip(".,!?:;")
            if cleaned in HIGH_CONFIDENCE_VERBS:
                return 0.08, CertaintyReason(
                    factor="action_verb",
                    score_delta=0.08,
                    explanation=f"Contains action verb: '{cleaned}'"
                )

        return -0.1, CertaintyReason(
            factor="action_verb",
            score_delta=-0.1,
            explanation="No clear action verb found"
        )

    def _check_low_confidence_markers(self, text: str) -> Tuple[float, List[CertaintyReason]]:
        """Check for words that indicate uncertainty"""
        reasons = []
        total_delta = 0.0

        for marker in LOW_CONFIDENCE_MARKERS:
            if marker in text:
                delta = -0.1
                total_delta += delta
                reasons.append(CertaintyReason(
                    factor="uncertainty_marker",
                    score_delta=delta,
                    explanation=f"Contains uncertainty marker: '{marker}'"
                ))
                # Cap at -0.3 total
                if total_delta <= -0.3:
                    break

        return total_delta, reasons

    def _check_questions(self, text: str) -> Tuple[float, Optional[CertaintyReason],
                                                   Optional[ClarificationQuestion]]:
        """Check for question patterns"""
        for pattern in QUESTION_PATTERNS:
            if re.search(pattern, text, re.IGNORECASE):
                return -0.15, CertaintyReason(
                    factor="question_present",
                    score_delta=-0.15,
                    explanation="Task contains questions or uncertainty"
                ), ClarificationQuestion(
                    question="The task seems to ask a question. Can you clarify what action to take?",
                    options=["Investigate and recommend", "Make a decision for me", "Skip this task"],
                    priority=2
                )
        return 0.0, None, None

    def _check_specificity(self, text: str) -> Tuple[float, Optional[CertaintyReason]]:
        """Check for specific references (files, functions, etc.)"""
        matches = []
        for pattern in SPECIFICITY_PATTERNS:
            found = re.findall(pattern, text)
            matches.extend(found)

        if len(matches) >= 3:
            return 0.2, CertaintyReason(
                factor="high_specificity",
                score_delta=0.2,
                explanation=f"Multiple specific references found ({len(matches)} items)"
            )
        elif len(matches) >= 1:
            return 0.1, CertaintyReason(
                factor="specificity",
                score_delta=0.1,
                explanation=f"Contains specific references: {', '.join(matches[:3])}"
            )

        return -0.05, CertaintyReason(
            factor="low_specificity",
            score_delta=-0.05,
            explanation="No specific file/function references found"
        )

    def _check_scope(self, text: str) -> Tuple[float, Optional[CertaintyReason],
                                               Optional[ClarificationQuestion]]:
        """Check if scope is well-defined"""
        has_scope = any(re.search(pattern, text) for pattern in SCOPE_INDICATORS)

        # Check for overly broad terms
        broad_terms = ["everything", "all files", "entire", "whole codebase",
                       "the system", "performance", "improve"]
        has_broad = any(term in text for term in broad_terms)

        if has_scope and not has_broad:
            return 0.1, CertaintyReason(
                factor="clear_scope",
                score_delta=0.1,
                explanation="Task has well-defined scope"
            ), None
        elif has_broad:
            return -0.15, CertaintyReason(
                factor="broad_scope",
                score_delta=-0.15,
                explanation="Task scope is very broad"
            ), ClarificationQuestion(
                question="The task scope seems broad. Can you narrow it down?",
                options=["Focus on most critical area", "Start with a specific file",
                         "Analyze first, then decide"],
                priority=3
            )

        return 0.0, None, None

    def _check_content_length(self, content: str) -> Tuple[float, Optional[CertaintyReason],
                                                           Optional[ClarificationQuestion]]:
        """Check content length as proxy for detail level"""
        words = len(content.split())

        if words < 5:
            return -0.2, CertaintyReason(
                factor="very_short",
                score_delta=-0.2,
                explanation=f"Task description very short ({words} words)"
            ), ClarificationQuestion(
                question="Can you provide more detail about what specifically needs to be done?",
                priority=4
            )
        elif words < 10:
            return -0.05, CertaintyReason(
                factor="short",
                score_delta=-0.05,
                explanation=f"Task description brief ({words} words)"
            ), None
        elif words > 50:
            return 0.1, CertaintyReason(
                factor="detailed",
                score_delta=0.1,
                explanation="Task has detailed description"
            ), None

        return 0.0, None, None

    def _check_alternatives(self, text: str) -> Tuple[float, Optional[CertaintyReason],
                                                      Optional[ClarificationQuestion]]:
        """Check for multiple alternatives (indicating decision needed)"""
        alt_patterns = [
            r"\bor\s+\w+\b.*\bor\s+\w+\b",  # Multiple "or"s
            r"\beither\b.*\bor\b",
            r"option\s*[a-d1-4]",
            r"\balternative(ly)?\b",
            r"\bversus\b|\bvs\.?\b",
        ]

        for pattern in alt_patterns:
            if re.search(pattern, text, re.IGNORECASE):
                return -0.15, CertaintyReason(
                    factor="multiple_alternatives",
                    score_delta=-0.15,
                    explanation="Task presents multiple alternatives"
                ), ClarificationQuestion(
                    question="Which approach should I take?",
                    priority=5
                )

        return 0.0, None, None

    def _get_recommended_action(self, level: CertaintyLevel,
                                questions: List[ClarificationQuestion]) -> str:
        """Get recommended execution action based on analysis"""
        if level == CertaintyLevel.HIGH:
            return "execute"
        elif level == CertaintyLevel.MEDIUM:
            return "execute_with_plan"
        else:
            if questions:
                return "clarify"
            return "skip_or_clarify"


# ==================== Convenience Functions ====================

def analyze_certainty(content: str, summary: Optional[str] = None,
                      transcript: Optional[str] = None) -> CertaintyAnalysis:
    """
    Convenience function to analyze task certainty.

    Args:
        content: The normalized task content
        summary: Optional task summary
        transcript: Optional original voice transcript

    Returns:
        CertaintyAnalysis with score, level, reasons, and questions
    """
    analyzer = CertaintyAnalyzer()
    return analyzer.analyze(content, summary, transcript)


def should_execute(content: str, summary: Optional[str] = None,
                   transcript: Optional[str] = None,
                   threshold: float = 0.4) -> bool:
    """
    Quick check if task should be executed.

    Args:
        content: The normalized task content
        summary: Optional task summary
        transcript: Optional original voice transcript
        threshold: Minimum certainty score (default 0.4 = medium confidence)

    Returns:
        True if task certainty meets threshold
    """
    analysis = analyze_certainty(content, summary, transcript)
    return analysis.score >= threshold


# ==================== CLI Interface ====================

if __name__ == "__main__":
    import json
    import sys

    if len(sys.argv) < 2:
        print("Usage: python certainty_analyzer.py '<task content>'")
        print("\nExample:")
        print("  python certainty_analyzer.py 'Fix the login bug in auth.swift'")
        sys.exit(1)

    content = sys.argv[1]
    analysis = analyze_certainty(content)

    print(json.dumps(analysis.to_dict(), indent=2))
