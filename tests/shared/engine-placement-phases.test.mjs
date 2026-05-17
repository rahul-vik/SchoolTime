import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPlacementPhaseQueues,
  categoryToPlacementPhase,
  classifySubjectPlacementPhase,
  subjectHasIncludeOnlyForDivision,
} from "../../shared/enginePlacementPhases.js";

test("categoryToPlacementPhase maps tenant categories", () => {
  assert.equal(categoryToPlacementPhase("CORE"), "CORE");
  assert.equal(categoryToPlacementPhase("LANGUAGE"), "LANGUAGE");
  assert.equal(categoryToPlacementPhase("PRACTICAL"), "LAB_PRACTICAL");
  assert.equal(categoryToPlacementPhase("EXTRA_CURRICULAR"), "REMAINING");
});

test("INCLUDE_ONLY forces CONSTRAINED phase", () => {
  const rules = [
    {
      id: "r1",
      ruleType: "INCLUDE_ONLY",
      subjectId: "sub-lab",
      divisionIds: ["div-a"],
      isActive: true,
      includeMode: "CUSTOM",
      allowedCells: [{ dayOfWeek: "FRIDAY", slotNumber: 8 }],
    },
  ];
  assert.equal(subjectHasIncludeOnlyForDivision("sub-lab", "div-b", rules), false);
  assert.equal(subjectHasIncludeOnlyForDivision("sub-lab", "div-a", rules), true);
  const sub = { id: "sub-lab", category: "PRACTICAL" };
  const div = { id: "div-a" };
  assert.equal(classifySubjectPlacementPhase(sub, div, { rules }), "CONSTRAINED");
});

test("buildPlacementPhaseQueues orders phases core before language before remaining", () => {
  const div = { id: "div-a", standardId: "s1", mediumId: "m1" };
  const subjects = [
    { id: "sub-pe", category: "EXTRA_CURRICULAR", standardIds: ["s1"], mediumIds: ["m1"] },
    { id: "sub-eng", category: "LANGUAGE", standardIds: ["s1"], mediumIds: ["m1"] },
    { id: "sub-math", category: "CORE", standardIds: ["s1"], mediumIds: ["m1"] },
  ];
  const ctx = {
    rules: [],
    subjectAppliesToDivision: (sub, d) => sub.standardIds.includes(d.standardId) && sub.mediumIds.includes(d.mediumId),
    sortSubjectsHardestFirst: (list) => list,
  };
  const queues = buildPlacementPhaseQueues(subjects, div, ctx, 0);
  assert.deepEqual(
    queues.map((q) => q.phase),
    ["CORE", "LANGUAGE", "REMAINING"],
  );
});
