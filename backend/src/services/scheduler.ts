import type { Question, Requirement, DayEntry } from '../shared';

export interface Schedule {
  days_available: number;
  days: DayEntry[];
}

export function deriveFocus(
  questionIds: string[],
  allQuestions: Question[],
  requirements: Requirement[],
): string {
  if (questionIds.length === 0) return '';

  const reqKind = new Map<string, Requirement['kind']>(
    requirements.map(r => [r.id, r.kind]),
  );
  const qMap = new Map<string, string[]>(
    allQuestions.map(q => [q.id, q.requirement_ids]),
  );

  const kindCount: Record<string, number> = {};
  for (const qId of questionIds) {
    for (const rId of qMap.get(qId) ?? []) {
      const kind = reqKind.get(rId);
      if (kind) kindCount[kind] = (kindCount[kind] ?? 0) + 1;
    }
  }

  const entries = Object.entries(kindCount);
  if (entries.length === 0) return '';

  entries.sort(([aK, aC], [bK, bC]) => bC !== aC ? bC - aC : aK.localeCompare(bK));
  const maxCount = entries[0][1];
  return entries
    .filter(([, c]) => c === maxCount)
    .map(([k]) => k.charAt(0).toUpperCase() + k.slice(1))
    .join(', ');
}

export function buildSchedule(
  questions: Question[],
  requirements: Requirement[],
  daysAvailable: number,
): Schedule {
  // ── Step 1: Partition ──────────────────────────────────────────────────────
  const mustHaveReqIds = new Set(
    requirements.filter(r => r.priority === 'must').map(r => r.id),
  );

  const mustQ = questions.filter(q =>
    q.requirement_ids.some(id => mustHaveReqIds.has(id)),
  );
  const niceQ = questions.filter(
    q => !q.requirement_ids.some(id => mustHaveReqIds.has(id)),
  );

  // ── Step 2: Determine active question set ──────────────────────────────────
  // Special case: if there are no must-have requirements at all (the LLM
  // marked everything as nice-to-have), schedule ALL questions so the
  // resulting schedule is never empty.
  let activeQuestions: Question[];

  if (mustQ.length === 0) {
    activeQuestions = [...questions];
  } else {
    const evenSlots = Math.ceil(mustQ.length / daysAvailable) * daysAvailable;
    const includeNice = mustQ.length + niceQ.length <= evenSlots;
    activeQuestions = includeNice ? [...mustQ, ...niceQ] : [...mustQ];
  }

  // ── Step 3: Overflow warning ───────────────────────────────────────────────
  const evenSlots =
    activeQuestions.length === 0
      ? daysAvailable
      : Math.ceil(activeQuestions.length / daysAvailable) * daysAvailable;

  if (mustQ.length > 0 && activeQuestions.length > evenSlots) {
    console.warn(
      `[scheduler] overflow: ${activeQuestions.length} active questions ` +
        `exceed ${evenSlots} slots for ${daysAvailable} days.`,
    );
  }

  // ── Step 4: Sort — difficulty DESC, requirement position ASC ──────────────
  const reqOrder = new Map<string, number>(
    requirements.map((r, i) => [r.id, i]),
  );

  activeQuestions.sort((a, b) => {
    if (b.difficulty !== a.difficulty) return b.difficulty - a.difficulty;
    const aIdx = a.requirement_ids.length === 0
      ? Infinity
      : Math.min(...a.requirement_ids.map(id => reqOrder.get(id) ?? Infinity));
    const bIdx = b.requirement_ids.length === 0
      ? Infinity
      : Math.min(...b.requirement_ids.map(id => reqOrder.get(id) ?? Infinity));
    return aIdx - bIdx;
  });

  // ── Step 5: Spaced repetition when questions < days ───────────────────────
  const toRepeat = mustQ.length > 0 ? mustQ : activeQuestions;
  let finalQuestions = activeQuestions;

  if (finalQuestions.length < daysAvailable && toRepeat.length > 0) {
    while (finalQuestions.length < daysAvailable) {
      finalQuestions = [...finalQuestions, ...toRepeat];
    }
    finalQuestions = finalQuestions.slice(0, daysAvailable);
  }

  // ── Step 6: Round-robin distribute ────────────────────────────────────────
  const days: DayEntry[] = Array.from({ length: daysAvailable }, (_, i) => ({
    day: i + 1,
    focus: '',
    question_ids: [],
    minutes: 0,
  }));

  finalQuestions.forEach((q, i) => {
    days[i % daysAvailable].question_ids.push(q.id);
  });

  // ── Step 7: Compute minutes and focus ─────────────────────────────────────
  days.forEach(day => {
    day.minutes = 15 * day.question_ids.length;
    day.focus = deriveFocus(day.question_ids, questions, requirements);
  });

  return { days_available: daysAvailable, days };
}
