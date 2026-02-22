export const API_BASE_URL = process.env.JOBJOURNEY_API_URL || "http://localhost:5014";
export const API_KEY = process.env.JOBJOURNEY_API_KEY || "";
export async function apiCall(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers = {
        "Content-Type": "application/json",
        ...(API_KEY && { "X-API-Key": API_KEY }),
        ...options.headers,
    };
    const response = await fetch(url, {
        ...options,
        headers,
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error ${response.status}: ${errorText}`);
    }
    return response.json();
}
