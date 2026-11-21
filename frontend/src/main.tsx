
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import Papa from "papaparse";

const API = "http://localhost:4000";

type Approval = {
  officerId: string;
};

type Batch = {
  id: string;
  name: string;
  candidateCount: number;
  district: string;
  status: string;
  _count?: {
    approvals: number;
    candidates: number;
  };
  approvals?: Approval[];
};

const users = [
  { id: "anika", label: "Anika · Training Centre" },
  { id: "dev", label: "Dev · District Officer" },
  { id: "meera", label: "Meera · District Officer" },
  { id: "kabir", label: "Kabir · District Officer" },
  { id: "neha", label: "Neha · Quality" },
  { id: "farah", label: "Farah · State Office" },
] as const;

const districtApprovers = ["dev", "meera", "kabir"];

type Candidate = {
  name: string;
  email: string;
  phone: string;
  course: string;
  externalId: string;
};

type CsvError = {
  row: number;
  message: string;
};

function formatServerErrors(data: {
  error?: string;
  details?: {
    fieldErrors?: Record<string, string[]>;
    formErrors?: string[];
  };
}) {
  const fieldErrors = data.details?.fieldErrors;

  const messages = fieldErrors
    ? Object.entries(fieldErrors).flatMap(([field, errors]) =>
        errors.map((error) => `${field}: ${error}`)
      )
    : [];

  const formErrors = data.details?.formErrors || [];

  return (
    [...messages, ...formErrors].join(" | ") ||
    data.error ||
    "Request validation failed"
  );
}

function App() {
  const [user, setUser] = useState("anika");
  const [batches, setBatches] = useState<Batch[]>([]);
  const [message, setMessage] = useState("");

  const [batchName, setBatchName] = useState("");
  const [district, setDistrict] = useState("Hyderabad");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [csvErrors, setCsvErrors] = useState<CsvError[]>([]);
  const [csvFile, setCsvFile] = useState("");
  const [uploading, setUploading] = useState(false);

  async function load() {
    try {
      const response = await fetch(`${API}/api/batches`, {
        headers: { "x-demo-user": user },
      });

      if (!response.ok) {
        throw new Error("Unable to load batches");
      }

      setBatches(await response.json());
      setMessage("");
    } catch {
      setMessage("API not reachable. Start with docker compose up --build");
    }
  }

  useEffect(() => {
    load();
  }, [user]);

  async function action(
    id: string,
    path: string,
    body: object = {}
  ) {
    try {
      const response = await fetch(`${API}/api/batches/${id}/${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-demo-user": user,
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      setMessage(
        response.ok
          ? "Action completed successfully"
          : data.error || "Action failed"
      );

      await load();
    } catch {
      setMessage("Unable to complete action. Check the backend.");
    }
  }

  function handleCsvUpload(file?: File) {
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setCsvFile(file.name);
      setCandidates([]);
      setCsvErrors([
        { row: 0, message: "Only CSV files are supported." },
      ]);
      setMessage("");
      return;
    }

    setCsvFile(file.name);
    setCandidates([]);
    setCsvErrors([]);
    setMessage("");

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) =>
        header.replace(/^\uFEFF/, "").trim(),

      complete: (result) => {
        const requiredHeaders = [
          "name",
          "email",
          "phone",
          "course",
          "externalId",
        ];

        const headers = result.meta.fields || [];

        const missing = requiredHeaders.filter(
          (header) => !headers.includes(header)
        );

        const parseErrors: CsvError[] = result.errors
          .filter((error) => error.row !== undefined)
          .map((error) => ({
            row: (error.row ?? 0) + 2,
            message: error.message,
          }));

        if (missing.length) {
          setCsvErrors([
            {
              row: 1,
              message: `Missing columns: ${missing.join(", ")}`,
            },
          ]);
          return;
        }

        if (parseErrors.length > 0) {
          setCsvErrors(parseErrors);
          return;
        }

        if (
          result.data.length === 0 ||
          result.data.length > 500
        ) {
          setCsvErrors([
            {
              row: 0,
              message: "CSV must contain between 1 and 500 candidates.",
            },
          ]);
          return;
        }

        const parsedCandidates: Candidate[] = [];
        const errors: CsvError[] = [];
        const externalIds = new Set<string>();
        const emails = new Set<string>();

        result.data.forEach((row, index) => {
          const candidate = {
            name: (row.name || "").trim(),
            email: (row.email || "").trim(),
            phone: (row.phone || "").trim(),
            course: (row.course || "").trim(),
            externalId: (row.externalId || "").trim(),
          };

          const rowNumber = index + 2;

          if (candidate.name.length < 2) {
            errors.push({
              row: rowNumber,
              message: "Invalid name",
            });
          }

          if (
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate.email)
          ) {
            errors.push({
              row: rowNumber,
              message: "Invalid email",
            });
          }

          if (candidate.phone.length < 8) {
            errors.push({
              row: rowNumber,
              message: "Invalid phone",
            });
          }

          if (candidate.course.length < 2) {
            errors.push({
              row: rowNumber,
              message: "Invalid course",
            });
          }

          if (!candidate.externalId) {
            errors.push({
              row: rowNumber,
              message: "Missing externalId",
            });
          }

          if (
            candidate.externalId &&
            externalIds.has(candidate.externalId.toLowerCase())
          ) {
            errors.push({
              row: rowNumber,
              message: `Duplicate externalId: ${candidate.externalId}`,
            });
          }

          if (
            candidate.email &&
            emails.has(candidate.email.toLowerCase())
          ) {
            errors.push({
              row: rowNumber,
              message: `Duplicate email: ${candidate.email}`,
            });
          }

          if (candidate.externalId) {
            externalIds.add(candidate.externalId.toLowerCase());
          }

          if (candidate.email) {
            emails.add(candidate.email.toLowerCase());
          }

          parsedCandidates.push(candidate);
        });

        if (errors.length > 0) {
          setCsvErrors(errors);
          return;
        }

        setCandidates(parsedCandidates);
        setMessage(
          `Successfully validated ${parsedCandidates.length} candidates.`
        );
      },

      error: (error) => {
        setCsvErrors([{ row: 0, message: error.message }]);
      },
    });
  }

  async function createBatch() {
    if (user !== "anika") return;

    if (!batchName.trim()) {
      setMessage("Please enter a batch name.");
      return;
    }

    if (!district.trim()) {
      setMessage("Please enter a district.");
      return;
    }

    if (!csvFile) {
      setMessage("Please select a CSV file.");
      return;
    }

    if (csvErrors.length > 0) {
      setMessage("Please fix all CSV validation errors before proceeding.");
      return;
    }

    if (candidates.length === 0) {
      setMessage("No valid candidates found. Please upload a valid CSV file.");
      return;
    }

    setUploading(true);
    setMessage("");

    try {
      const response = await fetch(`${API}/api/batches`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-demo-user": user,
        },
        body: JSON.stringify({
          name: batchName.trim(),
          district: district.trim(),
          candidates,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(formatServerErrors(data));
      }

      setMessage("Batch created successfully!");

      setBatchName("");
      setDistrict("Hyderabad");
      setCsvFile("");
      setCandidates([]);
      setCsvErrors([]);

      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Something went wrong"
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <main>
      <header>
        <div>
          <small>PRAGATI SKILLS MISSION</small>
          <h1>CertiFlow</h1>
          <p>Certificate issuance &amp; verification</p>
        </div>

        <select
          value={user}
          onChange={(event) => setUser(event.target.value)}
          aria-label="Demo identity"
        >
          {users.map(({ id, label }) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </header>

      <section className="hero">
        <div>
          <span className="pill">LIVE WORKSPACE</span>
          <h2>
            Good work deserves
            <br />
            verified recognition.
          </h2>
          <p>
            Track batches, review approvals and issue trusted certificates.
          </p>
        </div>

        <div className="stat">
          <b>{batches.length}</b>
          <span>Visible batches</span>
        </div>
      </section>

      {message && (
        <p
          className={
            message.toLowerCase().includes("successfully")
              ? "validation-success"
              : "validation-error"
          }
          role="alert"
        >
          {message}
        </p>
      )}

      {user === "anika" && (
        <section className="panel">
          <div className="panelhead">
            <div>
              <h2>Create Training Batch</h2>
              <p>Upload your candidates using a CSV spreadsheet.</p>
            </div>
          </div>

          <label>
            Batch Name
            <input
              value={batchName}
              onChange={(e) => {
                setBatchName(e.target.value);
                setMessage("");
              }}
              placeholder="React Development Batch 02"
            />
          </label>

          <label>
            District
            <input
              value={district}
              onChange={(e) => {
                setDistrict(e.target.value);
                setMessage("");
              }}
              placeholder="Hyderabad"
            />
          </label>

          <label>
            Candidate CSV File
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => handleCsvUpload(e.target.files?.[0])}
            />
          </label>

          {csvFile && <p>Selected file: {csvFile}</p>}

          {candidates.length > 0 && (
            <p className="notice">
              {candidates.length} candidates validated successfully.
            </p>
          )}

          {csvErrors.length > 0 && (
            <div className="notice csv-errors" role="alert">
              <h3>CSV Validation Errors</h3>

              {csvErrors.map((error, index) => (
                <p key={index}>
                  Row {error.row}: {error.message}
                </p>
              ))}

              <p>No records were saved.</p>
            </div>
          )}

          <button
            type="button"
            disabled={uploading}
            onClick={createBatch}
          >
            {uploading ? "Creating Batch..." : "Create Batch"}
          </button>
        </section>
      )}

      <section className="panel">
        <div className="panelhead">
          <div>
            <h2>Batch pipeline</h2>
            <p>Latest activity across your workflow</p>
          </div>

          <button type="button" onClick={load}>
            Refresh
          </button>
        </div>

        {batches.length === 0 ? (
          <p>No batches available for this role yet.</p>
        ) : (
          batches.map((batch) => {
            // Check whether the currently logged-in officer
            // has already approved this batch.
            const alreadyApproved =
              batch.approvals?.some(
                (approval) => approval.officerId === user
              ) ?? false;

            return (
              <article className="batch" key={batch.id}>
                <div>
                  <h3>{batch.name}</h3>

                  <p>
                    {batch.candidateCount} candidates · {batch.district}
                  </p>

                  <span className="status">
                    {batch.status.replaceAll("_", " ")}
                  </span>

                  {batch.status === "DISTRICT_REVIEW" && (
                    <p className="approval-progress">
                      District approvals: {batch._count?.approvals ?? 0}/2
                    </p>
                  )}

                  {batch.status === "QUALITY_REVIEW" && (
                    <p className="approval-progress">
                      Awaiting Neha's quality review
                    </p>
                  )}

                  {batch.status === "RETURNED" && (
                    <p className="approval-progress">
                      Returned for corrections. Anika can resubmit this batch.
                    </p>
                  )}
                </div>

                <div className="actions">
                  {user === "anika" &&
                    (batch.status === "DRAFT" ||
                      batch.status === "RETURNED") && (
                      <button
                        type="button"
                        onClick={() => action(batch.id, "submit")}
                      >
                        {batch.status === "RETURNED"
                          ? "Resubmit Batch"
                          : "Submit"}
                      </button>
                    )}

                  {batch.status === "QUALITY_REVIEW" && user === "neha" && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          action(batch.id, "quality-decision", {
                            decision: "APPROVE",
                          })
                        }
                      >
                        Quality Approve
                      </button>

                      <button
                        type="button"
                        className="secondary"
                        onClick={() =>
                          action(batch.id, "quality-decision", {
                            decision: "RETURN",
                            reason: "Please correct candidate details",
                          })
                        }
                      >
                        Return to Centre
                      </button>

                      <button
                        type="button"
                        className="secondary"
                        onClick={() =>
                          action(batch.id, "quality-decision", {
                            decision: "REJECT",
                            reason: "Failed quality review",
                          })
                        }
                      >
                        Reject
                      </button>
                    </>
                  )}

                  {districtApprovers.includes(user) &&
                    batch.status === "DISTRICT_REVIEW" && (
                      <>
                        <button
                          type="button"
                          disabled={alreadyApproved}
                          title={
                            alreadyApproved
                              ? "You have already approved this batch"
                              : "Approve this batch"
                          }
                          onClick={() =>
                            action(batch.id, "district-decision", {
                              decision: "APPROVE",
                            })
                          }
                        >
                          {alreadyApproved
                            ? "Already Approved"
                            : "Approve"}
                        </button>

                        <button
                          type="button"
                          className="secondary"
                          disabled={alreadyApproved}
                          onClick={() =>
                            action(batch.id, "district-decision", {
                              decision: "RETURN",
                              reason: "Please correct candidate details",
                            })
                          }
                        >
                          Return
                        </button>

                        <button
                          type="button"
                          className="secondary"
                          disabled={alreadyApproved}
                          onClick={() =>
                            action(batch.id, "district-decision", {
                              decision: "REJECT",
                              reason: "Failed district review",
                            })
                          }
                        >
                          Reject
                        </button>
                      </>
                    )}

                  {user === "farah" &&
                    batch.status === "STATE_REVIEW" && (
                      <button
                        type="button"
                        onClick={() => action(batch.id, "state-approve")}
                      >
                        Final approve &amp; issue
                      </button>
                    )}
                </div>
              </article>
            );
          })
        )}
      </section>

      <section className="hint">
        <b>Demo flow</b>
        <p>
          Anika submits → Dev and Meera approve → Farah issues.
          Batches above 50 candidates enter quality review.
          Use the API endpoints for candidate import, audit history
          and public verification.
        </p>
      </section>

      <footer>
        CertiFlow · Hackathon MVP · Demo identity switcher
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
