/**
 * Pure 13-section internal audit report builder. No database, no network, no AI model.
 * Text comes from templates filled only with input data; a missing required field renders
 * NOT_PROVIDED and is recorded in gaps[]. Reuses reports.ts (rating, counts) and iron-rules.ts
 * (severity cap, lint, variance pair, masking). Tests: scripts/test-report13.ts.
 */
import type { ActionFact, BriefInput, FindingFact, TestFact } from "@/lib/reports";
import { countBands, recommendedRating } from "@/lib/reports";
import { SEVERITY_CAP_FLAG, lintText, maskRestricted, severityCap, variancePair } from "@/lib/iron-rules";

export const NOT_PROVIDED = "[Not provided – required before issue]";

export const SECTION_TITLES = [
  "Executive Summary",
  "Background",
  "Scope and Objectives",
  "Methodology",
  "Detailed Findings",
  "Risk and Impact",
  "Root Cause",
  "Control Gap Assessment",
  "Recommendation",
  "Management Response",
  "Agreed Action Plan",
  "Timeline and Accountability",
  "Conclusion",
] as const;

export type R13Finding = Pick<FindingFact, "id" | "code" | "title" | "priorityBand" | "priorityScore"> & {
  condition: string;
  criteria: string;
  cause: string;
  effect: string;
  recommendation: string;
  owner: string;
  dueDate: string;
  evidenceTags: string[];
  workpaperRef: string;
  /** Optional category used to group causes in section 7. */
  rootCauseClass?: string;
  /** Optional amounts; net and gross absolute variance are both shown. */
  amounts?: { label?: string; expected: number; actual: number }[];
  currency?: string;
  managementResponse?: string;
};
export type R13Test = Pick<TestFact, "id" | "procedure" | "result" | "populationCount" | "recordsTested" | "exceptionsCount" | "limitations"> & {
  evidenceTags: string[];
};
export type R13Risk = { id: string; findingCode: string; name: string; rating?: string };
export type R13Control = { id: string; findingCode: string; name: string; design: string; operating: string };

export type Report13Input = Omit<BriefInput, "findings" | "actions" | "tests"> & {
  findings: R13Finding[];
  actions: ActionFact[];
  tests: R13Test[];
  risks: R13Risk[];
  controls: R13Control[];
  /** Optional pre-written summary figures. Used as given, so the gate can test them against the detail. */
  summaryCounts?: Record<string, number>;
};
export type Report13Options = { globalRestrictedTerms?: Iterable<string> };

export type R13Table = { headers: string[]; rows: string[][] };
export type R13Section = { number: number; title: string; paragraphs: string[]; tables?: R13Table[] };
export type R13Gap = { section: number; field: string };
export type Report13 = {
  sections: R13Section[];
  gaps: R13Gap[];
  rating: string;
  counts: Record<string, number>;
  cappedCodes: string[];
};
export type ReleaseGate = { blocking: string[]; warnings: string[] };

const BANDS = ["Critical", "High", "Medium", "Low", "Unscored"];
const RANK: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1, Unscored: 0 };
const LIMITATION =
  "Conclusions rest on the evidence classes and the coverage stated in section 4. What was not tested is listed there, and further evidence could change a conclusion. Confidence is not expressed as a percentage.";

type Capped = R13Finding & { band: string; capped: boolean };
const asFacts = (fs: Capped[]) => fs.map((f) => ({ ...f, priorityBand: f.band })) as unknown as FindingFact[];
const blank = (v: unknown) => v === undefined || v === null || String(v).trim() === "";

function capAll(findings: R13Finding[]): Capped[] {
  return findings.map((f) => {
    const c = severityCap(f.priorityBand, f.evidenceTags || []);
    return { ...f, band: c.severity, capped: c.capped };
  });
}
function sevLabel(f: Capped) {
  return f.capped ? `${f.band} (${SEVERITY_CAP_FLAG})` : f.band;
}
function sortTop(fs: Capped[]) {
  return [...fs].sort((a, b) => (RANK[b.band] ?? 0) - (RANK[a.band] ?? 0) || b.priorityScore - a.priorityScore);
}
const money = (n: number, cur?: string) => `${cur ? cur + " " : ""}${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export function buildReport13(input: Report13Input, opts: Report13Options = {}): Report13 {
  const gaps: R13Gap[] = [];
  const seen = new Set<string>();
  const fld = (section: number, field: string, value: unknown): string => {
    if (!blank(value)) return String(value).trim();
    if (!seen.has(`${section}|${field}`)) {
      seen.add(`${section}|${field}`);
      gaps.push({ section, field });
    }
    return NOT_PROVIDED;
  };

  const fs = capAll(input.findings);
  const counts = countBands(asFacts(fs));
  const rating = recommendedRating(asFacts(fs));
  const top = sortTop(fs).slice(0, 5);
  const actionOf = (f: Capped) => input.actions.find((a) => a.findingId === f.id);
  const refs = (f: Capped) => `${f.code}`;

  // 1 Executive Summary
  const entity = fld(1, "entity", input.entityName);
  const period = fld(1, "period", input.period);
  const shown = input.summaryCounts ?? counts;
  const es: R13Section = {
    number: 1,
    title: SECTION_TITLES[0],
    paragraphs: [
      `This report covers ${entity} for ${period}. ${fs.length} finding${fs.length === 1 ? " is" : "s are"} recorded.`,
      `Overall rating, taken from the highest finding band after the severity cap: ${rating}.`,
      fs.some((f) => f.capped)
        ? `Findings with only management-reported or auditor-analysis evidence are held at High and marked ${SEVERITY_CAP_FLAG}: ${fs.filter((f) => f.capped).map(refs).join(", ")}.`
        : "No finding has been held back by the severity cap.",
    ],
    tables: [
      { headers: ["Band", "Findings"], rows: BANDS.map((b) => [b, String(shown[b] ?? 0)]) },
      {
        headers: ["Ref", "Finding", "Severity", "Score"],
        rows: top.map((f) => [refs(f), f.title, sevLabel(f), String(f.priorityScore)]),
      },
    ],
  };

  // 2 Background
  const bg: R13Section = {
    number: 2,
    title: SECTION_TITLES[1],
    paragraphs: [fld(2, "background", input.businessContext), `Entity: ${fld(2, "entity", input.entityName)}. Period: ${fld(2, "period", input.period)}.`],
  };

  // 3 Scope and Objectives
  const sc: R13Section = {
    number: 3,
    title: SECTION_TITLES[2],
    paragraphs: [`Objectives: ${fld(3, "objectives", input.objective)}`, `Scope: ${fld(3, "scope", input.scope)}`],
  };

  // 4 Methodology
  const mt: R13Section = {
    number: 4,
    title: SECTION_TITLES[3],
    paragraphs: [
      input.tests.length
        ? `${input.tests.length} test${input.tests.length === 1 ? " was" : "s were"} run. Evidence tags: INS inspection, PHY physical, CON third-party confirmation, REP reported by management, REC reperformance, OBS observation, ANA auditor analysis.`
        : `Tests and procedures: ${fld(4, "tests", "")}`,
      `Limitations: ${fld(4, "limitations", input.limitations)}`,
    ],
    tables: input.tests.length
      ? [
          {
            headers: ["Test", "Procedure", "Population", "Sample", "Exceptions", "Evidence", "Result"],
            rows: input.tests.map((t) => [
              t.id,
              fld(4, `${t.id}.procedure`, t.procedure),
              String(t.populationCount),
              String(t.recordsTested),
              String(t.exceptionsCount),
              fld(4, `${t.id}.evidenceTags`, (t.evidenceTags || []).join(", ")),
              fld(4, `${t.id}.result`, t.result),
            ]),
          },
        ]
      : undefined,
  };

  // 5 Detailed Findings
  const dfParas: string[] = [];
  for (const f of fs) {
    dfParas.push(`${f.code} ${f.title} (${sevLabel(f)}).`);
    dfParas.push(`${f.code} Condition: ${fld(5, `${f.code}.condition`, f.condition)}`);
    dfParas.push(`${f.code} Criteria: ${fld(5, `${f.code}.criteria`, f.criteria)}`);
    dfParas.push(`${f.code} Cause: ${fld(5, `${f.code}.cause`, f.cause)}`);
    dfParas.push(`${f.code} Effect: ${fld(5, `${f.code}.effect`, f.effect)}`);
    dfParas.push(`${f.code} Recommendation: ${fld(5, `${f.code}.recommendation`, f.recommendation)}`);
    if (f.amounts?.length) {
      const v = variancePair(f.amounts);
      dfParas.push(
        `${f.code} Variance: net ${money(v.net, f.currency)}, gross absolute ${money(v.grossAbsolute, f.currency)} over ${v.rows} line${v.rows === 1 ? "" : "s"}.${v.offsetting ? " Offsetting differences are present, so net alone understates the error." : ""}`,
      );
    }
  }
  const df: R13Section = {
    number: 5,
    title: SECTION_TITLES[4],
    paragraphs: fs.length ? dfParas : ["No finding is recorded."],
    tables: [
      {
        headers: ["Ref", "Title", "Severity", "Evidence", "Workpaper"],
        rows: fs.map((f) => [
          refs(f),
          f.title,
          sevLabel(f),
          fld(5, `${f.code}.evidenceTags`, (f.evidenceTags || []).map((t) => `[${t.replace(/[\[\]]/g, "")}]`).join(" ")),
          fld(5, `${f.code}.workpaperRef`, f.workpaperRef),
        ]),
      },
    ],
  };

  // 6 Risk and Impact
  const rk: R13Section = {
    number: 6,
    title: SECTION_TITLES[5],
    paragraphs: input.risks.length ? ["Linked enterprise risks and the stated effect of each finding."] : [`Linked risks: ${fld(6, "risks", "")}`],
    tables: [
      {
        headers: ["Ref", "Risk", "Risk rating", "Effect"],
        rows: input.risks.map((r) => {
          const f = fs.find((x) => x.code === r.findingCode);
          return [r.findingCode, r.name, r.rating || "Not rated", f ? fld(6, `${f.code}.effect`, f.effect) : NOT_PROVIDED];
        }),
      },
    ],
  };

  // 7 Root Cause
  const groups = new Map<string, Capped[]>();
  fs.forEach((f) => {
    const k = blank(f.rootCauseClass) ? "Uncategorised" : f.rootCauseClass!.trim();
    groups.set(k, [...(groups.get(k) || []), f]);
  });
  const rc: R13Section = {
    number: 7,
    title: SECTION_TITLES[6],
    paragraphs: fs.length
      ? [...groups].map(([k, list]) => `${k}: ${list.map((f) => `${f.code} ${fld(7, `${f.code}.cause`, f.cause)}`).join(" ")}`)
      : ["No finding is recorded."],
  };

  // 8 Control Gap Assessment
  const cg: R13Section = {
    number: 8,
    title: SECTION_TITLES[7],
    paragraphs: input.controls.length ? ["Linked controls with the design and operating result."] : [`Linked controls: ${fld(8, "controls", "")}`],
    tables: [
      {
        headers: ["Ref", "Control", "Design", "Operating"],
        rows: input.controls.map((c) => [
          c.findingCode,
          c.name,
          fld(8, `${c.id}.design`, c.design),
          fld(8, `${c.id}.operating`, c.operating),
        ]),
      },
    ],
  };

  // 9 Recommendation
  const rec: R13Section = {
    number: 9,
    title: SECTION_TITLES[8],
    paragraphs: fs.length ? ["Each recommendation has a named owner and a due date."] : ["No finding is recorded."],
    tables: [
      {
        headers: ["Ref", "Recommendation", "Owner", "Due"],
        rows: fs.map((f) => [
          refs(f),
          fld(9, `${f.code}.recommendation`, f.recommendation),
          fld(9, `${f.code}.owner`, f.owner),
          fld(9, `${f.code}.dueDate`, f.dueDate),
        ]),
      },
    ],
  };

  // 10 Management Response
  const mr: R13Section = {
    number: 10,
    title: SECTION_TITLES[9],
    paragraphs: fs.length
      ? fs.map((f) => `${f.code}: ${fld(10, `${f.code}.managementResponse`, f.managementResponse)}`)
      : ["No finding is recorded."],
  };

  // 11 Agreed Action Plan
  const ap: R13Section = {
    number: 11,
    title: SECTION_TITLES[10],
    paragraphs: fs.length ? ["Actions agreed with management."] : ["No finding is recorded."],
    tables: [
      {
        headers: ["Ref", "Agreed action", "Owner", "Due", "Status"],
        rows: fs.map((f) => {
          const a = actionOf(f);
          return [
            refs(f),
            fld(11, `${f.code}.action`, a?.agreedAction),
            fld(11, `${f.code}.actionOwner`, a?.ownerName),
            fld(11, `${f.code}.actionDue`, a ? a.revisedDue || a.originalDue : ""),
            a?.status || "Not recorded",
          ];
        }),
      },
    ],
  };

  // 12 Timeline and Accountability
  const tl: R13Section = {
    number: 12,
    title: SECTION_TITLES[11],
    paragraphs: ["Accountability follows the owner named for each recommendation. Dates are as recorded on the file."],
    tables: [
      {
        headers: ["Ref", "Owner", "Recommendation due", "Action due"],
        rows: fs.map((f) => {
          const a = actionOf(f);
          return [refs(f), fld(12, `${f.code}.owner`, f.owner), fld(12, `${f.code}.dueDate`, f.dueDate), a ? a.revisedDue || a.originalDue || NOT_PROVIDED : NOT_PROVIDED];
        }),
      },
    ],
  };

  // 13 Conclusion
  const cn: R13Section = {
    number: 13,
    title: SECTION_TITLES[12],
    paragraphs: [`Overall rating: ${rating}. ${input.opinion ? input.opinion : ""}`.trim(), LIMITATION, ...(input.limitations ? [`Engagement limitation: ${input.limitations}`] : [])],
  };

  let sections = [es, bg, sc, mt, df, rk, rc, cg, rec, mr, ap, tl, cn];
  const terms = opts.globalRestrictedTerms ? [...opts.globalRestrictedTerms] : [];
  if (terms.length) {
    const m = (s: string) => maskRestricted(s, terms);
    sections = sections.map((s) => ({
      ...s,
      title: m(s.title),
      paragraphs: s.paragraphs.map(m),
      tables: s.tables?.map((t) => ({ headers: t.headers.map(m), rows: t.rows.map((r) => r.map(m)) })),
    }));
  }
  return { sections, gaps, rating, counts, cappedCodes: fs.filter((f) => f.capped).map((f) => f.code) };
}

// ---------------------------------------------------------------------------------------------
// Board / Chairman note
// ---------------------------------------------------------------------------------------------

export type BoardBrief = { title: string; rating: string; paragraphs: string[]; topFindings: string[]; asks: string[]; limitations: string[]; text: string };

export function boardBrief(input: Report13Input, opts: Report13Options = {}): BoardBrief {
  const fs = capAll(input.findings);
  const rating = recommendedRating(asFacts(fs));
  const top = sortTop(fs).slice(0, 5);
  const topFindings = top.map((f) => `${f.code} ${f.title}: ${sevLabel(f)}. ${blank(f.effect) ? NOT_PROVIDED : f.effect}`);
  const asks = top.map((f) => {
    const a = input.actions.find((x) => x.findingId === f.id);
    return `Confirm that ${blank(f.owner) ? NOT_PROVIDED : f.owner} will deliver the action for ${f.code} by ${blank(f.dueDate) ? NOT_PROVIDED : f.dueDate}${a ? ` (status: ${a.status})` : ""}.`;
  });
  const limitations = [LIMITATION, ...(input.limitations ? [input.limitations] : [])];
  const paragraphs = [
    `${blank(input.entityName) ? NOT_PROVIDED : input.entityName}, ${blank(input.period) ? NOT_PROVIDED : input.period}. Overall rating: ${rating}.`,
  ];
  const mask = (s: string) => (opts.globalRestrictedTerms ? maskRestricted(s, opts.globalRestrictedTerms) : s);
  const out = { paragraphs: paragraphs.map(mask), topFindings: topFindings.map(mask), asks: asks.map(mask), limitations: limitations.map(mask) };
  const title = mask("Board note");
  const text = [title, ...out.paragraphs, "Top findings:", ...out.topFindings, "Decisions or asks:", ...out.asks, "Limitations:", ...out.limitations].join("\n");
  return { title, rating, ...out, text };
}

// ---------------------------------------------------------------------------------------------
// Release gate
// ---------------------------------------------------------------------------------------------

const JARGON = ["leverage", "synergy", "synergies", "paradigm", "holistic", "utilise", "utilize", "robust", "mitigate", "best-in-class", "going forward"];
const MEASURABLE = /\d|\b(?:implement|reconcile|review|approve|complete)\w*\s+\S+/i;

function allText(report: Report13): string[] {
  return report.sections.flatMap((s) => [s.title, ...s.paragraphs, ...(s.tables || []).flatMap((t) => [...t.headers, ...t.rows.flat()])]);
}

export function releaseGate(report: Report13, input: Report13Input): ReleaseGate {
  const blocking: string[] = [];
  const warnings: string[] = [];
  report.gaps.forEach((g) => blocking.push(`GAP: section ${g.section}, field ${g.field}`));

  const texts = allText(report);
  const seenLint = new Set<string>();
  texts.forEach((t) =>
    lintText(t).forEach((h) => {
      const key = `${h.rule}|${h.term}|${h.excerpt}`;
      if (!seenLint.has(key)) {
        seenLint.add(key);
        blocking.push(`LINT (${h.rule}): "${h.term}" in "${h.excerpt}"`);
      }
    }),
  );

  for (const f of input.findings) {
    if (blank(f.recommendation)) continue;
    if (blank(f.owner)) blocking.push(`RECOMMENDATION: ${f.code} has no owner`);
    if (blank(f.dueDate)) blocking.push(`RECOMMENDATION: ${f.code} has no due date`);
    if (!MEASURABLE.test(f.recommendation)) blocking.push(`RECOMMENDATION: ${f.code} has no measurable element`);
  }

  // Summary ties to detail.
  const sec1 = report.sections[0].tables?.[0];
  const sec5 = report.sections[4].tables?.[0];
  if (sec1 && sec5) {
    const detail: Record<string, number> = {};
    sec5.rows.forEach((r) => {
      const band = r[2].split(" (")[0];
      detail[band] = (detail[band] || 0) + 1;
    });
    sec1.rows.forEach(([band, n]) => {
      if (Number(n) !== (detail[band] || 0)) blocking.push(`SUMMARY-TIE: summary shows ${n} ${band}, findings detail shows ${detail[band] || 0}`);
    });
  }

  // A capped finding must not read Critical anywhere it is referenced.
  const capped = capAllCodes(input);
  capped.forEach((code) => {
    const hit = texts.find((t) => t.includes(code) && /\bcritical\b/i.test(t));
    if (hit) blocking.push(`CAPPED-CRITICAL: ${code} is capped but reads Critical in "${hit.slice(0, 80)}"`);
  });

  texts.forEach((t) => {
    t.split(/(?<=[.!?])\s+/).forEach((s) => {
      const n = s.trim().split(/\s+/).filter(Boolean).length;
      if (n > 30) warnings.push(`PLAIN-LANGUAGE: ${n}-word sentence "${s.slice(0, 60)}..."`);
    });
    JARGON.filter((j) => new RegExp(`\\b${j}`, "i").test(t)).forEach((j) => warnings.push(`PLAIN-LANGUAGE: jargon "${j}" in "${t.slice(0, 60)}"`));
  });
  return { blocking, warnings: [...new Set(warnings)] };
}

function capAllCodes(input: Report13Input): string[] {
  return capAll(input.findings).filter((f) => f.capped).map((f) => f.code);
}
