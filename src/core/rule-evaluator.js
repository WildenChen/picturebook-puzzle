/*
 * Rule evaluator: pure, declarative condition evaluation over placements and
 * derived facts. No eval, no arbitrary JavaScript, no DOM access.
 *
 * Supported condition shapes (the v1 DSL):
 *   {always: true}
 *   {all: [cond, ...]}   {any: [cond, ...]}   {not: cond}
 *   {slotEquals: [slotId, stickerId]}
 *   {slotEmpty: slotId}  {slotFilled: slotId}
 *   {factEquals: [factName, value]}  {factMissing: factName}
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RuleEvaluator = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function evaluateCondition(condition, context) {
    if (!condition || typeof condition !== "object") return false;

    if (condition.always === true) return true;

    if (Array.isArray(condition.all)) {
      return condition.all.every((sub) => evaluateCondition(sub, context));
    }
    if (Array.isArray(condition.any)) {
      return condition.any.some((sub) => evaluateCondition(sub, context));
    }
    if (condition.not) return !evaluateCondition(condition.not, context);

    if (Array.isArray(condition.slotEquals)) {
      const slotId = condition.slotEquals[0];
      const stickerId = condition.slotEquals[1];
      return context.placements[slotId] === stickerId;
    }
    if (typeof condition.slotEmpty === "string") {
      return !context.placements[condition.slotEmpty];
    }
    if (typeof condition.slotFilled === "string") {
      return Boolean(context.placements[condition.slotFilled]);
    }
    if (Array.isArray(condition.factEquals)) {
      const name = condition.factEquals[0];
      const expected = condition.factEquals[1];
      if (!Object.prototype.hasOwnProperty.call(context.facts, name)) return false;
      return context.facts[name] === expected;
    }
    if (typeof condition.factMissing === "string") {
      return !Object.prototype.hasOwnProperty.call(context.facts, condition.factMissing);
    }
    return false;
  }

  // Stable ordering: priority descending, then ruleId ascending. Rule order in
  // the JSON file never influences the outcome.
  function compareRules(a, b) {
    if (a.priority !== b.priority) return b.priority - a.priority;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  }

  function sortRules(rules) {
    return (rules || []).slice().sort(compareRules);
  }

  return {
    evaluateCondition: evaluateCondition,
    sortRules: sortRules,
    compareRules: compareRules
  };
});
