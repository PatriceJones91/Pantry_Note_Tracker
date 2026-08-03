import { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import { loginParticipant, registerParticipant } from "./lib/login";

const STARTER_ROW_COUNT = 10;
const STORAGE_KEY = "pantry_note_tracker_user";
const SAVE_REQUEST_TIMEOUT_MS = 30000;
const MAX_SAVE_ATTEMPTS = 3;

const UNIT_OPTIONS = [
  "",
  "servings",
  "pieces",
  "packs",
  "cans",
  "boxes",
  "bags",
  "cups",
  "tbsp",
  "tsp",
  "oz",
  "lb",
  "g",
  "kg",
  "bottles",
  "jars",
  "other",
];

const CATEGORY_OPTIONS = [
  "",
  "Pantry",
  "Refrigerator",
  "Freezer",
  "Produce",
  "Meat/Protein",
  "Dairy",
  "Grain/Bread",
  "Canned Goods",
  "Condiment/Sauce",
  "Snack",
  "Drink",
  "Other",
];

function makeBlankRow(rowNumber) {
  return {
    localId: crypto.randomUUID(),
    row_order: rowNumber,
    item_name: "",
    quantity: "",
    unit: "",
    category: "",
    expiration_date: "",
    notes: "",
  };
}

function createStarterRows() {
  return Array.from({ length: STARTER_ROW_COUNT }, (_, index) => makeBlankRow(index + 1));
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function rowHasContent(row) {
  return [
    row.item_name,
    row.quantity,
    row.unit,
    row.category,
    row.expiration_date,
    row.notes,
  ].some((value) => cleanText(value) !== "");
}

function padRows(rows) {
  const cleanRows = rows.map((row, index) => ({
    ...row,
    localId: row.localId || crypto.randomUUID(),
    row_order: index + 1,
  }));

  while (cleanRows.length < STARTER_ROW_COUNT) {
    cleanRows.push(makeBlankRow(cleanRows.length + 1));
  }

  return cleanRows;
}

function withTimeout(promise, ms, message) {
  let timeoutId;
  const timeout = new Promise((_resolve, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeSavedRows(rows) {
  return rows
    .map((row, index) => ({ ...row, row_order: index + 1 }))
    .filter(rowHasContent)
    .map((row) => ({
      row_order: row.row_order,
      item_name: cleanText(row.item_name) || null,
      quantity: cleanText(row.quantity) || null,
      unit: cleanText(row.unit) || null,
      category: cleanText(row.category) || null,
      expiration_date: cleanText(row.expiration_date) || null,
      notes: cleanText(row.notes) || null,
    }));
}


function escapeCsvValue(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function safeFilePart(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "participant";
}

function draftKey(participantId) {
  return `pantry_note_tracker_draft_${participantId}`;
}

export default function App() {
  const [participant, setParticipant] = useState(null);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [rows, setRows] = useState(createStarterRows);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const filledRowCount = useMemo(() => rows.filter(rowHasContent).length, [rows]);

  useEffect(() => {
    const savedUser = localStorage.getItem(STORAGE_KEY);
    if (savedUser) {
      try {
        setParticipant(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  useEffect(() => {
    if (participant?.participantId) {
      loadRows(participant);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participant?.participantId]);

  // Keep an automatic browser backup of everything currently typed.
  useEffect(() => {
    if (!participant?.participantId) return;
    localStorage.setItem(draftKey(participant.participantId), JSON.stringify(rows));
  }, [participant?.participantId, rows]);

  function finishAuth(loggedInUser) {
    if (loggedInUser.role === "admin") {
      throw new Error("This tracker is for participant use only. Please use a participant account.");
    }

    setParticipant(loggedInUser);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(loggedInUser));
    setIdentifier("");
    setPassword("");
  }

  async function handleLogin(event) {
    event.preventDefault();
    setLoading(true);
    setSaving(false);
    setError("");
    setMessage("");

    try {
      const loggedInUser = await loginParticipant(identifier, password);
      finishAuth(loggedInUser);
    } catch (err) {
      setError(err.message || "Unable to log in.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateAccount() {
    setCreating(true);
    setSaving(false);
    setError("");
    setMessage("");

    try {
      const newUser = await registerParticipant(identifier, password);
      finishAuth(newUser);
    } catch (err) {
      setError(err.message || "Unable to create account.");
    } finally {
      setCreating(false);
    }
  }

  async function loadRows(currentParticipant) {
    if (!currentParticipant?.participantId) return;

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const { data, error: loadError } = await withTimeout(
        supabase.rpc("activity1_load_rows", {
          p_participant_id: currentParticipant.participantId,
        }),
        SAVE_REQUEST_TIMEOUT_MS,
        "The tracker took too long to load. Please refresh and try again."
      );

      if (loadError) {
        throw new Error(loadError.message || "Could not load tracker rows.");
      }

      if (data && data.length > 0) {
        const savedRows = data.map((item, index) => ({
          localId: item.id || crypto.randomUUID(),
          row_order: item.row_order || index + 1,
          item_name: item.item_name || "",
          quantity: item.quantity || "",
          unit: item.unit || "",
          category: item.category || "",
          expiration_date: item.expiration_date || "",
          notes: item.notes || "",
        }));

        setRows(padRows(savedRows));
        return;
      }

      const localDraft = localStorage.getItem(draftKey(currentParticipant.participantId));
      if (localDraft) {
        const parsedDraft = JSON.parse(localDraft);
        setRows(padRows(parsedDraft));
      } else {
        setRows(createStarterRows());
      }
    } catch (err) {
      const localDraft = localStorage.getItem(draftKey(currentParticipant.participantId));

      if (localDraft) {
        try {
          setRows(padRows(JSON.parse(localDraft)));
          setError(`${err.message || "Could not load saved rows."} Your typed entries were restored from this browser.`);
        } catch {
          setRows(createStarterRows());
          setError(err.message || "Could not load tracker rows.");
        }
      } else {
        setRows(createStarterRows());
        setError(err.message || "Could not load tracker rows.");
      }
    } finally {
      setLoading(false);
    }
  }

  function updateRow(localId, field, value) {
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.localId === localId
          ? {
              ...row,
              [field]: value,
            }
          : row
      )
    );
  }

  function addRow() {
    setRows((currentRows) => [...currentRows, makeBlankRow(currentRows.length + 1)]);
  }

  function clearRow(localId) {
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.localId === localId
          ? {
              ...row,
              item_name: "",
              quantity: "",
              unit: "",
              category: "",
              expiration_date: "",
              notes: "",
            }
          : row
      )
    );
  }

  function removeExtraBlankRows() {
    setRows((currentRows) => {
      const contentRows = currentRows.filter(rowHasContent);
      return padRows(contentRows.length ? contentRows : []);
    });
  }

  async function saveRows() {
    if (!participant?.participantId || saving) return;

    const rowsToSave = normalizeSavedRows(rows);

    setSaving(true);
    setError("");
    setMessage("");

    // Save a browser backup before contacting Supabase.
    localStorage.setItem(draftKey(participant.participantId), JSON.stringify(rows));

    let lastError = null;

    try {
      for (let attempt = 1; attempt <= MAX_SAVE_ATTEMPTS; attempt += 1) {
        try {
          const { data: savedCount, error: saveError } = await withTimeout(
            supabase.rpc("activity1_save_rows", {
              p_participant_id: participant.participantId,
              p_username:
                participant.username || participant.displayName || participant.participantId,
              p_rows: rowsToSave,
            }),
            SAVE_REQUEST_TIMEOUT_MS,
            `Save attempt ${attempt} took too long.`
          );

          if (saveError) {
            throw new Error(saveError.message || "Could not save tracker rows.");
          }

          const count = Number(savedCount ?? rowsToSave.length);

          if (count !== rowsToSave.length) {
            throw new Error(
              `Supabase confirmed ${count} of ${rowsToSave.length} filled rows. Retrying the full tracker.`
            );
          }

          setMessage(
            `Saved ${count} item${count === 1 ? "" : "s"}. You may add more rows and save again.`
          );
          return;
        } catch (attemptError) {
          lastError = attemptError;

          if (attempt < MAX_SAVE_ATTEMPTS) {
            setMessage(`Save is taking longer than expected. Retrying automatically (${attempt + 1} of ${MAX_SAVE_ATTEMPTS})...`);
            await wait(1000 * attempt);
          }
        }
      }

      throw lastError || new Error("Could not save the tracker.");
    } catch (err) {
      setMessage("");
      setError(
        `${err.message || "Could not save tracker rows."} Your entries are still on the screen and backed up in this browser. Click Save Tracker again when the connection is available.`
      );
    } finally {
      setSaving(false);
    }
  }


  function exportCsv() {
    const exportRows = normalizeSavedRows(rows);

    setError("");
    setMessage("");

    if (exportRows.length === 0) {
      setError("Add at least one pantry item before exporting a CSV file.");
      return;
    }

    const headers = [
      "item_name",
      "quantity",
      "unit",
      "category",
      "expiration_date",
      "notes",
    ];

    const csvLines = [
      headers.join(","),
      ...exportRows.map((row) =>
        headers.map((header) => escapeCsvValue(row[header] ?? "")).join(",")
      ),
    ];

    // UTF-8 BOM helps Excel preserve punctuation and special characters.
    const csvBlob = new Blob(["\uFEFF", csvLines.join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    const downloadUrl = URL.createObjectURL(csvBlob);
    const link = document.createElement("a");
    const participantName =
      participant.username || participant.displayName || participant.participantId;
    const dateStamp = new Date().toISOString().slice(0, 10);

    link.href = downloadUrl;
    link.download = `smart-pantry-import_${safeFilePart(participantName)}_${dateStamp}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);

    setMessage(
      `Exported ${exportRows.length} pantry item${exportRows.length === 1 ? "" : "s"} to CSV for Smart Pantry.`
    );
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    setParticipant(null);
    setRows(createStarterRows());
    setLoading(false);
    setCreating(false);
    setSaving(false);
    setMessage("");
    setError("");
  }

  if (!participant) {
    return (
      <main className="page-shell login-shell">
        <section className="login-card">
          <div className="plain-label">Study Task 1</div>
          <h1>Pantry Note Tracker</h1>
          <p className="login-copy">
            Create your study account or sign in with the same username and password you will use for Smart Pantry.
          </p>

          <form onSubmit={handleLogin} className="login-form">
            <label>
              Study Username
              <input
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="Create or enter your study username"
                autoComplete="username"
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
              />
            </label>

            {error && <div className="error-box">{error}</div>}

            <button type="submit" className="primary-button" disabled={loading || creating}>
              {loading ? "Checking..." : "Log In"}
            </button>

            <button
              type="button"
              className="secondary-button full-width-button"
              onClick={handleCreateAccount}
              disabled={loading || creating}
            >
              {creating ? "Creating..." : "Create Study Account"}
            </button>

            <p className="small-help-text">
              New participants should create one username they can remember and reuse that same login for Smart Pantry later.
            </p>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell tracker-shell">
      <section className="tracker-card">
        <header className="tracker-header">
          <div>
            <div className="plain-label">Study Task 1: Pantry Note Tracker</div>
            <h1>BUILD YOUR PANTRY</h1>
            <p>
              Create and organize your pantry inventory by entering the food items currently stored in your pantry, refrigerator, and freezer. Save your entries when you are finished.
            </p>
            <p className="small-help-text">
              Please add an expiration date when you know it. If you are unsure, use your best estimate or add a short note.
            </p>
            <p className="participant-line">Logged in as: {participant.displayName}</p>
          </div>

          <button className="secondary-button" onClick={logout}>Logout</button>
        </header>

        <div className="toolbar">
          <button className="primary-button" onClick={saveRows} disabled={saving || loading}>
            {saving ? "Saving Tracker..." : "Save Tracker"}
          </button>
          <button className="secondary-button" onClick={addRow} disabled={saving}>+ Add Row</button>
          <button className="secondary-button" onClick={removeExtraBlankRows} disabled={saving}>Clean Blank Rows</button>
          <button className="secondary-button export-button" onClick={exportCsv} disabled={saving || loading || filledRowCount === 0}>
            Export CSV
          </button>
          <span className="row-count">Filled rows: {filledRowCount}</span>
        </div>

        {message && <div className="success-box">{message}</div>}
        {error && <div className="error-box">{error}</div>}
        {loading && <div className="notice-box">Loading tracker...</div>}

        <div className="table-wrap">
          <table className="tracker-table">
            <thead>
              <tr>
                <th className="num-col">#</th>
                <th>Ingredient / Item</th>
                <th>Quantity</th>
                <th>Unit</th>
                <th>Category</th>
                <th>Expiration Date</th>
                <th>Notes</th>
                <th className="action-col">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.localId}>
                  <td className="num-col">{index + 1}</td>
                  <td>
                    <input
                      value={row.item_name}
                      onChange={(event) => updateRow(row.localId, "item_name", event.target.value)}
                      placeholder="ex: chicken, rice, milk"
                    />
                  </td>
                  <td>
                    <input
                      value={row.quantity}
                      onChange={(event) => updateRow(row.localId, "quantity", event.target.value)}
                      placeholder="ex: 2"
                    />
                  </td>
                  <td>
                    <select
                      value={row.unit}
                      onChange={(event) => updateRow(row.localId, "unit", event.target.value)}
                    >
                      {UNIT_OPTIONS.map((unit) => (
                        <option key={unit || "blank"} value={unit}>{unit || "Select"}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={row.category}
                      onChange={(event) => updateRow(row.localId, "category", event.target.value)}
                    >
                      {CATEGORY_OPTIONS.map((category) => (
                        <option key={category || "blank"} value={category}>{category || "Select"}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="date"
                      value={row.expiration_date}
                      onChange={(event) => updateRow(row.localId, "expiration_date", event.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      value={row.notes}
                      onChange={(event) => updateRow(row.localId, "notes", event.target.value)}
                      placeholder="optional"
                    />
                  </td>
                  <td className="action-col">
                    <button className="small-button" onClick={() => clearRow(row.localId)} disabled={saving}>Clear</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bottom-actions">
          <button className="secondary-button" onClick={addRow} disabled={saving}>+ Add Another Row</button>
          <button className="secondary-button export-button" onClick={exportCsv} disabled={saving || loading || filledRowCount === 0}>
            Export CSV
          </button>
          <button className="primary-button" onClick={saveRows} disabled={saving || loading}>
            {saving ? "Saving Tracker..." : "Save Tracker"}
          </button>
        </div>
      </section>
    </main>
  );
}
