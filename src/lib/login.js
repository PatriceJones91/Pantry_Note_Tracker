const API_URL = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api").replace(/\/$/, "");

function cleanUsername(value) {
  const username = String(value || "").trim();

  if (!username) {
    throw new Error("Please enter your study username.");
  }

  if (username.length < 3 || username.length > 32) {
    throw new Error("Username must be 3 to 32 characters.");
  }

  if (!/^[A-Za-z0-9_-]+$/.test(username)) {
    throw new Error("Username can only use letters, numbers, underscores, or dashes.");
  }

  return username;
}

function cleanPassword(value) {
  const password = String(value || "");

  if (!password) {
    throw new Error("Please enter your password.");
  }

  if (password.length < 6 || password.length > 64) {
    throw new Error("Password must be 6 to 64 characters.");
  }

  return password;
}

async function authRequest(path, payload) {
  let response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(
      "Could not reach the Smart Pantry login service. Make sure the backend is running or VITE_API_URL is correct."
    );
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.detail || "The login request did not work.");
  }

  return data;
}

export async function loginParticipant(identifier, password) {
  const username = cleanUsername(identifier);
  const cleanPass = cleanPassword(password);
  const user = await authRequest("/auth/login", { username, password: cleanPass });
  return normalizeUser(user);
}

export async function registerParticipant(identifier, password) {
  const username = cleanUsername(identifier);
  const cleanPass = cleanPassword(password);
  const user = await authRequest("/auth/register", {
    username,
    password: cleanPass,
    role: "participant",
  });
  return normalizeUser(user);
}

function normalizeUser(user) {
  const participantId = String(user.id ?? user.user_id ?? user.participant_id ?? user.username ?? "");
  const username = String(user.username ?? user.participant_id ?? participantId);
  const displayName = username || participantId;
  const role = String(user.role ?? "participant").toLowerCase();

  if (!participantId || !username) {
    throw new Error("The login service did not return a complete participant account.");
  }

  return {
    raw: user,
    participantId,
    username,
    displayName,
    role,
  };
}
