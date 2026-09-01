import assert from "node:assert/strict";
import test from "node:test";
import { analyzeReview, deterministicDelayMs } from "../src/analyzer.ts";

test("classifica uma reclamação de entrega como negativa", () => {
  const result = analyzeReview({
    review_id: "review-1",
    text: "O pedido demorou muito e chegou frio.",
    rating: 1,
  });

  assert.equal(result.sentiment, "negative");
  assert.equal(result.category, "delivery");
  assert.ok(result.confidence >= 0.7);
  assert.ok(result.matched_keywords.includes("demorou"));
});

test("classifica um elogio à comida como positivo", () => {
  const result = analyzeReview({
    review_id: "review-2",
    text: "Pizza deliciosa e saborosa. Recomendo!",
    rating: 5,
  });

  assert.equal(result.sentiment, "positive");
  assert.equal(result.category, "food");
  assert.ok(result.matched_keywords.includes("deliciosa"));
});

test("retorna análise neutra e geral quando não encontra sinais fortes", () => {
  const result = analyzeReview({
    review_id: "review-3",
    text: "Visitei o local durante a tarde.",
    rating: 3,
  });

  assert.equal(result.sentiment, "neutral");
  assert.equal(result.category, "general");
});

test("gera atraso determinístico dentro do intervalo", () => {
  const first = deterministicDelayMs("same-seed", 100, 300);
  const second = deterministicDelayMs("same-seed", 100, 300);

  assert.equal(first, second);
  assert.ok(first >= 100);
  assert.ok(first <= 300);
});
