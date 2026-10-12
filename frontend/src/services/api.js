// Centralized API client & storage management for OnBoard Transit System

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

/**
 * Safe sessionStorage read
 */
export const readStore = (key) => {
  try {
    return sessionStorage.getItem(key);
  } catch (e) {
    return null;
  }
};

/**
 * Safe sessionStorage write or remove
 */
export const writeStore = (key, value) => {
  try {
    if (value === null || value === undefined) {
      sessionStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, value);
    }
  } catch (e) {
    console.warn(`Failed to access storage for key ${key}:`, e);
  }
};

/**
 * Loads and validates signed JWT session from storage
 */
export function loadSession(key) {
  try {
    const raw = readStore(key);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session || !session.token) return null;

    // Decode JWT payload to verify expiry timestamp
    const parts = session.token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));

    if (payload.exp && payload.exp * 1000 < Date.now()) {
      writeStore(key, null);
      return null;
    }
    return session;
  } catch (e) {
    writeStore(key, null);
    return null;
  }
}

/**
 * Authenticated HTTP fetch wrapper with auto-expiration callback
 */
export async function authedFetch(url, options = {}, token, onExpire) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (response.status === 401 && onExpire) {
    onExpire();
  }

  return response;
}

/**
 * Authenticate User (Driver or Admin)
 */
export async function loginUser(user_id, password) {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id, password })
  });
  return response.json();
}

/**
 * Fetch all available routes with active status and live positions
 */
export async function fetchRoutes() {
  const response = await fetch(`${API_BASE_URL}/routes`);
  if (!response.ok) {
    throw new Error(`Failed to fetch routes (status: ${response.status})`);
  }
  return response.json();
}

/**
 * Send live telemetry broadcast (driver authenticated)
 */
export async function sendTelemetry(data, token, onExpire) {
  const response = await authedFetch(
    `${API_BASE_URL}/telemetry`,
    {
      method: 'POST',
      body: JSON.stringify(data)
    },
    token,
    onExpire
  );
  return response.json();
}

/**
 * Explicitly deactivate a single route
 */
export async function deactivateRoute(routeId, token, onExpire) {
  const response = await authedFetch(
    `${API_BASE_URL}/routes/${routeId}/deactivate`,
    {
      method: 'POST'
    },
    token,
    onExpire
  );
  return response.json();
}

/**
 * Deactivate all routes (reset helper)
 */
export async function deactivateAllRoutes(token, onExpire) {
  const response = await authedFetch(
    `${API_BASE_URL}/routes/deactivate-all`,
    {
      method: 'POST'
    },
    token,
    onExpire
  );
  return response.json();
}

/**
 * Add stop to route (admin authenticated)
 */
export async function addStop(routeId, stopData, token, onExpire) {
  const response = await authedFetch(
    `${API_BASE_URL}/routes/${routeId}/stops`,
    {
      method: 'POST',
      body: JSON.stringify(stopData)
    },
    token,
    onExpire
  );
  return response.json();
}

/**
 * Delete stop by sequence number (admin authenticated)
 */
export async function deleteStop(routeId, sequence, token, onExpire) {
  const response = await authedFetch(
    `${API_BASE_URL}/routes/${routeId}/stops/${sequence}`,
    {
      method: 'DELETE'
    },
    token,
    onExpire
  );
  return response.json();
}
