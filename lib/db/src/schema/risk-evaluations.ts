import { createInsertSchema } from "drizzle-zod";
import {
  integer,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const riskEvaluationsTable = pgTable(
  "risk_evaluations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clauseText: text("clause_text").notNull(),
    sourceName: text("source_name"),
    riskScore: integer("risk_score").notNull(),
    decision: text("decision").notNull(),
    riskLevel: text("risk_level").notNull(),
    rationale: text("rationale").notNull(),
    findings: jsonb("findings").$type<string[]>().notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    analysisVersion: text("analysis_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    createdAtIdx: index("risk_evaluations_created_at_idx").on(table.createdAt),
    decisionIdx: index("risk_evaluations_decision_idx").on(table.decision),
  }),
);

export const riskAuditEventsTable = pgTable(
  "risk_audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    evaluationId: uuid("evaluation_id")
      .notNull()
      .references(() => riskEvaluationsTable.id),
    eventType: text("event_type").notNull(),
    decision: text("decision").notNull(),
    threshold: integer("threshold").notNull(),
    actor: text("actor").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    evaluationIdx: index("risk_audit_events_evaluation_id_idx").on(
      table.evaluationId,
    ),
    recordedAtIdx: index("risk_audit_events_recorded_at_idx").on(
      table.recordedAt,
    ),
  }),
);

export const insertRiskEvaluationSchema = createInsertSchema(
  riskEvaluationsTable,
);
export const insertRiskAuditEventSchema = createInsertSchema(
  riskAuditEventsTable,
);

export type RiskEvaluation = typeof riskEvaluationsTable.$inferSelect;
export type RiskAuditEvent = typeof riskAuditEventsTable.$inferSelect;