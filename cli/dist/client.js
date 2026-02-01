import { ApiError } from "./errors.js";
export class UgigClient {
    baseUrl;
    apiKey;
    constructor(options) {
        this.baseUrl = options.baseUrl.replace(/\/+$/, "");
        this.apiKey = options.apiKey;
    }
    async get(path, params) {
        return this.request("GET", path, { params });
    }
    async post(path, body) {
        return this.request("POST", path, { body });
    }
    async put(path, body) {
        return this.request("PUT", path, { body });
    }
    async patch(path, body) {
        return this.request("PATCH", path, { body });
    }
    async delete(path, body) {
        return this.request("DELETE", path, { body });
    }
    async request(method, path, options) {
        const url = new URL(path, this.baseUrl);
        if (options?.params) {
            for (const [key, value] of Object.entries(options.params)) {
                if (value !== undefined && value !== "") {
                    url.searchParams.set(key, String(value));
                }
            }
        }
        const headers = {
            "User-Agent": "ugig-cli/0.1.0",
        };
        if (this.apiKey) {
            headers["Authorization"] = `Bearer ${this.apiKey}`;
        }
        if (options?.body !== undefined) {
            headers["Content-Type"] = "application/json";
        }
        let response;
        try {
            response = await fetch(url.toString(), {
                method,
                headers,
                body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
            });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : "Unknown network error";
            throw new Error(`Network error: ${msg}`);
        }
        let data;
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
            data = await response.json();
        }
        else {
            const text = await response.text();
            data = { message: text };
        }
        if (!response.ok) {
            throw new ApiError(response.status, data || { error: `HTTP ${response.status}` });
        }
        return data;
    }
}
//# sourceMappingURL=client.js.map