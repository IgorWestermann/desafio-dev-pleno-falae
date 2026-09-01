import type {
  AnalysisResult,
  AnalyzeRequest,
  ReviewCategory,
  Sentiment,
} from "./types.ts";

const POSITIVE_KEYWORDS = [
  "adorei",
  "bom",
  "deliciosa",
  "delicioso",
  "excelente",
  "incrivel",
  "maravilhoso",
  "otimo",
  "perfeito",
  "rapido",
  "recomendo",
  "saboroso",
] as const;

const NEGATIVE_KEYWORDS = [
  "atraso",
  "caro",
  "demorou",
  "frio",
  "horrivel",
  "lento",
  "nunca mais",
  "pessimo",
  "ruim",
  "sujo",
] as const;

const CATEGORY_KEYWORDS: Readonly<Record<ReviewCategory, readonly string[]>> = {
  delivery: [
    "atraso",
    "demorou",
    "delivery",
    "entrega",
    "entregador",
    "pedido chegou",
  ],
  service: [
    "atendente",
    "atendimento",
    "garcom",
    "garçon",
    "recepcao",
    "servico",
  ],
  food: [
    "bebida",
    "comida",
    "frio",
    "hamburguer",
    "pizza",
    "prato",
    "sabor",
  ],
  price: ["caro", "custo", "preco", "valor"],
  environment: [
    "ambiente",
    "banheiro",
    "barulho",
    "limpeza",
    "musica",
    "sujo",
  ],
  general: [],
};

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function collectMatches(
  normalizedText: string,
  keywords: readonly string[],
): string[] {
  return keywords.filter((keyword) => normalizedText.includes(normalizeText(keyword)));
}

function determineSentiment(
  request: AnalyzeRequest,
  positiveMatches: readonly string[],
  negativeMatches: readonly string[],
): { sentiment: Sentiment; score: number } {
  let score = positiveMatches.length * 2 - negativeMatches.length * 2;

  if (request.rating !== undefined) {
    if (request.rating <= 2) {
      score -= 3;
    } else if (request.rating >= 4) {
      score += 3;
    }
  }

  if (score >= 2) {
    return { sentiment: "positive", score };
  }

  if (score <= -2) {
    return { sentiment: "negative", score };
  }

  return { sentiment: "neutral", score };
}

function determineCategory(normalizedText: string): ReviewCategory {
  const categories: ReviewCategory[] = [
    "delivery",
    "service",
    "food",
    "price",
    "environment",
  ];

  let selectedCategory: ReviewCategory = "general";
  let selectedScore = 0;

  for (const category of categories) {
    const score = collectMatches(
      normalizedText,
      CATEGORY_KEYWORDS[category],
    ).length;

    if (score > selectedScore) {
      selectedCategory = category;
      selectedScore = score;
    }
  }

  return selectedCategory;
}

function determineConfidence(
  absoluteScore: number,
  totalMatches: number,
  category: ReviewCategory,
): number {
  const categoryBonus = category === "general" ? 0 : 0.08;
  const rawConfidence =
    0.55 + Math.min(absoluteScore, 6) * 0.045 + Math.min(totalMatches, 5) * 0.03 + categoryBonus;

  return Number(Math.min(rawConfidence, 0.98).toFixed(2));
}

export function analyzeReview(request: AnalyzeRequest): AnalysisResult {
  const normalizedText = normalizeText(request.text);
  const positiveMatches = collectMatches(normalizedText, POSITIVE_KEYWORDS);
  const negativeMatches = collectMatches(normalizedText, NEGATIVE_KEYWORDS);
  const { sentiment, score } = determineSentiment(
    request,
    positiveMatches,
    negativeMatches,
  );
  const category = determineCategory(normalizedText);
  const matchedKeywords = [...new Set([...positiveMatches, ...negativeMatches])];

  return {
    sentiment,
    category,
    confidence: determineConfidence(
      Math.abs(score),
      matchedKeywords.length,
      category,
    ),
    matched_keywords: matchedKeywords,
  };
}

export function deterministicDelayMs(
  seed: string,
  minDelayMs: number,
  maxDelayMs: number,
): number {
  if (maxDelayMs <= minDelayMs) {
    return minDelayMs;
  }

  let hash = 2_166_136_261;

  for (const character of seed) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }

  const range = maxDelayMs - minDelayMs + 1;
  return minDelayMs + (Math.abs(hash) % range);
}
