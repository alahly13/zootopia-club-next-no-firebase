export const ASSESSMENT_FILE_FIRST_PAGE_QUESTION_TARGET = 2;
export const ASSESSMENT_FILE_FOLLOWING_PAGE_QUESTION_TARGET = 3;
/* The first file page has to share vertical space with the premium cover block. Keep a separate
   complexity budget here so extreme long-form cards can safely fallback to one card without
   sacrificing the normal/common two-card opening rhythm. */
/* Card geometry was tuned slightly larger again to reduce visual whitespace. Keep this budget a
  touch tighter so first-page overflow fallback still triggers early enough for dense content. */
const ASSESSMENT_FILE_FIRST_PAGE_COMPLEXITY_BUDGET = 3240;
/* Keep later pages on the shared three-question rhythm in normal/common files while still
  allowing a rare fallback for unusually dense cards that would otherwise overlap in print/PDF. */
/* Following-page cards are also subtly larger now; this guard keeps the 3-card default while
  preventing footer-adjacent crowding when content density spikes unexpectedly. */
const ASSESSMENT_FILE_PAGE_COMPLEXITY_BUDGET = 3900;

function chunkItems<T>(items: readonly T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

export function partitionAssessmentFileQuestions<T extends AssessmentFileQuestionLike>(questions: readonly T[]) {
  /* Detached preview/result pages and the shared print renderer must follow the same page-slot
     contract: page one targets two questions, and later question pages target three. Keep that
     chunking rule centralized here so future layout refinements do not desynchronize the React
     file surface from the Fast/Pro export HTML foundation. */
  const firstPageCandidateQuestions = questions.slice(0, ASSESSMENT_FILE_FIRST_PAGE_QUESTION_TARGET);
  const firstPageComplexity = firstPageCandidateQuestions.reduce(
    (sum, question) => sum + estimateQuestionComplexity(question),
    0,
  );
  const firstPageUsesOverflowFallback =
    firstPageCandidateQuestions.length === ASSESSMENT_FILE_FIRST_PAGE_QUESTION_TARGET &&
    firstPageComplexity > ASSESSMENT_FILE_FIRST_PAGE_COMPLEXITY_BUDGET;
  const firstPageQuestions = firstPageUsesOverflowFallback
    ? questions.slice(0, ASSESSMENT_FILE_FIRST_PAGE_QUESTION_TARGET - 1)
    : firstPageCandidateQuestions;
  const followingQuestions = questions.slice(firstPageQuestions.length);

  return {
    firstPageQuestions,
    firstPageUsesOverflowFallback,
    followingQuestionPages: chunkItems(
      followingQuestions,
      ASSESSMENT_FILE_FOLLOWING_PAGE_QUESTION_TARGET,
    ),
  };
}

type AssessmentFileQuestionLike = {
  stem: string;
  choices: Array<{ text: string }>;
  supplementalLines: string[];
  answerDisplay: string;
  rationale: string | null;
  tags: string[];
};

function estimateQuestionComplexity(question: AssessmentFileQuestionLike) {
  return (
    question.stem.length +
    question.choices.reduce((sum, choice) => sum + choice.text.length, 0) +
    question.supplementalLines.reduce((sum, line) => sum + line.length, 0) +
    question.answerDisplay.length +
    (question.rationale?.length ?? 0) +
    question.tags.reduce((sum, tag) => sum + tag.length, 0)
  );
}

function buildQuestionPageChunks<T extends AssessmentFileQuestionLike>(
  questions: readonly T[],
  targetCount: number,
) {
  const chunks: Array<{
    questions: T[];
    usesOverflowFallback: boolean;
  }> = [];
  let index = 0;

  while (index < questions.length) {
    const remaining = questions.length - index;
    const targetSlice = questions.slice(index, index + Math.min(targetCount, remaining));
    const targetComplexity = targetSlice.reduce(
      (sum, question) => sum + estimateQuestionComplexity(question),
      0,
    );

    if (targetSlice.length === targetCount && targetComplexity > ASSESSMENT_FILE_PAGE_COMPLEXITY_BUDGET) {
      const fallbackSlice = questions.slice(index, index + targetCount - 1);
      chunks.push({
        questions: [...fallbackSlice],
        usesOverflowFallback: true,
      });
      index += fallbackSlice.length;
      continue;
    }

    chunks.push({
      questions: [...targetSlice],
      usesOverflowFallback: false,
    });
    index += targetSlice.length;
  }

  return chunks;
}

export function buildAssessmentFileQuestionPages<T extends AssessmentFileQuestionLike>(
  questions: readonly T[],
) {
  const {
    firstPageQuestions,
    firstPageUsesOverflowFallback,
    followingQuestionPages,
  } = partitionAssessmentFileQuestions(questions);

  return [
    {
      questions: [...firstPageQuestions],
      usesOverflowFallback: firstPageUsesOverflowFallback,
    },
    ...buildQuestionPageChunks(
      followingQuestionPages.flat(),
      ASSESSMENT_FILE_FOLLOWING_PAGE_QUESTION_TARGET,
    ),
  ].filter((page) => page.questions.length > 0);
}
