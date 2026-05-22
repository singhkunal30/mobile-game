// Tiny local progression layer — survives between matches in localStorage.
// Server-side persistence is the next step but this gives players a sense of progress today.

const KEY = "blackout_progress_v1";

export interface Progression {
  totalScore: number;
  matchesPlayed: number;
  matchesExtracted: number;
  bestScore: number;
  bestExtractCount: number;
  unlocks: string[]; // future cosmetics
}

const DEFAULT: Progression = {
  totalScore: 0,
  matchesPlayed: 0,
  matchesExtracted: 0,
  bestScore: 0,
  bestExtractCount: 0,
  unlocks: [],
};

export function loadProgression(): Progression {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT };
    return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT };
  }
}

export function recordMatch(score: number, extracted: boolean): Progression {
  const p = loadProgression();
  p.matchesPlayed++;
  p.totalScore += score;
  if (extracted) p.matchesExtracted++;
  if (score > p.bestScore) p.bestScore = score;
  if (extracted && p.matchesExtracted > p.bestExtractCount) p.bestExtractCount = p.matchesExtracted;

  // Mini cosmetic unlocks at score thresholds
  if (p.bestScore >= 1500 && !p.unlocks.includes("badge_silver")) p.unlocks.push("badge_silver");
  if (p.bestScore >= 5000 && !p.unlocks.includes("badge_gold")) p.unlocks.push("badge_gold");
  if (p.matchesExtracted >= 5 && !p.unlocks.includes("badge_pro")) p.unlocks.push("badge_pro");

  localStorage.setItem(KEY, JSON.stringify(p));
  return p;
}
