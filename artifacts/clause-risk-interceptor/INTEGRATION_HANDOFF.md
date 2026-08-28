# Integration handoff

The app is intentionally usable in `demo` mode while you connect your own services.
The public API contract does not need to change when you replace the analyzer or
database implementation.

## Claude adapter

The server currently uses a deterministic local analyzer so the preview works without
any credentials. It is selected by the absence of `RISK_ANALYZER_MODE` or by setting:

```bash
RISK_ANALYZER_MODE=demo
```

To connect Claude:

1. Store the Anthropic credential as a server-side secret. Never put it in the browser
   bundle or commit it to GitHub.
2. Replace `runConfiguredAnalyzer` in
   `artifacts/api-server/src/routes/risk-evaluations.ts` with your Claude request.
3. Keep the returned `Analysis` shape:

```ts
{
  riskScore: number;       // integer from 0 through 100
  riskLevel: "critical" | "high" | "moderate" | "low";
  decision: "INTERCEPT" | "ALLOW";
  rationale: string;
  findings: string[];
  provider: string;        // e.g. "anthropic"
  model: string;           // the exact Claude model used
}
```

The server remains the source of truth for the decision:

```ts
decision = riskScore >= 80 ? "INTERCEPT" : "ALLOW";
```

Do not allow the model to override that comparison. Treat `ALLOW` as “below the
configured screening threshold,” not as a legal conclusion.

## Database adapter

The current route writes to two PostgreSQL tables:

- `risk_evaluations` stores the clause, result, model metadata, explanation, and findings.
- `risk_audit_events` stores the immutable screening event and threshold used.

If you connect a different database, keep the same endpoint responses and preserve both
the evaluation record and its corresponding audit event in one transaction.

## File uploads

The first version accepts `.txt` files in the browser and sends their extracted text to
the same analysis endpoint as pasted clauses. Add PDF/DOCX extraction at that boundary
when you connect your document pipeline; the API only needs the resulting plain text.