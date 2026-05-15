"""
HTTP JSON sidecar for SchoolTime CP-SAT timetable solving.
Contract: planning/global-optimal-solver/JSON_CONTRACT.md (v1.0.0).
"""
from __future__ import annotations

import json
import math
import os
import sys
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

try:
    from ortools.sat.python import cp_model
    import ortools

    ORTOOLS_VERSION = getattr(ortools, "__version__", "unknown")
except ImportError as e:  # pragma: no cover - import guard for dev without ortools
    cp_model = None  # type: ignore
    ORTOOLS_VERSION = "missing"
    _IMPORT_ERR = e


WEEKDAY_ORDER = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]


def _sort_working_days(days: Sequence[str]) -> List[str]:
    uniq = list(dict.fromkeys(str(d) for d in days if d))
    return sorted(uniq, key=lambda d: (WEEKDAY_ORDER.index(d) if d in WEEKDAY_ORDER else 99, d))


def _slot_active(slot: dict, day: str) -> bool:
    aw = slot.get("activeWeekdays") or []
    if not isinstance(aw, list) or len(aw) == 0:
        return True
    return day in aw


def _include_rule_division_ids(rule: dict) -> List[str]:
    if isinstance(rule.get("divisionIds"), list) and rule["divisionIds"]:
        return [str(x) for x in rule["divisionIds"]]
    if rule.get("divisionId"):
        return [str(rule["divisionId"])]
    return []


def _include_only_rules(subject_id: str, division_id: str, rules: List[dict]) -> List[dict]:
    out = []
    for r in rules or []:
        if not r or r.get("ruleType") != "INCLUDE_ONLY":
            continue
        if r.get("isActive") is False:
            continue
        if str(r.get("subjectId")) != str(subject_id):
            continue
        if division_id not in _include_rule_division_ids(r):
            continue
        out.append(r)
    return out


def _cell_matches_include_only(
    rule: dict, day: str, slot_number: int, period_slots: List[dict], working_days: List[str]
) -> bool:
    mode = rule.get("includeMode") or "PRESET_LAST_LESSON"
    if mode == "CUSTOM":
        cells = rule.get("allowedCells") or []
        if not cells:
            return False
        for c in cells:
            if not c or str(c.get("dayOfWeek")) != day or int(c.get("slotNumber", -1)) != int(slot_number):
                continue
            row = next((s for s in period_slots if int(s.get("slotNumber", -1)) == int(slot_number)), None)
            if not row:
                continue
            if _slot_active(row, day):
                return True
        return False
    if mode == "PRESET_LAST_LESSON":
        weekday = str(rule.get("includeWeekday") or "FRIDAY")
        if weekday not in working_days:
            return False
        lesson_slots = [s for s in period_slots if s.get("slotType") == "LESSON"]
        if not lesson_slots:
            return False
        last_lesson = max(int(s["slotNumber"]) for s in lesson_slots)
        if day != weekday or int(slot_number) != last_lesson:
            return False
        row = next((s for s in period_slots if int(s.get("slotNumber")) == last_lesson), None)
        if row and not _slot_active(row, day):
            return False
        return True
    return False


def _placement_allowed_include_only(
    subject_id: str, division_id: str, day: str, slot_number: int, period_slots: List[dict], working_days: List[str], rules: List[dict]
) -> bool:
    rel = _include_only_rules(subject_id, division_id, rules)
    if not rel:
        return True
    return all(_cell_matches_include_only(r, day, slot_number, period_slots, working_days) for r in rel)


def _day_blocked(subject_id: str, day: str, rules: List[dict]) -> bool:
    for r in rules or []:
        if not r or r.get("isActive") is False or str(r.get("subjectId")) != str(subject_id):
            continue
        if r.get("ruleType") != "EXCLUDE_DAY":
            continue
        if day in (r.get("dayOfWeekList") or []) or str(r.get("dayOfWeek")) == day:
            return True
    return False


def _slot_meta(period_slots: List[dict]) -> Tuple[Optional[int], Optional[int], Optional[int]]:
    ls = sorted([s for s in period_slots if s.get("slotType") == "LESSON"], key=lambda s: int(s["slotNumber"]))
    if not ls:
        return None, None, None
    first_morning = int(ls[0]["slotNumber"])
    last_lesson = int(ls[-1]["slotNumber"])
    lunch_nums = [int(s["slotNumber"]) for s in period_slots if s.get("slotType") == "LUNCH"]
    first_after_lunch = None
    if lunch_nums:
        max_l = max(lunch_nums)
        after = [s for s in ls if int(s["slotNumber"]) > max_l]
        if after:
            first_after_lunch = int(after[0]["slotNumber"])
    return first_morning, first_after_lunch, last_lesson


def _slot_blocked_by_rule(subject_id: str, slot_number: int, period_slots: List[dict], rules: List[dict]) -> bool:
    fm, fal, ll = _slot_meta(period_slots)

    def blocked_by_targets(targets: Any) -> bool:
        if not isinstance(targets, list) or not targets:
            return False
        for t in targets:
            if t == "FIRST_MORNING" and fm is not None and slot_number == fm:
                return True
            if t == "FIRST_AFTER_LUNCH" and fal is not None and slot_number == fal:
                return True
            if t == "LAST_LESSON" and ll is not None and slot_number == ll:
                return True
        return False

    def blocked_by_preset(preset: str) -> bool:
        if preset == "FIRST_MORNING":
            return fm is not None and slot_number == fm
        if preset == "FIRST_AFTER_LUNCH":
            return fal is not None and slot_number == fal
        if preset == "LAST_LESSON":
            return ll is not None and slot_number == ll
        if preset == "FIRST_MORNING_AND_FIRST_AFTER_LUNCH":
            return (fm is not None and slot_number == fm) or (fal is not None and slot_number == fal)
        if preset == "FIRST_MORNING_AND_LAST_LESSON":
            return (fm is not None and slot_number == fm) or (ll is not None and slot_number == ll)
        if preset == "FIRST_AFTER_LUNCH_AND_LAST_LESSON":
            return (fal is not None and slot_number == fal) or (ll is not None and slot_number == ll)
        if preset == "FIRST_MORNING_AND_FIRST_AFTER_LUNCH_AND_LAST_LESSON":
            return (fm is not None and slot_number == fm) or (fal is not None and slot_number == fal) or (ll is not None and slot_number == ll)
        return False

    for r in rules or []:
        if not r or r.get("isActive") is False or str(r.get("subjectId")) != str(subject_id):
            continue
        rt = r.get("ruleType")
        if rt == "NOT_FIRST_MORNING" and fm is not None and slot_number == fm:
            return True
        if rt == "NOT_FIRST_AFTER_LUNCH" and fal is not None and slot_number == fal:
            return True
        if rt == "BOTH_BOUNDARY":
            if fm is not None and slot_number == fm:
                return True
            if ll is not None and slot_number == ll:
                return True
            if fal is not None and slot_number == fal:
                return True
        if rt == "EXCLUDE_SLOT":
            if blocked_by_targets(r.get("slotTargets")):
                return True
            if r.get("slotPreset") and blocked_by_preset(str(r["slotPreset"])):
                return True
            if r.get("slotNumber") is not None and int(r["slotNumber"]) == int(slot_number):
                return True
    return False


def _subject_applies(subject: dict, division: dict) -> bool:
    if str(division.get("standardId")) not in (subject.get("standardIds") or []):
        return False
    if str(division.get("mediumId")) not in (subject.get("mediumIds") or []):
        return False
    mode = subject.get("divisionScopeMode") or "ALL_IN_SELECTED_CLASSES"
    if mode == "ALL_IN_SELECTED_CLASSES":
        return True
    inc = subject.get("divisionIncludeIds") or []
    exc = subject.get("divisionExcludeIds") or []
    if inc:
        return str(division["id"]) in [str(x) for x in inc]
    if exc:
        return str(division["id"]) not in [str(x) for x in exc]
    return True


def _division_subject_limits(subject: dict, division_id: str, subject_allocations: List[dict]) -> Tuple[int, int]:
    dls = subject.get("divisionLimits") or []
    lim = next((x for x in dls if str(x.get("divisionId")) == str(division_id)), None)
    legacy = next(
        (a for a in subject_allocations or [] if str(a.get("divisionId")) == str(division_id) and str(a.get("subjectId")) == str(subject.get("id"))),
        None,
    )
    weekly = int(lim["weeklyPeriods"]) if lim and lim.get("weeklyPeriods") is not None else (
        int(legacy["weeklyPeriods"]) if legacy and legacy.get("weeklyPeriods") is not None else int(subject.get("weeklyPeriods") or 0)
    )
    max_day = int(lim["maxPerDay"]) if lim and lim.get("maxPerDay") is not None else int(subject.get("maxPerDay") or 2)
    return weekly, max_day


def _teacher_allowed_in_division(teacher: dict, division_id: str) -> bool:
    ad = teacher.get("assignedDivisionIds") or []
    if not ad:
        return True
    return str(division_id) in [str(x) for x in ad]


def _teacher_subject_allowed(teacher: dict, subject_id: str, division_id: str) -> bool:
    rows = teacher.get("divisionSubjectExclusions") or []
    hit = next((r for r in rows if str(r.get("divisionId")) == str(division_id)), None)
    if not hit:
        return True
    return str(subject_id) not in [str(x) for x in (hit.get("subjectIds") or [])]


def _eligible_teachers(
    subject_id: str,
    division: dict,
    teachers: List[dict],
    teacher_subjects: List[dict],
) -> List[dict]:
    div_id = str(division["id"])
    medium_id = str(division.get("mediumId"))
    explicit = [
        ts
        for ts in teacher_subjects or []
        if str(ts.get("subjectId")) == str(subject_id) and (not ts.get("divisionId") or str(ts.get("divisionId")) == div_id)
    ]
    if explicit:
        out = []
        for ts in explicit:
            t = next((x for x in teachers if str(x.get("id")) == str(ts.get("teacherId"))), None)
            if not t:
                continue
            if medium_id not in [str(x) for x in (t.get("mediumIds") or [])]:
                continue
            if not _teacher_allowed_in_division(t, div_id):
                continue
            if not _teacher_subject_allowed(t, subject_id, div_id):
                continue
            out.append(t)
        return out

    return [
        t
        for t in teachers
        if str(subject_id) in [str(x) for x in (t.get("subjectIds") or [])]
        and medium_id in [str(x) for x in (t.get("mediumIds") or [])]
        and _teacher_allowed_in_division(t, div_id)
        and _teacher_subject_allowed(t, subject_id, div_id)
    ]


def _free_period_block(tenant: dict, teacher_id: str, day: str, slot_number: int) -> bool:
    for r in tenant.get("freePeriodRules") or []:
        if str(r.get("teacherId")) == str(teacher_id) and str(r.get("dayOfWeek")) == day and int(r.get("slotNumber", -1)) == int(slot_number):
            return True
    return False


def _ignore_day_slot_soft_rules(options: dict, tenant: dict) -> bool:
    """Match legacy BEST_FIT/OPTIMAL passes: relax EXCLUDE_DAY / slot soft rules only (see server/engine.js)."""
    mode = str((options or {}).get("softRuleMode") or "MATCH_LEGACY_STRICT")
    if mode == "ALL_HARD":
        return False
    if mode == "MATCH_LEGACY_BEST_FIT_OR_OPTIMAL":
        return True
    ctp = tenant.get("classTeacherPreferences") or {}
    sched = str(ctp.get("schedulingMode") or "STRICT")
    return sched in ("BEST_FIT", "OPTIMAL")


def _lesson_slot_numbers_sorted(period_slots: List[dict]) -> List[int]:
    ls = sorted([s for s in period_slots if s.get("slotType") == "LESSON"], key=lambda s: int(s["slotNumber"]))
    return [int(s["slotNumber"]) for s in ls]


def _get_teacher_capacity(teacher: dict, period_slots: List[dict], working_days: List[str]) -> Dict[str, Any]:
    """Mirror server/engine.js getTeacherCapacity + morning/evening slot split."""
    ls_nums = _lesson_slot_numbers_sorted(period_slots)
    if not ls_nums:
        return {
            "effective_daily": 0,
            "effective_weekly": 0,
            "morning_allowed": 0,
            "evening_allowed": 0,
            "morn_slot_nums": frozenset(),
            "eve_slot_nums": frozenset(),
        }
    lunch_nums = [int(s["slotNumber"]) for s in period_slots if s.get("slotType") == "LUNCH"]
    first_after_lunch: Optional[int] = None
    if lunch_nums:
        max_l = max(lunch_nums)
        after = [sn for sn in ls_nums if sn > max_l]
        if after:
            first_after_lunch = after[0]

    def is_morn(sn: int) -> bool:
        if first_after_lunch is not None:
            return sn < first_after_lunch
        return sn <= math.ceil(len(ls_nums) / 2)

    morn_slot_nums = frozenset(sn for sn in ls_nums if is_morn(sn))
    eve_slot_nums = frozenset(sn for sn in ls_nums if not is_morn(sn))
    fm = max(0, int(teacher.get("freeMorningPeriods") or 0))
    fe = max(0, int(teacher.get("freeEveningPeriods") or 0))
    morning_allowed = max(0, len(morn_slot_nums) - fm)
    evening_allowed = max(0, len(eve_slot_nums) - fe)
    session_allowed = morning_allowed + evening_allowed
    derived_daily = max(0, min(len(ls_nums), session_allowed))
    derived_weekly = derived_daily * len(working_days)
    auto_weekly = max(30, derived_weekly)
    configured_daily = int(teacher.get("maxPerDay") or 0)
    configured_weekly = int(teacher.get("maxPerWeek") or 0)
    effective_daily = min(derived_daily, configured_daily) if configured_daily > 0 else derived_daily
    effective_weekly = min(auto_weekly, configured_weekly) if configured_weekly > 0 else auto_weekly
    return {
        "effective_daily": effective_daily,
        "effective_weekly": effective_weekly,
        "morning_allowed": morning_allowed,
        "evening_allowed": evening_allowed,
        "morn_slot_nums": morn_slot_nums,
        "eve_slot_nums": eve_slot_nums,
    }


def _reify_int_eq(model: Any, x: Any, value: int, b: Any) -> None:
    """b == 1 iff x == value (b is BoolVar)."""
    model.Add(x == value).OnlyEnforceIf(b)
    model.Add(x != value).OnlyEnforceIf(b.Not())


def _reify_bool_and(model: Any, out: Any, a: Any, b: Any) -> None:
    """out == a AND b for 0-1 booleans."""
    model.AddMinEquality(out, [a, b])


def _reify_bool_and3(model: Any, out: Any, a: Any, b: Any, c: Any) -> None:
    """out == a AND b AND c for 0-1 booleans."""
    tmp = model.NewBoolVar(f"and3_{out.Name() if hasattr(out, 'Name') else id(out)}")
    _reify_bool_and(model, tmp, a, b)
    _reify_bool_and(model, out, tmp, c)


def _build_unscheduled(
    divisions: List[dict],
    subjects: List[dict],
    subject_allocations: List[dict],
    lesson_entries: List[dict],
) -> List[dict]:
    scheduled: Dict[Tuple[str, str], int] = {}
    for e in lesson_entries:
        if not e or e.get("isFreePeriod") or not e.get("subjectId") or not e.get("teacherId"):
            continue
        k = (str(e["divisionId"]), str(e["subjectId"]))
        scheduled[k] = scheduled.get(k, 0) + 1
    out: List[dict] = []
    for div in divisions:
        for sub in subjects:
            if not _subject_applies(sub, div):
                continue
            w, _ = _division_subject_limits(sub, str(div["id"]), subject_allocations)
            required = int(w)
            got = scheduled.get((str(div["id"]), str(sub["id"])), 0)
            if got < required:
                out.append(
                    {
                        "divisionId": str(div["id"]),
                        "subjectId": str(sub["id"]),
                        "periodsRequired": required,
                        "periodsScheduled": got,
                        "periodsShort": required - got,
                    }
                )
    return out


def _allowed_time_keys_for_unit(
    division: dict,
    subject: dict,
    tenant: dict,
    teachers: List[dict],
    ignore_day_slot_soft_rules: bool = False,
) -> Set[Tuple[str, str, int]]:
    """Set of (teacher_id, day, slot_number) allowed for one lesson of this subject in this division."""
    period_slots = tenant.get("periodSlots") or []
    working_days = _sort_working_days(tenant.get("workingDays") or [])
    if not working_days:
        working_days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"]
    rules = tenant.get("schedulingRules") or []
    subject_id = str(subject["id"])
    div_id = str(division["id"])
    lesson_slots = [s for s in period_slots if s.get("slotType") == "LESSON"]
    elig = _eligible_teachers(subject_id, division, teachers, tenant.get("teacherSubjects") or [])
    allowed: Set[Tuple[str, str, int]] = set()
    for t in elig:
        tid = str(t["id"])
        for day in working_days:
            if not ignore_day_slot_soft_rules and _day_blocked(subject_id, day, rules):
                continue
            for slot in lesson_slots:
                sn = int(slot["slotNumber"])
                if not _slot_active(slot, day):
                    continue
                if not ignore_day_slot_soft_rules and _slot_blocked_by_rule(subject_id, sn, period_slots, rules):
                    continue
                if not _placement_allowed_include_only(subject_id, div_id, day, sn, period_slots, working_days, rules):
                    continue
                if _free_period_block(tenant, tid, day, sn):
                    continue
                allowed.add((tid, day, sn))
    return allowed


def _time_flat_encode(working_days: List[str], day: str, slot_number: int) -> int:
    di = working_days.index(day) if day in working_days else 0
    return di * 512 + int(slot_number)


def _decode_time_flat(working_days: List[str], v: int) -> Tuple[str, int]:
    di = v // 512
    sn = v % 512
    day = working_days[di] if 0 <= di < len(working_days) else working_days[0]
    return day, sn


def solve_request(payload: dict) -> dict:
    t0 = time.time()
    if cp_model is None:
        return {
            "contractVersion": payload.get("contractVersion") or "1.0.0",
            "requestId": payload.get("requestId") or "",
            "solverStatus": "ERROR",
            "timing": {"wallMs": int((time.time() - t0) * 1000)},
            "entries": [],
            "report": {"totalRequired": 0, "totalScheduled": 0, "unscheduled": [], "cpsat": {"error": f"ortools_missing:{_IMPORT_ERR}"}},
        }

    tenant = payload.get("tenant") or {}
    teachers = tenant.get("teachers") or []
    divisions = tenant.get("divisions") or []
    subjects = tenant.get("subjects") or []
    subject_allocations = tenant.get("subjectAllocations") or []
    working_days = _sort_working_days(tenant.get("workingDays") or [])
    if not working_days:
        working_days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"]

    options = payload.get("options") or {}
    time_limit = float(options.get("timeLimitSec") or 45)

    period_slots = tenant.get("periodSlots") or []
    rules = tenant.get("schedulingRules") or []
    ignore_soft = _ignore_day_slot_soft_rules(options, tenant)
    lesson_slot_nums = _lesson_slot_numbers_sorted(period_slots)
    cap_by_tid = {str(t["id"]): _get_teacher_capacity(t, period_slots, working_days) for t in teachers}

    fixed_rows: List[dict] = []
    fixed_keys_div: Set[Tuple[str, str, int]] = set()
    fixed_keys_t: Set[Tuple[str, str, int]] = set()

    for fs in tenant.get("fixedSlots") or []:
        if not fs:
            continue
        div = next((d for d in divisions if str(d["id"]) == str(fs.get("divisionId"))), None)
        sub = next((s for s in subjects if str(s["id"]) == str(fs.get("subjectId"))), None)
        if not div or not sub or not _subject_applies(sub, div):
            continue
        day = str(fs["dayOfWeek"])
        sn = int(fs["slotNumber"])
        if (str(div["id"]), day, sn) in fixed_keys_div:
            continue
        slot_row = next((s for s in period_slots if int(s.get("slotNumber", -1)) == sn), None)
        if slot_row and not _slot_active(slot_row, day):
            continue
        subject_id = str(sub["id"])
        elig = _eligible_teachers(subject_id, div, teachers, tenant.get("teacherSubjects") or [])
        elig_sorted = sorted(elig, key=lambda t: str(t.get("id")))
        tid: Optional[str] = None
        for t in elig_sorted:
            t_id = str(t["id"])
            if _free_period_block(tenant, t_id, day, sn):
                continue
            if not _placement_allowed_include_only(subject_id, str(div["id"]), day, sn, period_slots, working_days, rules):
                continue
            if not ignore_soft and _day_blocked(subject_id, day, rules):
                continue
            if not ignore_soft and _slot_blocked_by_rule(subject_id, sn, period_slots, rules):
                continue
            tid = t_id
            break
        if not tid:
            continue
        fixed_rows.append(
            {
                "divisionId": str(div["id"]),
                "teacherId": tid,
                "subjectId": subject_id,
                "dayOfWeek": day,
                "slotNumber": sn,
                "isDouble": False,
                "isFreePeriod": False,
                "slotType": "LESSON",
            }
        )
        fixed_keys_div.add((str(div["id"]), day, sn))
        fixed_keys_t.add((tid, day, sn))

    units: List[dict] = []

    for div in divisions:
        for sub in subjects:
            if not _subject_applies(sub, div):
                continue
            weekly, _max_day = _division_subject_limits(sub, str(div["id"]), subject_allocations)
            fixed_here = len([r for r in fixed_rows if r["divisionId"] == str(div["id"]) and r["subjectId"] == str(sub["id"])])
            need = max(0, int(weekly) - fixed_here)
            sub_w = max(1, int(sub.get("priorityWeight") or 1))
            for k in range(need):
                units.append(
                    {
                        "divisionId": str(div["id"]),
                        "subjectId": str(sub["id"]),
                        "demandWeight": sub_w,
                        "demandIndex": k,
                    }
                )

    # Build teacher index from all teachers that appear in any allowed set
    teacher_ids_ordered: List[str] = []
    for t in teachers:
        tid = str(t["id"])
        if tid not in teacher_ids_ordered:
            teacher_ids_ordered.append(tid)
    teacher_index = {tid: i for i, tid in enumerate(teacher_ids_ordered)}

    time_flat_domain_per_unit: List[List[List[int]]] = []

    for u in units:
        div = next((d for d in divisions if str(d["id"]) == u["divisionId"]), None)
        sub = next((s for s in subjects if str(s["id"]) == u["subjectId"]), None)
        if not div or not sub:
            time_flat_domain_per_unit.append([])
            continue
        allowed = _allowed_time_keys_for_unit(div, sub, tenant, teachers, ignore_soft)
        dom: List[List[int]] = []
        for tid, day, sn in sorted(allowed):
            if (u["divisionId"], day, sn) in fixed_keys_div:
                continue
            if (tid, day, sn) in fixed_keys_t:
                continue
            tf = _time_flat_encode(working_days, day, sn)
            dom.append([teacher_index[tid], tf])
        time_flat_domain_per_unit.append(dom)

    placeable_specs: List[Tuple[dict, List[List[int]]]] = []
    empty_domain_units = 0
    for ui, dom in enumerate(time_flat_domain_per_unit):
        if len(dom) > 0:
            placeable_specs.append((units[ui], dom))
        else:
            empty_domain_units += 1

    if len(units) == 0:
        wall_ms = int((time.time() - t0) * 1000)
        total_required = 0
        for div in divisions:
            for sub in subjects:
                if not _subject_applies(sub, div):
                    continue
                w, _ = _division_subject_limits(sub, str(div["id"]), subject_allocations)
                total_required += int(w)
        total_scheduled = len([e for e in fixed_rows if e.get("subjectId") and e.get("teacherId")])
        return {
            "contractVersion": "1.0.0",
            "requestId": payload.get("requestId") or "",
            "solverStatus": "FEASIBLE",
            "timing": {"wallMs": wall_ms},
            "entries": fixed_rows,
            "report": {
                "totalRequired": total_required,
                "totalScheduled": total_scheduled,
                "unscheduled": [],
                "cpsat": {"orToolsVersion": ORTOOLS_VERSION, "note": "fixed_only"},
            },
        }

    fixed_counts_daily: Dict[Tuple[str, int], int] = {}
    fixed_counts_morn: Dict[Tuple[str, int], int] = {}
    fixed_counts_eve: Dict[Tuple[str, int], int] = {}
    fixed_weekly: Dict[str, int] = {}
    fixed_subject_daily: Dict[Tuple[str, str, int], int] = {}
    fixed_teacher_at: Dict[Tuple[str, int, int, str], int] = {}
    fixed_same_at: Dict[Tuple[str, int, int, str, str], int] = {}
    for fr in fixed_rows:
        tid = str(fr["teacherId"])
        day = str(fr["dayOfWeek"])
        sn = int(fr["slotNumber"])
        di = working_days.index(day) if day in working_days else 0
        fixed_subject_daily[(str(fr["divisionId"]), str(fr["subjectId"]), di)] = (
            fixed_subject_daily.get((str(fr["divisionId"]), str(fr["subjectId"]), di), 0) + 1
        )
        fixed_teacher_at[(str(fr["divisionId"]), di, sn, tid)] = 1
        fixed_same_at[(str(fr["divisionId"]), di, sn, tid, str(fr["subjectId"]))] = 1
        cap0 = cap_by_tid.get(tid) or _get_teacher_capacity({}, period_slots, working_days)
        fixed_counts_daily[tid, di] = fixed_counts_daily.get((tid, di), 0) + 1
        fixed_weekly[tid] = fixed_weekly.get(tid, 0) + 1
        if sn in cap0["morn_slot_nums"]:
            fixed_counts_morn[tid, di] = fixed_counts_morn.get((tid, di), 0) + 1
        elif sn in cap0["eve_slot_nums"]:
            fixed_counts_eve[tid, di] = fixed_counts_eve.get((tid, di), 0) + 1

    for tid, cap0 in cap_by_tid.items():
        if fixed_weekly.get(tid, 0) > cap0["effective_weekly"]:
            return {
                "contractVersion": "1.0.0",
                "requestId": payload.get("requestId") or "",
                "solverStatus": "INFEASIBLE",
                "timing": {"wallMs": int((time.time() - t0) * 1000)},
                "entries": [],
                "report": {
                    "totalRequired": len(units) + len(fixed_rows),
                    "totalScheduled": 0,
                    "unscheduled": [],
                    "cpsat": {"orToolsVersion": ORTOOLS_VERSION, "note": "fixed_teacher_weekly_over_cap"},
                },
                "infeasibility": {
                    "summary": "Fixed slots exceed a teacher weekly capacity.",
                    "codes": ["TEACHER_CAPACITY_FIXED_CONFLICT"],
                },
            }
        for di in range(len(working_days)):
            if fixed_counts_daily.get((tid, di), 0) > cap0["effective_daily"]:
                return {
                    "contractVersion": "1.0.0",
                    "requestId": payload.get("requestId") or "",
                    "solverStatus": "INFEASIBLE",
                    "timing": {"wallMs": int((time.time() - t0) * 1000)},
                    "entries": [],
                    "report": {
                        "totalRequired": len(units) + len(fixed_rows),
                        "totalScheduled": 0,
                        "unscheduled": [],
                        "cpsat": {"orToolsVersion": ORTOOLS_VERSION, "note": "fixed_teacher_daily_over_cap"},
                    },
                    "infeasibility": {
                        "summary": "Fixed slots exceed a teacher daily capacity.",
                        "codes": ["TEACHER_CAPACITY_FIXED_CONFLICT"],
                    },
                }
            if fixed_counts_morn.get((tid, di), 0) > cap0["morning_allowed"]:
                return {
                    "contractVersion": "1.0.0",
                    "requestId": payload.get("requestId") or "",
                    "solverStatus": "INFEASIBLE",
                    "timing": {"wallMs": int((time.time() - t0) * 1000)},
                    "entries": [],
                    "report": {
                        "totalRequired": len(units) + len(fixed_rows),
                        "totalScheduled": 0,
                        "unscheduled": [],
                        "cpsat": {"orToolsVersion": ORTOOLS_VERSION, "note": "fixed_teacher_morning_over_cap"},
                    },
                    "infeasibility": {
                        "summary": "Fixed slots exceed a teacher morning capacity.",
                        "codes": ["TEACHER_CAPACITY_FIXED_CONFLICT"],
                    },
                }
            if fixed_counts_eve.get((tid, di), 0) > cap0["evening_allowed"]:
                return {
                    "contractVersion": "1.0.0",
                    "requestId": payload.get("requestId") or "",
                    "solverStatus": "INFEASIBLE",
                    "timing": {"wallMs": int((time.time() - t0) * 1000)},
                    "entries": [],
                    "report": {
                        "totalRequired": len(units) + len(fixed_rows),
                        "totalScheduled": 0,
                        "unscheduled": [],
                        "cpsat": {"orToolsVersion": ORTOOLS_VERSION, "note": "fixed_teacher_evening_over_cap"},
                    },
                    "infeasibility": {
                        "summary": "Fixed slots exceed a teacher evening capacity.",
                        "codes": ["TEACHER_CAPACITY_FIXED_CONFLICT"],
                    },
                }

    for div in divisions:
        for sub in subjects:
            if not _subject_applies(sub, div):
                continue
            _w, max_day = _division_subject_limits(sub, str(div["id"]), subject_allocations)
            for di in range(len(working_days)):
                if fixed_subject_daily.get((str(div["id"]), str(sub["id"]), di), 0) > max_day:
                    return {
                        "contractVersion": "1.0.0",
                        "requestId": payload.get("requestId") or "",
                        "solverStatus": "INFEASIBLE",
                        "timing": {"wallMs": int((time.time() - t0) * 1000)},
                        "entries": [],
                        "report": {
                            "totalRequired": len(units) + len(fixed_rows),
                            "totalScheduled": 0,
                            "unscheduled": [],
                            "cpsat": {"orToolsVersion": ORTOOLS_VERSION, "note": "fixed_subject_daily_over_cap"},
                        },
                        "infeasibility": {
                            "summary": "Fixed slots exceed subject maxPerDay for a division/day.",
                            "codes": ["SUBJECT_MAX_PER_DAY_FIXED_CONFLICT"],
                        },
                    }

    # CP-SAT
    model = cp_model.CpModel()
    _bool_id = [0]

    def _bv(prefix: str = "b") -> Any:
        _bool_id[0] += 1
        return model.NewBoolVar(f"{prefix}_{_bool_id[0]}")

    n = len(placeable_specs)
    if n == 0:
        wall_ms = int((time.time() - t0) * 1000)
        lesson_entries = list(fixed_rows)
        unscheduled = _build_unscheduled(divisions, subjects, subject_allocations, lesson_entries)
        total_required = 0
        for div in divisions:
            for sub in subjects:
                if not _subject_applies(sub, div):
                    continue
                w, _ = _division_subject_limits(sub, str(div["id"]), subject_allocations)
                total_required += int(w)
        total_scheduled = len([e for e in lesson_entries if e.get("subjectId") and e.get("teacherId") and not e.get("isFreePeriod")])
        solver_status = "PARTIAL" if unscheduled or empty_domain_units > 0 else "FEASIBLE"
        return {
            "contractVersion": "1.0.0",
            "requestId": payload.get("requestId") or "",
            "solverStatus": solver_status,
            "timing": {"wallMs": wall_ms},
            "entries": lesson_entries,
            "report": {
                "totalRequired": total_required,
                "totalScheduled": total_scheduled,
                "unscheduled": unscheduled,
                "cpsat": {
                    "orToolsVersion": ORTOOLS_VERSION,
                    "note": "no_placeable_units" if empty_domain_units else "fixed_only",
                    "emptyDomainUnits": empty_domain_units,
                },
            },
        }

    max_tidx = max(teacher_index.values()) if teacher_index else 0
    domains = [dom for _u, dom in placeable_specs]
    max_tf = max(max(row[1] for row in dom) for dom in domains)
    placed = [model.NewBoolVar(f"p{i}") for i in range(n)]
    tvars = [model.NewIntVar(0, max_tidx, f"t{i}") for i in range(n)]
    svars = [model.NewIntVar(0, max_tf, f"s{i}") for i in range(n)]

    for i in range(n):
        _u, dom = placeable_specs[i]
        model.AddAllowedAssignments([tvars[i], svars[i]], dom).OnlyEnforceIf(placed[i])

    groups: Dict[Tuple[str, str], List[int]] = {}
    for i, (u, _dom) in enumerate(placeable_specs):
        groups.setdefault((u["divisionId"], u["subjectId"]), []).append(i)
    for idxs in groups.values():
        for a in range(1, len(idxs)):
            ia, ib = idxs[0], idxs[a]
            model.Add(tvars[ia] == tvars[ib]).OnlyEnforceIf([placed[ia], placed[ib]])

    by_div: Dict[str, List[int]] = {}
    for i, (u, _dom) in enumerate(placeable_specs):
        by_div.setdefault(u["divisionId"], []).append(i)
    for idxs in by_div.values():
        for a in range(len(idxs)):
            for b in range(a + 1, len(idxs)):
                ia, ib = idxs[a], idxs[b]
                model.Add(svars[ia] != svars[ib]).OnlyEnforceIf([placed[ia], placed[ib]])

    offset = max_tf + 1
    teach_slot = []
    for i in range(n):
        ts = model.NewIntVar(0, max_tidx * offset + max_tf, f"ts{i}")
        model.Add(ts == tvars[i] * offset + svars[i])
        teach_slot.append(ts)
    for a in range(n):
        for b in range(a + 1, n):
            model.Add(teach_slot[a] != teach_slot[b]).OnlyEnforceIf([placed[a], placed[b]])

    ndays = len(working_days)
    max_slot_num = max(lesson_slot_nums) if lesson_slot_nums else 12
    day_vars: List[Any] = []
    slot_vars: List[Any] = []
    for i in range(n):
        dv = model.NewIntVar(0, max(0, ndays - 1), f"day{i}")
        sv = model.NewIntVar(0, max_slot_num, f"slot{i}")
        model.Add(svars[i] == dv * 512 + sv)
        day_vars.append(dv)
        slot_vars.append(sv)

    # maxPerDay per division+subject (legacy getDivisionSubjectLimits / canPlaceAssignment)
    for (div_id, sub_id), idxs in groups.items():
        sub = next((s for s in subjects if str(s["id"]) == str(sub_id)), None)
        if not sub:
            continue
        _weekly, max_day = _division_subject_limits(sub, str(div_id), subject_allocations)
        for di in range(ndays):
            allow_md = max_day - fixed_subject_daily.get((str(div_id), str(sub_id), di), 0)
            day_terms: List[Any] = []
            for ii in idxs:
                b = _bv()
                _reify_int_eq(model, day_vars[ii], di, b)
                bp = _bv()
                _reify_bool_and(model, bp, b, placed[ii])
                day_terms.append(bp)
            if day_terms:
                model.Add(sum(day_terms) <= allow_md)

    # Teacher capacity (matches server/engine.js getTeacherCapacity + canAssignTeacherForSlot)
    for tid, tidx in teacher_index.items():
        cap0 = cap_by_tid.get(tid) or _get_teacher_capacity({}, period_slots, working_days)
        for di in range(ndays):
            allow_d = cap0["effective_daily"] - fixed_counts_daily.get((tid, di), 0)
            allow_m = cap0["morning_allowed"] - fixed_counts_morn.get((tid, di), 0)
            allow_e = cap0["evening_allowed"] - fixed_counts_eve.get((tid, di), 0)
            daily_terms: List[Any] = []
            morn_terms: List[Any] = []
            eve_terms: List[Any] = []
            for i in range(n):
                bt = _bv()
                bd = _bv()
                bdaily = _bv()
                _reify_int_eq(model, tvars[i], tidx, bt)
                _reify_int_eq(model, day_vars[i], di, bd)
                _reify_bool_and3(model, bdaily, bt, bd, placed[i])
                daily_terms.append(bdaily)

                if cap0["morn_slot_nums"]:
                    slot_hit_m = _bv()
                    morn_z = []
                    for sn in sorted(cap0["morn_slot_nums"]):
                        if sn > max_slot_num:
                            continue
                        zm = _bv()
                        _reify_int_eq(model, slot_vars[i], int(sn), zm)
                        morn_z.append(zm)
                    if morn_z:
                        model.Add(sum(morn_z) >= 1).OnlyEnforceIf(slot_hit_m)
                        model.Add(sum(morn_z) == 0).OnlyEnforceIf(slot_hit_m.Not())
                        bm = _bv()
                        _reify_bool_and(model, bm, bdaily, slot_hit_m)
                        morn_terms.append(bm)

                if cap0["eve_slot_nums"]:
                    slot_hit_e = _bv()
                    eve_z = []
                    for sn in sorted(cap0["eve_slot_nums"]):
                        if sn > max_slot_num:
                            continue
                        ze = _bv()
                        _reify_int_eq(model, slot_vars[i], int(sn), ze)
                        eve_z.append(ze)
                    if eve_z:
                        model.Add(sum(eve_z) >= 1).OnlyEnforceIf(slot_hit_e)
                        model.Add(sum(eve_z) == 0).OnlyEnforceIf(slot_hit_e.Not())
                        be = _bv()
                        _reify_bool_and(model, be, bdaily, slot_hit_e)
                        eve_terms.append(be)

            if daily_terms:
                model.Add(sum(daily_terms) <= allow_d)
            if morn_terms:
                model.Add(sum(morn_terms) <= allow_m)
            if eve_terms:
                model.Add(sum(eve_terms) <= allow_e)

        allow_w = cap0["effective_weekly"] - fixed_weekly.get(tid, 0)
        week_terms: List[Any] = []
        for i in range(n):
            bw = _bv()
            bwk = _bv()
            _reify_int_eq(model, tvars[i], tidx, bw)
            _reify_bool_and(model, bwk, bw, placed[i])
            week_terms.append(bwk)
        if week_terms:
            model.Add(sum(week_terms) <= allow_w)

    # Continuity: max consecutive same-teacher lessons along ordered lesson slots (free slots break in legacy;
    # unfilled slots here act as breaks — same as empty in greedy division timeline).
    if lesson_slot_nums and len(lesson_slot_nums) >= 2:
        div_ids = list(by_div.keys())
        for div_id in div_ids:
            idxs_div = by_div[div_id]
            for di in range(ndays):
                for tid, tidx in teacher_index.items():
                    tch = next((x for x in teachers if str(x.get("id")) == tid), None)
                    max_combined = max(1, int((tch or {}).get("maxContinuousAnySubjectPerDivision") or 3))
                    max_same = max(1, int((tch or {}).get("maxContinuousSameSubjectPerDivision") or 2))
                    w_any = max_combined + 1
                    if w_any <= len(lesson_slot_nums):
                        for j in range(0, len(lesson_slot_nums) - w_any + 1):
                            window = lesson_slot_nums[j : j + w_any]
                            occ_terms: List[Any] = []
                            for sn in window:
                                slot_inds: List[Any] = []
                                for ii in idxs_div:
                                    bts = _bv()
                                    bds = _bv()
                                    bsl = _bv()
                                    bpl = _bv()
                                    _reify_int_eq(model, tvars[ii], tidx, bts)
                                    _reify_int_eq(model, day_vars[ii], di, bds)
                                    _reify_int_eq(model, slot_vars[ii], int(sn), bsl)
                                    _reify_bool_and(model, bpl, bts, bds)
                                    hit0 = _bv()
                                    _reify_bool_and(model, hit0, bpl, placed[ii])
                                    hit = _bv()
                                    _reify_bool_and(model, hit, hit0, bsl)
                                    slot_inds.append(hit)
                                if slot_inds:
                                    occ_sn = model.NewIntVar(0, 1, f"occ_{div_id}_{di}_{sn}_{tid}_any")
                                    model.Add(occ_sn == sum(slot_inds))
                                    occ_terms.append(occ_sn)
                            fix_ct = sum(fixed_teacher_at.get((div_id, di, int(sn), tid), 0) for sn in window)
                            if occ_terms or fix_ct:
                                vb = sum(occ_terms) if occ_terms else 0
                                model.Add(vb + fix_ct <= max_combined)
                    w_same = max_same + 1
                    if w_same <= len(lesson_slot_nums):
                        for j in range(0, len(lesson_slot_nums) - w_same + 1):
                            window = lesson_slot_nums[j : j + w_same]
                            for sub_id in {placeable_specs[ii][0]["subjectId"] for ii in idxs_div}:
                                idxs_sub = [ii for ii in idxs_div if placeable_specs[ii][0]["subjectId"] == sub_id]
                                if not idxs_sub:
                                    continue
                                occ_s: List[Any] = []
                                for sn in window:
                                    slot_inds2: List[Any] = []
                                    for ii in idxs_sub:
                                        bts = _bv()
                                        bds = _bv()
                                        bsl = _bv()
                                        bpl = _bv()
                                        _reify_int_eq(model, tvars[ii], tidx, bts)
                                        _reify_int_eq(model, day_vars[ii], di, bds)
                                        _reify_int_eq(model, slot_vars[ii], int(sn), bsl)
                                        _reify_bool_and(model, bpl, bts, bds)
                                        hit0 = _bv()
                                        _reify_bool_and(model, hit0, bpl, placed[ii])
                                        hit2 = _bv()
                                        _reify_bool_and(model, hit2, hit0, bsl)
                                        slot_inds2.append(hit2)
                                    if slot_inds2:
                                        occ_sn2 = model.NewIntVar(0, 1, f"occ_{div_id}_{di}_{sn}_{tid}_{sub_id}_same")
                                        model.Add(occ_sn2 == sum(slot_inds2))
                                        occ_s.append(occ_sn2)
                                fix_same = sum(
                                    fixed_same_at.get((div_id, di, int(sn), tid, str(sub_id)), 0) for sn in window
                                )
                                if occ_s or fix_same:
                                    vb2 = sum(occ_s) if occ_s else 0
                                    model.Add(vb2 + fix_same <= max_same)

        # Cross-division continuity: at most one division per teacher per day may have adjacent same-teacher lessons.
        if len(div_ids) > 1:
            for di in range(ndays):
                for tid, tidx in teacher_index.items():
                    div_has_pair: List[Any] = []
                    for div_id in div_ids:
                        idxs_div = by_div[div_id]
                        pair_flags: List[Any] = []
                        for j in range(len(lesson_slot_nums) - 1):
                            sn0, sn1 = lesson_slot_nums[j], lesson_slot_nums[j + 1]
                            o0_terms: List[Any] = []
                            o1_terms: List[Any] = []
                            for ii in idxs_div:
                                for sn, bucket in ((sn0, o0_terms), (sn1, o1_terms)):
                                    bts = _bv()
                                    bds = _bv()
                                    bsl = _bv()
                                    bpl = _bv()
                                    _reify_int_eq(model, tvars[ii], tidx, bts)
                                    _reify_int_eq(model, day_vars[ii], di, bds)
                                    _reify_int_eq(model, slot_vars[ii], int(sn), bsl)
                                    _reify_bool_and(model, bpl, bts, bds)
                                    hx0 = _bv()
                                    _reify_bool_and(model, hx0, bpl, placed[ii])
                                    hx = _bv()
                                    _reify_bool_and(model, hx, hx0, bsl)
                                    bucket.append(hx)
                            f0 = fixed_teacher_at.get((div_id, di, int(sn0), tid), 0)
                            f1 = fixed_teacher_at.get((div_id, di, int(sn1), tid), 0)
                            if not o0_terms and not o1_terms and f0 == 0 and f1 == 0:
                                continue
                            o0 = model.NewIntVar(0, 1, f"o0_{div_id}_{di}_{tid}_{j}")
                            o1 = model.NewIntVar(0, 1, f"o1_{div_id}_{di}_{tid}_{j}")
                            s0 = sum(o0_terms) if o0_terms else 0
                            s1 = sum(o1_terms) if o1_terms else 0
                            model.Add(o0 == s0 + f0)
                            model.Add(o1 == s1 + f1)
                            pair_b = _bv()
                            model.AddMinEquality(pair_b, [o0, o1])
                            pair_flags.append(pair_b)
                        if pair_flags:
                            has_any = _bv()
                            model.AddMaxEquality(has_any, pair_flags)
                            div_has_pair.append(has_any)
                    if len(div_has_pair) > 1:
                        model.Add(sum(div_has_pair) <= 1)

    def _fixed_teacher_slot_occ(tid: str, di: int, sn: int) -> int:
        if di < 0 or di >= len(working_days):
            return 0
        day = working_days[di]
        for fr in fixed_rows:
            if str(fr.get("teacherId")) == tid and str(fr.get("dayOfWeek")) == day and int(fr.get("slotNumber", -1)) == int(sn):
                return 1
        return 0

    # Secondary objective: minimize proxy for teacher timetable fragmentation (adjacent lesson-slot churn).
    frag_edges: List[Any] = []
    if lesson_slot_nums and len(lesson_slot_nums) >= 2:
        for tid, tidx in teacher_index.items():
            for di in range(ndays):
                for j in range(len(lesson_slot_nums) - 1):
                    sn0, sn1 = int(lesson_slot_nums[j]), int(lesson_slot_nums[j + 1])
                    hits0: List[Any] = []
                    hits1: List[Any] = []
                    for i in range(n):
                        for sn, bucket in ((sn0, hits0), (sn1, hits1)):
                            bts = _bv()
                            bds = _bv()
                            bsl = _bv()
                            bpl = _bv()
                            _reify_int_eq(model, tvars[i], tidx, bts)
                            _reify_int_eq(model, day_vars[i], di, bds)
                            _reify_int_eq(model, slot_vars[i], int(sn), bsl)
                            _reify_bool_and(model, bpl, bts, bds)
                            hx0 = _bv()
                            _reify_bool_and(model, hx0, bpl, placed[i])
                            hx = _bv()
                            _reify_bool_and(model, hx, hx0, bsl)
                            bucket.append(hx)
                    fix0 = _fixed_teacher_slot_occ(tid, di, sn0)
                    fix1 = _fixed_teacher_slot_occ(tid, di, sn1)
                    occ0 = model.NewIntVar(0, 1, f"fragocc0_{tid}_{di}_{j}")
                    occ1 = model.NewIntVar(0, 1, f"fragocc1_{tid}_{di}_{j}")
                    if hits0:
                        model.Add(occ0 == sum(hits0) + fix0)
                    else:
                        model.Add(occ0 == fix0)
                    if hits1:
                        model.Add(occ1 == sum(hits1) + fix1)
                    else:
                        model.Add(occ1 == fix1)
                    model.Add(occ0 <= 1)
                    model.Add(occ1 <= 1)
                    edge = model.NewBoolVar(f"fragedge_{tid}_{di}_{j}")
                    model.Add(edge >= occ0 - occ1)
                    model.Add(edge >= occ1 - occ0)
                    model.Add(edge <= occ0 + occ1)
                    model.Add(edge <= 2 - occ0 - occ1)
                    frag_edges.append(edge)

    place_weights = [max(1, int(placeable_specs[i][0].get("demandWeight") or 1)) for i in range(n)]
    primary_obj = sum(placed[i] * place_weights[i] for i in range(n))
    if frag_edges:
        model.Maximize(primary_obj * 1000 - sum(frag_edges))
    else:
        model.Maximize(primary_obj)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = max(1.0, time_limit)
    solver.parameters.num_search_workers = 8
    rs = int(options.get("randomSeed") or 1)
    solver.parameters.random_seed = rs
    st = solver.Solve(model)
    wall_ms = int((time.time() - t0) * 1000)
    solve_ms = int(max(0.0, solver.WallTime()) * 1000)

    if st not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {
            "contractVersion": "1.0.0",
            "requestId": payload.get("requestId") or "",
            "solverStatus": "INFEASIBLE",
            "timing": {"wallMs": wall_ms, "solveMs": solve_ms},
            "entries": [],
            "report": {
                "totalRequired": len(units) + len(fixed_rows),
                "totalScheduled": 0,
                "unscheduled": [],
                "cpsat": {
                    "orToolsVersion": ORTOOLS_VERSION,
                    "cpSatStatus": str(st),
                    "solverStatus": "INFEASIBLE",
                    "demandSummary": {
                        "placedCount": 0,
                        "totalCount": len(units) + len(fixed_rows),
                        "placedWeight": 0,
                        "totalWeight": 0,
                        "unplacedDemands": [],
                    },
                    "objectives": {
                        "profile": str(options.get("objectiveProfile") or ""),
                        "primary": "MAX_WEIGHTED_DEMAND_FULL_COVERAGE",
                        "placedDemandWeight": 0,
                        "secondary": "MIN_TEACHER_DAY_FRAGMENTATION_PROXY",
                        "secondaryPenalty": None,
                    },
                },
            },
        }

    inv_teacher = {v: k for k, v in teacher_index.items()}
    lesson_entries = list(fixed_rows)
    placed_unit_count = 0
    for i, (u, _dom) in enumerate(placeable_specs):
        if not solver.Value(placed[i]):
            continue
        placed_unit_count += 1
        tf = int(solver.Value(svars[i]))
        tid = inv_teacher[int(solver.Value(tvars[i]))]
        day, sn = _decode_time_flat(working_days, tf)
        lesson_entries.append(
            {
                "divisionId": u["divisionId"],
                "teacherId": tid,
                "subjectId": u["subjectId"],
                "dayOfWeek": day,
                "slotNumber": sn,
                "isDouble": False,
                "isFreePeriod": False,
                "slotType": "LESSON",
            }
        )

    total_required = 0
    total_demand_weight = 0
    for div in divisions:
        for sub in subjects:
            if not _subject_applies(sub, div):
                continue
            w, _ = _division_subject_limits(sub, str(div["id"]), subject_allocations)
            total_required += int(w)
            total_demand_weight += int(w) * max(1, int(sub.get("priorityWeight") or 1))

    total_scheduled = len([e for e in lesson_entries if e.get("subjectId") and e.get("teacherId") and not e.get("isFreePeriod")])

    placed_demand_weight = sum(
        max(1, int(placeable_specs[i][0].get("demandWeight") or 1)) for i in range(n) if solver.Value(placed[i])
    )
    for fr in fixed_rows:
        sub0 = next((s for s in subjects if str(s["id"]) == str(fr.get("subjectId"))), None)
        if sub0:
            placed_demand_weight += max(1, int(sub0.get("priorityWeight") or 1))

    unscheduled = _build_unscheduled(divisions, subjects, subject_allocations, lesson_entries)
    sec_pen = int(round(solver.ObjectiveValue()))
    obj_profile = str(options.get("objectiveProfile") or "MAX_WEIGHTED_DEMAND_PARTIAL")
    if obj_profile in ("FULL_DEMAND_THEN_MIN_FRAGMENTATION", "MAX_SCHEDULED_THEN_MIN_SOFT"):
        obj_profile = "MAX_WEIGHTED_DEMAND_PARTIAL"

    cp_sat_status = "OPTIMAL" if st == cp_model.OPTIMAL else "FEASIBLE"
    solver_status = "FEASIBLE" if not unscheduled and empty_domain_units == 0 and placed_unit_count == n else "PARTIAL"

    return {
        "contractVersion": "1.0.0",
        "requestId": payload.get("requestId") or "",
        "solverStatus": solver_status,
        "timing": {"wallMs": wall_ms, "solveMs": solve_ms},
        "entries": lesson_entries,
        "report": {
            "totalRequired": total_required,
            "totalScheduled": total_scheduled,
            "unscheduled": unscheduled,
            "cpsat": {
                "orToolsVersion": ORTOOLS_VERSION,
                "objectiveValue": sec_pen,
                "cpSatStatus": cp_sat_status,
                "solverStatus": solver_status,
                "demandSummary": {
                    "placedCount": total_scheduled,
                    "totalCount": total_required,
                    "placedWeight": placed_demand_weight,
                    "totalWeight": total_demand_weight,
                    "unplacedDemands": [],
                },
                "objectives": {
                    "profile": obj_profile,
                    "primary": "MAX_WEIGHTED_DEMAND_FULL_COVERAGE",
                    "placedDemandWeight": placed_demand_weight,
                    "secondary": "MIN_TEACHER_DAY_FRAGMENTATION_PROXY",
                    "secondaryPenalty": sec_pen,
                },
            },
        },
    }


class _Handler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: Any) -> None:  # noqa: A003
        return

    def do_GET(self) -> None:  # noqa: N802
        if self.path in ("/health", "/health/"):
            body = json.dumps({"ok": True, "service": "schooltime-cpsat"}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(404)
        self.end_headers()

    def do_POST(self) -> None:  # noqa: N802
        if self.path not in ("/solve", "/solve/"):
            self.send_response(404)
            self.end_headers()
            return
        secret = ""
        # Optional shared secret: Authorization: Bearer <token>
        auth = self.headers.get("Authorization") or ""
        if auth.lower().startswith("bearer "):
            secret = auth[7:].strip()
        expected = os.environ.get("CP_SAT_SOLVER_SECRET", "").strip()
        if expected and secret != expected:
            self.send_response(401)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "unauthorized"}).encode())
            return
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length)
        try:
            body = json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "invalid_json"}).encode())
            return
        out = solve_request(body)
        data = json.dumps(out).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("PORT", "8790"))
    if port <= 0 or port > 65535:
        port = 8790
    host = (os.environ.get("HOST") or os.environ.get("CP_SAT_BIND_HOST") or "0.0.0.0").strip() or "0.0.0.0"
    secret = (sys.argv[2] if len(sys.argv) > 2 else "").strip()
    if secret:
        os.environ["CP_SAT_SOLVER_SECRET"] = secret
    httpd = HTTPServer((host, port), _Handler)
    print(f"CP-SAT sidecar listening on http://{host}:{port}/solve", flush=True)
    httpd.serve_forever()


if __name__ == "__main__":
    main()
