import { useState } from "react";
import { downloadReport, errorMessage, type ReportType } from "../lib/api";
import { todayInManila } from "../lib/format";
import { inputCls } from "../lib/styles";
import { Alert, Button, Card, Field } from "../components/ui";

const REPORTS: {
  type: ReportType;
  title: string;
  description: string;
  dated: boolean;
  datedLabel: string;
  statusFilter?: boolean;
}[] = [
  {
    type: "applications",
    title: "Loan applications",
    description:
      "Every application with amount, term, rate, status, payout channel and disbursement details.",
    dated: true,
    datedLabel: "Applied between",
    statusFilter: true,
  },
  {
    type: "repayments",
    title: "Repayments",
    description:
      "Every installment payment with amount, channel and reference number.",
    dated: true,
    datedLabel: "Paid between",
  },
  {
    type: "borrowers",
    title: "Borrowers",
    description:
      "Registered borrowers with KYC status, ID type and last 4 digits, and any custom rate.",
    dated: true,
    datedLabel: "Registered between",
  },
  {
    type: "pricing",
    title: "Pricing history",
    description:
      "Every product pricing version: rate, processing fee, tax payer and reason for change.",
    dated: true,
    datedLabel: "Created between",
  },
];

const STATUSES = ["SUBMITTED", "APPROVED", "DISBURSED", "REPAID", "REJECTED"];

export default function AdminReports({ token }: { token: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Reports</h1>
        <p className="mt-2 text-slate-500">
          Download CSV files that open in Excel or Google Sheets. Dates use
          Philippine time; timestamps in the files are UTC.
        </p>
      </div>

      <Alert kind="warning">
        These files contain personal information protected by the Data Privacy
        Act of 2012. Store them securely and share only with authorized staff.
        Each download is logged. ID numbers and photos are never included.
      </Alert>

      <div className="grid gap-6 md:grid-cols-2">
        {REPORTS.map((r) => (
          <ReportCard key={r.type} token={token} report={r} />
        ))}
      </div>
    </div>
  );
}

function ReportCard({
  token,
  report,
}: {
  token: string;
  report: (typeof REPORTS)[number];
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function download() {
    if (busy) return;
    if (from && to && from > to) {
      setError("The start date must not be after the end date.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await downloadReport(token, report.type, {
        from,
        to,
        status,
      });
      setNotice(
        result.rows === 0
          ? "Downloaded, but no records matched these filters."
          : `Downloaded ${result.rows.toLocaleString("en-PH")} record${
              result.rows === 1 ? "" : "s"
            }.` +
              (result.truncated
                ? " The file was limited to the first 50,000 rows; narrow the dates to get the rest."
                : "")
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={report.title}>
      <p className="text-sm text-slate-600">{report.description}</p>

      <div className="mt-4 space-y-4">
        {report.dated && (
          <div>
            <p className="mb-2 text-sm font-semibold">
              {report.datedLabel} (optional)
            </p>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="date"
                aria-label={`${report.title}: from date`}
                max={todayInManila()}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                disabled={busy}
                className={inputCls}
              />
              <input
                type="date"
                aria-label={`${report.title}: to date`}
                max={todayInManila()}
                value={to}
                onChange={(e) => setTo(e.target.value)}
                disabled={busy}
                className={inputCls}
              />
            </div>
          </div>
        )}

        {report.statusFilter && (
          <Field label="Status (optional)" htmlFor={`status-${report.type}`}>
            <select
              id={`status-${report.type}`}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              disabled={busy}
              className={inputCls}
            >
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </Field>
        )}

        {error && <Alert>{error}</Alert>}
        {notice && <Alert kind="success">{notice}</Alert>}

        <Button disabled={busy} onClick={() => void download()}>
          {busy ? "Preparing…" : "Download CSV"}
        </Button>
      </div>
    </Card>
  );
}
