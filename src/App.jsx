import { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import { loginParticipant, registerParticipant } from "./lib/login";

const STARTER_ROW_COUNT = 10;
const STORAGE_KEY = "pantry_note_tracker_user";

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

function rowHasContent(row) {
  return [
    row.item_name,
    row.quantity,
    row.unit,
    row.category,
    row.expiration_date,
    row.notes,
  ].some((value) => String(value ?? "").trim() !== "");
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
  }, [participant?.participantId]);

  function finishAuth(loggedInUser) {
    if (loggedInUser.role === "admin") {
      throw new Error("This tracker is for participant activity only. Please use a participant account.");
    }

    setParticipant(loggedInUser);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(loggedInUser));
    setIdentifier("");
    setPassword("");
    setSaving(false);
    setMessage("");
    setError("");
  }

  async function handleLogin(event) {
    event.preventDefault();
    setLoading(true);
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
    setLoading(true);
    setSaving(false);
    setError("");
    setMessage("");

    try {
      const { data, error: loadError } = await supabase.rpc("activity1_load_rows", {
        p_participant_id: currentParticipant.participantId,
      });

      if (loadError) {
        setError(loadError.message || "Could not load tracker rows.");
        setRows(createStarterRows());
        return;
      }

      if (!data || data.length === 0) {
        setRows(createStarterRows());
      } else {
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
      }
    } catch (err) {
      setError(err.message || "Could not load tracker rows.");
      setRows(createStarterRows());
    } finally {
      setLoading(false);
      setSaving(false);
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
    if (!participant?.participantId) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const rowsToSave = rows
        .map((row, index) => ({ ...row, row_order: index + 1 }))
        .filter(rowHasContent)
        .map((row) => ({
          row_order: row.row_order,
          item_name: row.item_name.trim() || null,
          quantity: String(row.quantity ?? "").trim() || null,
          unit: row.unit || null,
          category: row.category || null,
          expiration_date: row.expiration_date || null,
          notes: row.notes.trim() || null,
        }));

      const { data: savedCount, error: saveError } = await supabase.rpc("activity1_save_rows", {
        p_participant_id: participant.participantId,
        p_username: participant.username || participant.displayName || participant.participantId,
        p_rows: rowsToSave,
      });

      if (saveError) {
        setError(saveError.message || "Could not save tracker rows.");
        return;
      }

      const count = Number(savedCount ?? rowsToSave.length);
      setRows(padRows(rowsToSave.map((row) => ({ ...row, localId: crypto.randomUUID() }))));
      setMessage(`Saved ${count} item${count === 1 ? "" : "s"}.`);
    } catch (err) {
      setError(err.message || "Could not save tracker rows.");
    } finally {
      setSaving(false);
    }
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    setParticipant(null);
    setRows(createStarterRows());
    setMessage("");
    setError("");
    setLoading(false);
    setCreating(false);
    setSaving(false);
  }

  if (!participant) {
    return (
      <main className="page-shell login-shell">
        <section className="login-card">
          <div className="plain-label">Activity 1</div>
          <h1>Pantry Note Tracker</h1>
          <p className="login-copy">
            Manual pantry tracking for this activity. Use the same study username and password for each activity.
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
              New participants should create one username they can remember, then reuse that same login for Smart Pantry later.
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
            <div className="plain-label">Activity 1: Manual Ingredient Tracking</div>
            <h1>Pantry Note Tracker</h1>
            <p>
              Type your items below like a simple paper list or spreadsheet. Save when you are finished.
            </p>
            <p className="participant-line">Logged in as: {participant.displayName}</p>
          </div>

          <button className="secondary-button" onClick={logout}>Logout</button>
        </header>

        <div className="toolbar">
          <button className="primary-button" onClick={saveRows} disabled={saving || loading}>
            {saving ? "Saving..." : "Save Tracker"}
          </button>
          <button className="secondary-button" onClick={addRow}>+ Add Row</button>
          <button className="secondary-button" onClick={removeExtraBlankRows}>Clean Blank Rows</button>
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
                    <button className="small-button" onClick={() => clearRow(row.localId)}>Clear</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bottom-actions">
          <button className="secondary-button" onClick={addRow}>+ Add Another Row</button>
          <button className="primary-button" onClick={saveRows} disabled={saving || loading}>
            {saving ? "Saving..." : "Save Tracker"}
          </button>
        </div>
      </section>
    </main>
  );
}
