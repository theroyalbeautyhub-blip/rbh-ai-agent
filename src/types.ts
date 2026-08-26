/**
 * Type definitions for the LLM chat application.
 */

export interface Env {
	/**
	 * Binding for the Workers AI API.
	 */
	AI: Ai;

	/**
	 * Binding for static assets.
	 */
	ASSETS: {
		fetch: (request: Request) => Promise<Response>;
	};

	/**
	 * WooCommerce REST API credentials.
	 * These are stored securely as Cloudflare Secrets.
	 */
	WC_CONSUMER_KEY: string;
	WC_CONSUMER_SECRET: string;
}

/**
 * Represents a chat message.
 */
export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}
