/*
 * State machine: derives the full book state from one authoritative input,
 * the placements map.
 *
 *   placements = { [pageId]: { [slotId]: stickerId } }
 *
 * Facts are NOT persisted. They are recomputed from scratch on every call by
 * replaying pages in book order, so an outdated event can never survive a
 * change on an earlier page.
 *
 * Ordering rules (deterministic for any JSON key order):
 *   pages  -> chapter order, then chapter pageIds order
 *   rules  -> priority descending, then ruleId ascending
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./rule-evaluator.js"), require("./variant-resolver.js"));
  } else {
    root.StateMachine = factory(root.RuleEvaluator, root.VariantResolver);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (ruleEvaluator, variantResolver) {
  "use strict";

  const FALLBACK_EVENT_ID = "fallback";

  function pageOrder(book) {
    const order = [];
    (book.chapters || []).forEach((chapter) => {
      (chapter.pageIds || []).forEach((pageId) => {
        if (order.indexOf(pageId) === -1) order.push(pageId);
      });
    });
    // Pages not referenced by a chapter still belong to the book, appended in
    // their declared order so nothing is silently dropped.
    (book.pages || []).forEach((page) => {
      if (order.indexOf(page.id) === -1) order.push(page.id);
    });
    return order;
  }

  function rulesByPage(book) {
    const map = new Map();
    (book.rules || []).forEach((rule) => {
      if (!map.has(rule.pageId)) map.set(rule.pageId, []);
      map.get(rule.pageId).push(rule);
    });
    map.forEach((list, key) => map.set(key, ruleEvaluator.sortRules(list)));
    return map;
  }

  function cloneParagraphs(paragraphs) {
    return (paragraphs || []).map((paragraph) => ({
      id: paragraph.id,
      parts: (paragraph.parts || []).map((part) => ({
        type: part.type,
        value: part.value,
        slotId: part.slotId
      }))
    }));
  }

  function narrativeFor(book, narrativeId) {
    if (!narrativeId) return null;
    return (book.narratives || []).find((narrative) => narrative.id === narrativeId) || null;
  }

  function computeState(book, placements) {
    const input = placements || {};
    const facts = {};
    const pages = {};
    const trace = [];

    const rules = rulesByPage(book);
    const pageMap = new Map((book.pages || []).map((page) => [page.id, page]));

    pageOrder(book).forEach((pageId) => {
      const page = pageMap.get(pageId);
      if (!page) return;
      const pagePlacements = input[pageId] || {};
      const context = { placements: pagePlacements, facts: facts };

      const matched = [];
      let selected = null;

      (rules.get(pageId) || []).forEach((rule) => {
        if (!ruleEvaluator.evaluateCondition(rule.when, context)) return;
        matched.push(rule.id);

        const then = rule.then || {};
        const setFacts = then.setFacts || {};
        Object.keys(setFacts).forEach((name) => {
          facts[name] = setFacts[name];
        });
        (then.clearFacts || []).forEach((name) => {
          delete facts[name];
        });

        const group = rule.group || "main";
        if (!selected && group === "main") selected = rule;
      });

      const then = (selected && selected.then) || {};
      const narrative = narrativeFor(book, then.narrativeId);
      const baseParagraphs = cloneParagraphs(page.paragraphs);
      const paragraphs = narrative ? cloneParagraphs(narrative.paragraphs) : baseParagraphs;

      const variants = variantResolver.resolvePage(
        book,
        page,
        input,
        then.variantOverrides || {}
      );

      pages[pageId] = {
        pageId: pageId,
        eventId: selected ? then.eventId : FALLBACK_EVENT_ID,
        ruleId: selected ? selected.id : null,
        narrativeId: narrative ? narrative.id : null,
        paragraphs: paragraphs,
        baseParagraphs: baseParagraphs,
        variantOverrides: then.variantOverrides || {},
        visualState: then.visualState || null,
        feedback: then.feedback || null,
        matchedRuleIds: matched,
        placements: Object.assign({}, pagePlacements),
        variants: variants
      };

      trace.push({
        pageId: pageId,
        eventId: pages[pageId].eventId,
        ruleId: pages[pageId].ruleId,
        matchedRuleIds: matched
      });
    });

    return { facts: facts, pages: pages, trace: trace };
  }

  return { computeState: computeState, pageOrder: pageOrder, FALLBACK_EVENT_ID: FALLBACK_EVENT_ID };
});
