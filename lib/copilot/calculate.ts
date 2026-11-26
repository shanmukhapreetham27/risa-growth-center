/**
 * calculate(expression): safe arithmetic for the copilot (SPEC §6.2, mathjs). Every number the model
 * derives goes through here. Only numbers, operators and a short list of functions are accepted;
 * mathjs functions that parse or define code are disabled as well.
 */
import { all, create } from "mathjs";

const math = create(all, { number: "number" });
const evaluate = math.evaluate.bind(math);
const blocked = () => {
  throw new Error("Function is disabled in calculate");
};
math.import(
  { import: blocked, createUnit: blocked, evaluate: blocked, parse: blocked, simplify: blocked, derivative: blocked, resolve: blocked },
  { override: true },
);

const FUNCTIONS = new Set(["round", "floor", "ceil", "abs", "min", "max", "sum", "mean", "median", "sqrt", "pow"]);

export function calculate(expression: string): { expression: string; result: number } {
  if (typeof expression !== "string" || !expression.trim()) throw new Error("expression is required");
  if (expression.length > 500) throw new Error("expression is too long (max 500 characters)");
  const cleaned = expression.replace(/₹/g, "");
  if (/\d,\d{3}/.test(cleaned.replace(/(min|max|sum|mean|median|round|pow)\([^)]*\)/g, "")))
    throw new Error("write numbers without thousands separators, e.g. 1842500 not 18,42,500");
  if (!/^[\d\s+\-*/%^().,a-z]*$/.test(cleaned)) throw new Error("only numbers, + - * / % ^ ( ) and the listed functions are allowed");
  for (const w of cleaned.match(/[a-z]+/g) ?? [])
    if (!FUNCTIONS.has(w)) throw new Error(`"${w}" is not allowed; functions: ${[...FUNCTIONS].join(", ")}`);
  const value = evaluate(cleaned);
  const n = typeof value === "number" ? value : Number(value?.valueOf?.());
  if (!Number.isFinite(n)) throw new Error(`result is not a finite number (${String(value)})`);
  return { expression, result: Math.round(n * 1e10) / 1e10 };
}
