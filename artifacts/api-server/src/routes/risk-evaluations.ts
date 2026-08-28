import { Router, type IRouter } from "express";
import { desc, eq, sql } from "drizzle-orm";
import {
  CreateRiskEvaluationBody,
  CreateRiskEvaluationResponse,
  GetRiskEvaluationSummaryResponse,
  ListRiskEvaluationsQueryParams,
  ListRiskEvaluationsResponse,
} from "@workspace/api-zod";
import {
  db,
  riskAuditEventsTable,
  riskEvaluationsTable,
} from "@workspace/db";

const router: IRouter = Router();
const INTERCEPT_THRESHOLD = 80;
const ANALYSIS_VERSION = "risk-engine-0.1";

type Analysis = {
  riskScore: number;
  riskLevel: "critical" | "high" | "moderate" | "low";
  decision: "INTERCEPT" | "ALLOW";
  rationale: string;
  findings: string[];
  provider: string;
  model: string;
};

const riskSignals: Array<{
  expression: RegExp;
  weight: number;
  finding: string;
}> = [
  {
    expression: /\bunlimited\b|\buncapped\b|\bwithout limitation\b/i,
    weight: 32,
    finding: "Potentially unlimited exposure or an uncapped obligation.",
  },
  {
    expression: /\bindemnif(y|ication|ies)\b/i,
    weight: 20,
    finding: "Indemnity language may shift third-party claims or defense costs.",
  },
  {
    expression: /\bsole discretion\b|\babsolute discretion\b/i,
    weight: 18,
    finding: "One-sided discretion may allow a party to change outcomes without a reciprocal control.",
  },
  {
    expression: /\bwaive\b|\bwaiver\b|\bwaived\b/i,
    weight: 16,
    finding: "Waiver language may remove a meaningful right or remedy.",
  },
  {
    expression: /\bperpetual\b|\birrevocable\b|\bin perpetuity\b/i,
    weight: 22,
    finding: "The obligation may continue indefinitely or be difficult to unwind.",
  },
  {
    expression: /\bautomatically renew\b|\bauto[- ]renew\b/i,
    weight: 12,
    finding: "Automatic renewal can create an overlooked continuing commitment.",
  },
  {
    expression: /\bterminate at any time\b|\bterminate immediately\b/i,
    weight: 13,
    finding: "Termination rights may be materially asymmetric or operationally disruptive.",
  },
  {
    expression: /\bgoverning law\b|\bjurisdiction\b|\bvenue\b/i,
    weight: 7,
    finding: "Choice-of-law or forum language should be checked against the intended deal structure.",
  },
  {
    expression: /\bpersonal data\b|\bpersonal information\b|\bdata breach\b|\bsecurity incident\b/i,
    weight: 9,
    finding: "Privacy or security obligations may require additional controls and notice commitments.",
  },
];

function analyzeClause(clauseText: string): Analysis {
  const matches = riskSignals.filter(({ expression }) =>
    expression.test(clauseText),
  );
  const lengthAdjustment = Math.min(10, Math.floor(clauseText.length / 700));
  const score = Math.min(
    100,
    Math.max(
      0,
      8 + lengthAdjustment + matches.reduce((total, signal) => total + signal.weight, 0),
    ),
  );
  const decision = score >= INTERCEPT_THRESHOLD ? "INTERCEPT" : "ALLOW";
  const riskLevel =
    score >= 80 ? "critical" : score >= 60 ? "high" : score >= 30 ? "moderate" : "low";
  const findings = matches.length
    ? matches.map(({ finding }) => finding)
    : ["No configured high-signal risk patterns were detected in this clause."];

  return {
    riskScore: score,
    decision,
    riskLevel,
    findings,
    rationale:
      decision === "INTERCEPT"
        ? `The clause reached ${score}/100, meeting the ${INTERCEPT_THRESHOLD}-point interception threshold. Human legal review is required before this clause proceeds.`
        : `The clause scored ${score}/100, below the ${INTERCEPT_THRESHOLD}-point interception threshold. Continue with normal legal and policy review. This result is not a determination that the clause is legally safe.`,
    provider: "local-adapter",
    model: "demo-risk-engine",
  };
}

/**
 * Provider seam for the user's Claude implementation.
 * Set RISK_ANALYZER_MODE=claude and replace this function with the Claude
 * request using the user's preferred API client and response schema.
 */
function runConfiguredAnalyzer(clauseText: string): Analysis {
  const mode = process.env.RISK_ANALYZER_MODE ?? "demo";
  if (mode === "demo") return analyzeClause(clauseText);
  throw new Error(
    "Claude analyzer mode is selected but no provider adapter is installed. Set RISK_ANALYZER_MODE=demo for the preview or implement the Claude adapter.",
  );
}

function toEvaluation(
  row: typeof riskEvaluationsTable.$inferSelect,
  audit: typeof riskAuditEventsTable.$inferSelect | null,
) {
  return {
    id: row.id,
    clauseText: row.clauseText,
    sourceName: row.sourceName,
    riskScore: row.riskScore,
    decision: row.decision as "INTERCEPT" | "ALLOW",
    riskLevel: row.riskLevel as "critical" | "high" | "moderate" | "low",
    rationale: row.rationale,
    findings: row.findings,
    provider: row.provider,
    model: row.model,
    analysisVersion: row.analysisVersion,
    createdAt: row.createdAt.toISOString(),
    audit: {
      auditId: audit?.id ?? "unavailable",
      eventType: "CLAUSE_SCREENED" as const,
      decision: audit?.decision as "INTERCEPT" | "ALLOW" ?? row.decision as "INTERCEPT" | "ALLOW",
      threshold: audit?.threshold ?? INTERCEPT_THRESHOLD,
      recordedAt: (audit?.recordedAt ?? row.createdAt).toISOString(),
      actor: audit?.actor ?? "system",
    },
  };
}

router.get("/risk-evaluations", async (req, res) => {
  const parsed = ListRiskEvaluationsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid list parameters." });
    return;
  }

  const rows = await db
    .select({
      evaluation: riskEvaluationsTable,
      audit: riskAuditEventsTable,
    })
    .from(riskEvaluationsTable)
    .leftJoin(
      riskAuditEventsTable,
      eq(riskAuditEventsTable.evaluationId, riskEvaluationsTable.id),
    )
    .orderBy(desc(riskEvaluationsTable.createdAt))
    .limit(parsed.data.limit);

  const response = ListRiskEvaluationsResponse.parse(
    rows.map(({ evaluation, audit }) => toEvaluation(evaluation, audit)),
  );
  res.json(response);
});

router.post("/risk-evaluations", async (req, res) => {
  const parsed = CreateRiskEvaluationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Clause text must be between 10 and 50,000 characters.",
    });
    return;
  }

  try {
    const analysis = runConfiguredAnalyzer(parsed.data.clauseText);
    const created = await db.transaction(async (tx) => {
      const [evaluation] = await tx
        .insert(riskEvaluationsTable)
        .values({
          clauseText: parsed.data.clauseText,
          sourceName: parsed.data.sourceName ?? null,
          riskScore: analysis.riskScore,
          decision: analysis.decision,
          riskLevel: analysis.riskLevel,
          rationale: analysis.rationale,
          findings: analysis.findings,
          provider: analysis.provider,
          model: analysis.model,
          analysisVersion: ANALYSIS_VERSION,
        })
        .returning();

      const [audit] = await tx
        .insert(riskAuditEventsTable)
        .values({
          evaluationId: evaluation.id,
          eventType: "CLAUSE_SCREENED",
          decision: analysis.decision,
          threshold: INTERCEPT_THRESHOLD,
          actor: "system",
        })
        .returning();

      return { evaluation, audit };
    });

    const response = CreateRiskEvaluationResponse.parse(
      toEvaluation(created.evaluation, created.audit),
    );
    req.log.info(
      {
        evaluationId: response.id,
        decision: response.decision,
        riskScore: response.riskScore,
      },
      "Clause evaluated",
    );
    res.status(201).json(response);
  } catch (error) {
    req.log.error({ err: error }, "Clause evaluation failed");
    res.status(500).json({ error: "The clause could not be evaluated." });
  }
});

router.get("/risk-evaluations/summary", async (_req, res) => {
  const [summary] = await db
    .select({
      total: sql<number>`count(*)`,
      intercepted: sql<number>`count(*) filter (where ${riskEvaluationsTable.decision} = 'INTERCEPT')`,
      allowed: sql<number>`count(*) filter (where ${riskEvaluationsTable.decision} = 'ALLOW')`,
      averageRiskScore: sql<number>`coalesce(avg(${riskEvaluationsTable.riskScore}), 0)`,
      lastEvaluatedAt: sql<string | null>`max(${riskEvaluationsTable.createdAt})`,
    })
    .from(riskEvaluationsTable);

  const response = GetRiskEvaluationSummaryResponse.parse({
    total: Number(summary?.total ?? 0),
    intercepted: Number(summary?.intercepted ?? 0),
    allowed: Number(summary?.allowed ?? 0),
    averageRiskScore: Number(Number(summary?.averageRiskScore ?? 0).toFixed(1)),
    threshold: INTERCEPT_THRESHOLD,
    lastEvaluatedAt: summary?.lastEvaluatedAt
      ? new Date(summary.lastEvaluatedAt).toISOString()
      : null,
  });
  res.json(response);
});

export default router;