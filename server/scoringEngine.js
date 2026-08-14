// Scoring engine logic ported from code.gs

export const MIN_PERCENTAGE = 0;
export const MAX_PERCENTAGE = 100;
export const MIN_HEAD_RATING = 0;
export const MAX_HEAD_RATING = 200;
export const DEFAULT_HEAD_RATING = 100;
export const MAX_FINAL_SCORE = 200;

export function clampNumber(value, min, max, fallback) {
  const numericValue = Number(value);
  const parsedValue = parseFloat(value);
  if (isNaN(numericValue) || isNaN(parsedValue) || !isFinite(numericValue)) return fallback;
  return Math.min(max, Math.max(min, numericValue));
}

export function parseScoreHelper(val, maxScore = MAX_PERCENTAGE) {
  if (val === null || val === undefined || val === '') return 0;
  const rawValue = val.toString().trim();
  const hasPercentSign = rawValue.indexOf('%') !== -1;
  const normalized = rawValue.replace('%', '');
  const numericValue = Number(normalized);
  const parsedValue = parseFloat(normalized);
  if (isNaN(numericValue) || isNaN(parsedValue) || !isFinite(numericValue)) return 0;
  const upperBound = maxScore ?? MAX_PERCENTAGE;
  const percentage = (!hasPercentSign && numericValue > 0 && numericValue <= 1) ? numericValue * 100 : numericValue;
  return Math.round(clampNumber(percentage, MIN_PERCENTAGE, upperBound, 0));
}

export function getSafeNonNegativeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const numericValue = Number(value);
  const parsedValue = parseFloat(value);
  if (isNaN(numericValue) || isNaN(parsedValue) || !isFinite(numericValue)) return fallback;
  return Math.max(0, numericValue);
}

export function calculatePerformance(bodObj, eodObj) {
  try {
    if (!eodObj || typeof eodObj !== 'object') return 0;
    const scores = [];

    for (const key in eodObj) {
      if (!Object.prototype.hasOwnProperty.call(eodObj, key)) continue;
      const eTask = eodObj[key];
      if (!eTask || typeof eTask !== 'object') continue;

      const bTask = (bodObj && bodObj[key] && typeof bodObj[key] === 'object') ? bodObj[key] : {};
      let target = getSafeNonNegativeNumber(bTask.value, 1);
      let achieved = 0;

      if (eTask.type === 'dynamicList') {
        let targetSum = 0;
        let achievedSum = 0;
        const taskList = Array.isArray(eTask.list) ? eTask.list : [];

        taskList.forEach(item => {
          if (!item || typeof item !== 'object') return;
          const hasNumberTarget = item.hasTarget === true || item.hasTarget === 'true' || item.hasTarget === undefined;
          const itemTarget = hasNumberTarget ? getSafeNonNegativeNumber(item.target, 1) : 1;
          const itemAchieved = hasNumberTarget ? getSafeNonNegativeNumber(item.achieved, 0) : (item.status === 'Done' ? 1 : 0);

          if (item.isVoluntary) {
            achievedSum += itemAchieved;
          } else {
            targetSum += itemTarget;
            achievedSum += itemAchieved;
          }
        });
        target = targetSum;
        achieved = achievedSum;
      } else if (eTask.type === 'checkbox') {
        achieved = eTask.status === 'Done' ? target : 0;
      } else if (eTask.type === 'number') {
        achieved = getSafeNonNegativeNumber(eTask.value, 0);
      } else if (eTask.type === 'categoryNumber') {
        if (eTask.value !== undefined && eTask.value !== null && eTask.value !== '') {
          achieved = getSafeNonNegativeNumber(eTask.value, 0);
        } else if (eTask.subCategories && typeof eTask.subCategories === 'object') {
          for (const category in eTask.subCategories) {
            achieved += getSafeNonNegativeNumber(eTask.subCategories[category], 0);
          }
        }
      }

      const percentage = target <= 0 ? (achieved >= 0 ? 100 : 0) : (achieved / target) * 100;
      scores.push(clampNumber(percentage, MIN_PERCENTAGE, MAX_PERCENTAGE, 0));
    }

    if (scores.length === 0) return 0;
    const total = scores.reduce((sum, s) => sum + clampNumber(s, MIN_PERCENTAGE, MAX_PERCENTAGE, 0), 0);
    return Math.round(clampNumber(total / scores.length, MIN_PERCENTAGE, MAX_PERCENTAGE, 0));
  } catch (error) {
    return 0;
  }
}

export function calculateFinalScore(systemScore, headRating) {
  const safeSystemScore = parseScoreHelper(systemScore, MAX_PERCENTAGE);
  const safeHeadRating = clampNumber(headRating, MIN_HEAD_RATING, MAX_HEAD_RATING, DEFAULT_HEAD_RATING);
  const rawFinal = (safeSystemScore * safeHeadRating) / DEFAULT_HEAD_RATING;
  return Math.round(clampNumber(rawFinal, MIN_PERCENTAGE, MAX_FINAL_SCORE, 0));
}
