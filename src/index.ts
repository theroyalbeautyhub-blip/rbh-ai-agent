/**
 * ============================================================
 * ROYAL BEAUTY HUB AI ASSISTANT
 * Cloudflare Workers AI + WooCommerce REST API
 *
 * OPTIMIZED + STRICT ACCURACY VERSION
 *
 * FIXES:
 * - Customer language matching
 * - Strict Pakistani Roman Urdu
 * - No Hindi-style vocabulary
 * - English customer -> English reply
 * - Exact latest product intent
 * - No random product recommendations
 * - No fallback to unrelated products
 * - Strict Face Wash vs Cleanser separation
 * - Concern-based product evidence matching
 * - Dry skin recommendations only when WooCommerce data confirms relevance
 * - Zero-token automation for common questions
 * ============================================================
 */

import { Env, ChatMessage } from "./types";

const MODEL_ID = "@cf/meta/llama-3.1-8b-instruct-fp8";

const PRODUCT_CACHE_TTL = 2 * 60 * 1000;
const MAX_HISTORY_MESSAGES = 6;
const MAX_PRODUCTS_FOR_AI = 6;
const MAX_OUTPUT_TOKENS = 420;

let productCache: { expires: number; products: any[] } | null = null;
let productFetchPromise: Promise<any[]> | null = null;

/* ============================================================
   LANGUAGE
   ============================================================ */

type CustomerLanguage = "english" | "roman_urdu" | "urdu";

function detectLanguage(text: string): CustomerLanguage {
	const value = String(text || "").trim();

	// Urdu script
	if (/[\u0600-\u06FF]/.test(value)) {
		return "urdu";
	}

	const lower = value.toLowerCase();

	// Strong Roman Urdu indicators
	const romanUrduWords = [
		"mujhe",
		"mujh",
		"aap",
		"ap",
		"tum",
		"main",
		"mein",
		"hai",
		"hain",
		"hoon",
		"ho",
		"kya",
		"kyun",
		"ky",
		"kaise",
		"kese",
		"kaisay",
		"chahiye",
		"karna",
		"karni",
		"karo",
		"karen",
		"karein",
		"batao",
		"batayein",
		"acha",
		"theek",
		"bilkul",
		"wala",
		"wali",
		"liye",
		"ke liye",
		"nahi",
		"nahin",
		"mila",
		"milta",
		"available hai",
		"chahiy",
		"khareed",
		"pasand",
		"skin ke",
	];

	const words = lower.split(/\s+/);

	const romanScore = romanUrduWords.reduce(
		(score, word) =>
			lower.includes(word) ? score + 1 : score,
		0,
	);

	if (romanScore >= 1) {
		return "roman_urdu";
	}

	// If message appears to be normal English
	const englishWords = [
		"i",
		"want",
		"need",
		"please",
		"hello",
		"how",
		"what",
		"which",
		"where",
		"when",
		"can",
		"could",
		"would",
		"product",
		"buy",
		"purchase",
		"recommend",
		"available",
		"price",
	];

	const englishScore = words.reduce(
		(score, word) =>
			englishWords.includes(word.replace(/[^\w]/g, ""))
				? score + 1
				: score,
		0,
	);

	if (englishScore >= 1) {
		return "english";
	}

	// Default website customer language
	return "roman_urdu";
}

function getLanguageInstruction(language: CustomerLanguage): string {
	if (language === "english") {
		return `
LANGUAGE MODE: ENGLISH
- Reply completely in natural English.
- Do not mix Urdu or Roman Urdu unless the customer does first.
`;
	}

	if (language === "urdu") {
		return `
LANGUAGE MODE: URDU
- Reply in Urdu.
- Keep the answer natural and easy to understand.
`;
	}

	return `
LANGUAGE MODE: PAKISTANI ROMAN URDU
- Reply ONLY in natural Pakistani Roman Urdu.
- English technical/product words are allowed where normal, for example:
  Face Wash, Cleanser, Add to Cart, Checkout, Order, Delivery.
- Do NOT use Hindi-style vocabulary or Hindi grammar.
- Never use words such as:
  "sujhav", "anya", "kitna sa", "aapko kuch sujha sakta hoon",
  "zarooraton ke liye anya products", or similar Hindi-style phrases.
- Use natural Pakistani wording such as:
  "main aapko bata sakta hoon"
  "main aapki help kar sakta hoon"
  "main aapko recommend kar sakta hoon"
  "aap bata dein"
  "aap kis cheez ki talash mein hain?"
- Never write Hindi script.
`;
}

/* ============================================================
   SYSTEM PROMPT
   ============================================================ */

const SYSTEM_PROMPT = `
You are the official Royal Beauty Hub (RBH) AI Assistant.

IDENTITY:
- You are an AI Assistant of Royal Beauty Hub.
- Never claim to be human.
- Be warm, concise, natural and helpful.

MOST IMPORTANT RULE — LANGUAGE:
- Follow the customer's latest language.
- English customer -> reply in English.
- Roman Urdu customer -> reply in Pakistani Roman Urdu.
- Never use Hindi script.
- Never use Hindi-style vocabulary when replying in Roman Urdu.
- Do not mix English and Roman Urdu unnecessarily.

CONVERSATION:
- Answer the customer's actual latest question first.
- Do not give unrelated information.
- Do not repeat previous answers unnecessarily.
- If the customer changes their request, the latest request overrides older requests.

WEBSITE CONTEXT:
- The customer is already on the Royal Beauty Hub website.
- Never tell the customer to search Google.
- Never tell the customer to open another browser.
- Never tell the customer to visit Royal Beauty Hub because they are already using the website.
- Purchase flow:
  Product -> Add to Cart -> Cart -> Checkout.
- You cannot personally click buttons, add products or complete orders.

PRODUCT ACCURACY — VERY STRICT:
- WooCommerce catalogue data supplied in this request is the ONLY source of truth.
- Never invent a product.
- Never invent availability.
- Never invent price, ingredients, benefits, stock or discounts.
- Never recommend a product simply because it sounds suitable.
- Recommend a product for a skincare concern ONLY when the supplied WooCommerce data supports that concern.
- If WooCommerce data does not confirm suitability, do not guess.

PRODUCT TYPE RULES:
- Face Wash and Cleanser are separate product types.
- If customer asks for Face Wash, recommend Face Wash only.
- Do not replace Face Wash with Cleanser.
- If customer asks for Cleanser, recommend Cleanser only.
- Do not replace Cleanser with Face Wash.
- If customer asks for Hand Cream, Shampoo, Serum, Sunscreen or another specific product type,
  do not replace it with unrelated products.

NO RANDOM FALLBACK:
- If the requested product type is not found in WooCommerce data,
  clearly say that the requested product is currently not confirmed as available.
- Do NOT recommend random or unrelated products as a replacement.
- You may ask what other product category the customer would like to see.

SKINCARE RECOMMENDATIONS:
- For a concern such as dry skin, oily skin, acne or sensitive skin,
  recommend only products whose WooCommerce data contains relevant evidence.
- Do not use general skincare knowledge to override WooCommerce data.
- If no product is confirmed as suitable, say so clearly instead of guessing.
- Never diagnose medical conditions.
- Never guarantee results.

HAND CREAM EXAMPLE:
- If customer asks for Hand Cream and no Hand Cream exists in supplied catalogue,
  say it is currently not confirmed as available.
- Do not say "look at random other products".
- Do not use Hindi-style wording.

STYLE:
- Keep normal answers short.
- Usually 1 to 5 sentences.
- Be helpful but do not add unnecessary information.

SPIN & WIN:
- Add an eligible product to cart.
- Spin & Win unlocks.
- Customer spins the wheel.
- Wheel determines the reward.
- Confirmed reward is automatically applied.
- One chance every 24 hours.
- Never reveal internal coupon codes.
- Never promise a reward before the wheel is spun.
`;

const STORE_INFORMATION = `
ROYAL BEAUTY HUB STORE FACTS:
- Customer is already on the RBH website.
- Products can be added using Add to Cart.
- Cart proceeds to Checkout.
- Buy Now can be used if visible on the product page.
- Spin & Win requires an eligible product in the cart.
- Reward is determined after spinning.
- Confirmed reward is automatically applied.
- One Spin & Win chance every 24 hours.
`;

/* ============================================================
   STATIC REPLIES
   ZERO-TOKEN AUTOMATION
   ============================================================ */

function getGreetingReply(language: CustomerLanguage): string {
	if (language === "english") {
		return `Hello! 😊 I'm the official AI Assistant of Royal Beauty Hub (RBH). I can help you with products, skincare, orders and other store-related questions. How can I help you today?`;
	}

	return `Assalam o Alaikum! 😊 Main Royal Beauty Hub (RBH) ka official AI Assistant hoon. Main aapki products, skincare, orders aur store-related help mein madad kar sakta hoon. Bataiye, aapko kis cheez mein help chahiye?`;
}

function getHelloReply(language: CustomerLanguage): string {
	if (language === "english") {
		return `Hello! 😊 I'm the official AI Assistant of Royal Beauty Hub (RBH). How can I help you today?`;
	}

	return `Hello! 😊 Main Royal Beauty Hub (RBH) ka official AI Assistant hoon. Bataiye, main aapki kis cheez mein help kar sakta hoon?`;
}

function getHowAreYouReply(language: CustomerLanguage): string {
	if (language === "english") {
		return `I'm doing well, thank you! 😊 How are you? How can I help you today?`;
	}

	return `Alhamdulillah, main theek hoon 😊 Aap sunayein, aap kaise hain? Main aapki kis cheez mein help kar sakta hoon?`;
}

function getIdentityReply(language: CustomerLanguage): string {
	if (language === "english") {
		return `I'm the official AI Assistant of Royal Beauty Hub (RBH) 🤖. I can help you with products, skincare, orders and store-related questions.`;
	}

	return `Main Royal Beauty Hub (RBH) ka official AI Assistant hoon 🤖. Main aapki products, skincare, orders aur store-related questions mein help kar sakta hoon.`;
}

function getThanksReply(language: CustomerLanguage): string {
	if (language === "english") {
		return `You're very welcome! 😊 Happy to help.`;
	}

	return `Ji bilkul 😊 Khushi hui ke main aapki help kar saka.`;
}

function getFarewellReply(language: CustomerLanguage): string {
	if (language === "english") {
		return `Goodbye! 😊 Whenever you need help with RBH products or your order, just message me here.`;
	}

	return `Allah Hafiz! 😊 Jab bhi RBH products ya order ke hawale se help chahiye ho, yahin message kar dein.`;
}

function getPurchaseReply(language: CustomerLanguage): string {
	if (language === "english") {
		return `Sure 😊 Which product would you like to buy? You can open the product, tap Add to Cart, then go to Cart and complete Checkout. If you tell me what product you're looking for, I can help you find the right option.`;
	}

	return `Ji bilkul 😊 Aap konsa product buy karna chahte hain? Aap product select karke **Add to Cart** karein, phir **Cart** se **Checkout** complete kar dein. Agar aap mujhe bata dein ke aapko kya chahiye, to main available products mein aapki help kar sakta hoon.`;
}

function getSpinReply(language: CustomerLanguage): string {
	if (language === "english") {
		return `Sure 🎡 First add an eligible product to your cart. Spin & Win will unlock, then you can spin the wheel. The reward is decided by the wheel and the confirmed reward is automatically applied. You get one chance every 24 hours.`;
	}

	return `Ji 🎡 Pehle koi eligible product **Add to Cart** karein. Us ke baad **Spin & Win** unlock ho jayega aur aap wheel spin kar sakte hain. Reward wheel decide karega aur confirmed reward automatically apply ho jayega. Har customer ko 24 ghantay mein 1 chance milta hai.`;
}

/* ============================================================
   TEXT NORMALIZATION
   ============================================================ */

function normalize(text: string): string {
	return String(text || "")
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\s]/gu, " ")
		.replace(/\s+/g, " ")
		.trim();
}

/* ============================================================
   COMMON QUESTION DETECTION
   ============================================================ */

function isGreetingOnly(text: string): boolean {
	const value = normalize(text);

	return /^(assalam o alaikum|assalamualaikum|salam|aoa|hello|hi|hey|helo|hy)$/.test(
		value,
	);
}

function isHelloOnly(text: string): boolean {
	const value = normalize(text);

	return /^(hello|hi|hey|helo|hy)$/.test(value);
}

function isHowAreYou(text: string): boolean {
	const value = normalize(text);

	return (
		/(kya haal hai|kia haal hai|kaise ho|kese ho|kaisay ho|theek ho|sab theek|how are you|how r u)/.test(
			value,
		) &&
		!/(face wash|facewash|cleanser|product|price|order|delivery|acne|skin|cream|buy|purchase)/.test(
			value,
		)
	);
}

function isIdentityQuestion(text: string): boolean {
	const value = normalize(text);

	return /(tum kon ho|tum kaun ho|aap kon hain|aap kon ho|who are you|what are you|aap kya ho|tum kya ho)/.test(
		value,
	);
}

function isPurchaseQuestion(text: string): boolean {
	const value = normalize(text);

	return /(mujhe product buy karni hai|mujhe product buy karna hai|product buy karna hai|i want to buy|want to buy|buy a product|purchase a product|how to buy|how do i buy|order kaise|order kese|order kaisay|kaise khareed|kese khareed|kaisay khareed|kaise lena|kese lena|kaisay lena|product kaise lena|product kese lena|product kaisay lena|khareedna kaise|khareedna kese|khareedna kaisay)/.test(
		value,
	);
}

function isSpinQuestion(text: string): boolean {
	const value = normalize(text);

	return /(spin|spin win|spin and win|wheel|reward)/.test(value);
}

function isThanks(text: string): boolean {
	const value = normalize(text);

	return /^(thanks|thank you|thx|shukriya|jazakallah|jazak allah|thankyou)$/.test(
		value,
	);
}

function isFarewell(text: string): boolean {
	const value = normalize(text);

	return /^(allah hafiz|khuda hafiz|bye|goodbye|see you)$/.test(value);
}

function hasBusinessQuestion(text: string): boolean {
	const value = normalize(text);

	return /(product|face wash|facewash|cleanser|serum|cream|hand cream|lotion|sunscreen|scrub|shampoo|acne|pimple|skin|price|order|delivery|shipping|coupon|discount|spin|reward|buy|purchase|cart|checkout)/.test(
		value,
	);
}

function getStaticReply(text: string): string | null {
	const language = detectLanguage(text);

	if (isFarewell(text)) return getFarewellReply(language);
	if (isThanks(text)) return getThanksReply(language);

	if (isHelloOnly(text)) return getHelloReply(language);
	if (isGreetingOnly(text)) return getGreetingReply(language);

	if (isHowAreYou(text)) return getHowAreYouReply(language);

	if (isIdentityQuestion(text)) return getIdentityReply(language);

	if (isPurchaseQuestion(text)) return getPurchaseReply(language);

	if (isSpinQuestion(text)) return getSpinReply(language);

	return null;
}

/* ============================================================
   STATIC STREAM
   ============================================================ */

function staticStream(text: string): Response {
	const encoder = new TextEncoder();

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(
				encoder.encode(
					`data: ${JSON.stringify({
						response: text,
					})}\n\n`,
				),
			);

			controller.enqueue(
				encoder.encode("data: [DONE]\n\n"),
			);

			controller.close();
		},
	});

	return new Response(stream, {
		headers: {
			"content-type": "text/event-stream; charset=utf-8",
			"cache-control": "no-cache",
			connection: "keep-alive",
		},
	});
}

/* ============================================================
   WOOCOMMERCE PRODUCT CACHE
   ============================================================ */

async function getWooCommerceProducts(env: Env): Promise<any[]> {
	const now = Date.now();

	if (productCache && productCache.expires > now) {
		return productCache.products;
	}

	if (productFetchPromise) {
		return productFetchPromise;
	}

	productFetchPromise = (async () => {
		try {
			const baseUrl =
				"https://theroyalbeautyhub.com/wp-json/wc/v3/products";

			const allProducts: any[] = [];

			for (let page = 1; page <= 5; page++) {
				const params = new URLSearchParams({
					status: "publish",
					per_page: "100",
					page: String(page),
				});

				const auth = btoa(
					`${env.WC_CONSUMER_KEY}:${env.WC_CONSUMER_SECRET}`,
				);

				const response = await fetch(
					`${baseUrl}?${params.toString()}`,
					{
						headers: {
							Authorization: `Basic ${auth}`,
							Accept: "application/json",
						},
					},
				);

				if (!response.ok) {
					console.error(
						"WooCommerce API error:",
						response.status,
						await response.text(),
					);

					if (productCache?.products?.length) {
						return productCache.products;
					}

					return [];
				}

				const products = (await response.json()) as any[];

				if (!products.length) break;

				allProducts.push(...products);

				if (products.length < 100) break;
			}

			const uniqueProducts = Array.from(
				new Map(
					allProducts.map((product) => [
						product.id,
						product,
					]),
				).values(),
			);

			productCache = {
				products: uniqueProducts,
				expires: Date.now() + PRODUCT_CACHE_TTL,
			};

			return uniqueProducts;
		} catch (error) {
			console.error(
				"WooCommerce connection error:",
				error,
			);

			if (productCache?.products?.length) {
				return productCache.products;
			}

			return [];
		} finally {
			productFetchPromise = null;
		}
	})();

	return productFetchPromise;
}

/* ============================================================
   PRODUCT TEXT
   ============================================================ */

function getText(product: any): string {
	const description =
		product.short_description ||
		product.description ||
		"";

	const categories = Array.isArray(product.categories)
		? product.categories
				.map((c: any) => c.name)
				.join(" ")
		: "";

	const tags = Array.isArray(product.tags)
		? product.tags
				.map((t: any) => t.name)
				.join(" ")
		: "";

	return normalize(
		[
			product.name || "",
			description,
			categories,
			tags,
		].join(" "),
	);
}

function formatProduct(product: any): string {
	const description =
		product.short_description ||
		product.description ||
		"";

	const cleanDescription = description
		.replace(/<[^>]*>/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 500);

	const categories = Array.isArray(product.categories)
		? product.categories
				.map((c: any) => c.name)
				.join(", ")
		: "";

	const tags = Array.isArray(product.tags)
		? product.tags
				.map((t: any) => t.name)
				.join(", ")
		: "";

	return [
		`PRODUCT ID: ${product.id}`,
		`EXACT PRODUCT NAME: ${product.name}`,
		`PRICE: ${product.price || "Not available"}`,
		`REGULAR PRICE: ${
			product.regular_price || "Not available"
		}`,
		`SALE PRICE: ${
			product.sale_price || "Not available"
		}`,
		`STOCK STATUS: ${
			product.stock_status || "Not available"
		}`,
		`CATEGORIES: ${categories || "Not available"}`,
		`TAGS: ${tags || "Not available"}`,
		`DESCRIPTION: ${
			cleanDescription || "Not available"
		}`,
		`PRODUCT URL: ${
			product.permalink || "Not available"
		}`,
	].join("\n");
}

/* ============================================================
   PRODUCT TYPE DETECTION
   ============================================================ */

type ProductType =
	| "facewash"
	| "cleanser"
	| "hand_cream"
	| "cream"
	| "serum"
	| "lotion"
	| "sunscreen"
	| "scrub"
	| "shampoo"
	| "none";

function detectProductTypeFromText(text: string): ProductType {
	const value = normalize(text);

	if (/(hand cream)/.test(value)) {
		return "hand_cream";
	}

	if (/(face wash|facewash|facial wash)/.test(value)) {
		return "facewash";
	}

	if (/\bcleanser\b/.test(value)) {
		return "cleanser";
	}

	if (/\bshampoo\b/.test(value)) {
		return "shampoo";
	}

	if (/\bsunscreen\b|\bspf\b/.test(value)) {
		return "sunscreen";
	}

	if (/(body scrub|face scrub|\bscrub\b)/.test(value)) {
		return "scrub";
	}

	if (/\bserum\b/.test(value)) {
		return "serum";
	}

	if (/\blotion\b/.test(value)) {
		return "lotion";
	}

	if (/\bcream\b/.test(value)) {
		return "cream";
	}

	return "none";
}

/*
 * Latest customer product request has priority.
 * We check recent user messages backwards.
 */

function detectLatestRequestedProductType(
	messages: ChatMessage[],
): ProductType {
	const userMessages = messages
		.filter((m) => m.role === "user")
		.slice(-5)
		.reverse();

	for (const message of userMessages) {
		const detected = detectProductTypeFromText(
			String(message.content || ""),
		);

		if (detected !== "none") {
			return detected;
		}
	}

	return "none";
}

/* ============================================================
   EXACT PRODUCT TYPE MATCHING
   ============================================================ */

function isFaceWash(product: any): boolean {
	const name = normalize(String(product.name || ""));

	if (
		name.includes("face wash") ||
		name.includes("facewash") ||
		name.includes("facial wash")
	) {
		return true;
	}

	const categories = Array.isArray(product.categories)
		? normalize(
				product.categories
					.map((c: any) => c.name || "")
					.join(" "),
			)
		: "";

	const tags = Array.isArray(product.tags)
		? normalize(
				product.tags
					.map((t: any) => t.name || "")
					.join(" "),
			)
		: "";

	return (
		(categories.includes("face wash") ||
			categories.includes("facewash") ||
			tags.includes("face wash") ||
			tags.includes("facewash")) &&
		!name.includes("cleanser")
	);
}

function isCleanser(product: any): boolean {
	const name = normalize(String(product.name || ""));

	if (
		name.includes("cleanser") ||
		name.includes("cleansing")
	) {
		return true;
	}

	const categories = Array.isArray(product.categories)
		? normalize(
				product.categories
					.map((c: any) => c.name || "")
					.join(" "),
			)
		: "";

	const tags = Array.isArray(product.tags)
		? normalize(
				product.tags
					.map((t: any) => t.name || "")
					.join(" "),
			)
		: "";

	return (
		(categories.includes("cleanser") ||
			tags.includes("cleanser")) &&
		!name.includes("face wash") &&
		!name.includes("facewash")
	);
}

function productMatchesType(
	product: any,
	type: ProductType,
): boolean {
	if (type === "none") return true;

	if (type === "facewash") {
		return isFaceWash(product);
	}

	if (type === "cleanser") {
		return isCleanser(product);
	}

	const text = getText(product);

	const keywords: Record<
		Exclude<ProductType, "none" | "facewash" | "cleanser">,
		string[]
	> = {
		hand_cream: ["hand cream"],
		cream: ["cream"],
		serum: ["serum"],
		lotion: ["lotion"],
		sunscreen: ["sunscreen", "sun screen", "spf"],
		scrub: ["scrub"],
		shampoo: ["shampoo"],
	};

	return (
		keywords[
			type as Exclude<
				ProductType,
				"none" | "facewash" | "cleanser"
			>
		] || []
	).some((keyword) => text.includes(keyword));
}

/* ============================================================
   SKIN CONCERN DETECTION
   ============================================================ */

type Concern =
	| "acne"
	| "oily"
	| "dry"
	| "sensitive"
	| "pigmentation"
	| "dullness"
	| "pores";

function detectConcerns(text: string): Concern[] {
	const value = normalize(text);

	const map: Record<Concern, string[]> = {
		acne: [
			"acne",
			"pimple",
			"pimples",
			"breakout",
			"breakouts",
			"munhase",
			"muhase",
		],

		oily: [
			"oily skin",
			"oily",
			"oil control",
			"extra oil",
			"excess oil",
		],

		dry: [
			"dry skin",
			"dry",
			"khushk skin",
			"khushk",
		],

		sensitive: [
			"sensitive skin",
			"sensitive",
		],

		pigmentation: [
			"pigmentation",
			"dark spots",
			"dark spot",
			"hyperpigmentation",
			"marks",
		],

		dullness: [
			"dull skin",
			"dullness",
			"dull",
			"brightening",
			"glow",
		],

		pores: [
			"open pores",
			"large pores",
			"pores",
		],
	};

	return Object.entries(map)
		.filter(([, words]) =>
			words.some((word) =>
				value.includes(word),
			),
		)
		.map(([concern]) => concern as Concern);
}

/*
 * These are STRICT evidence keywords.
 * Product is not considered suitable merely because
 * general skincare knowledge says it might be suitable.
 */

const CONCERN_EVIDENCE: Record<
	Concern,
	string[]
> = {
	acne: [
		"acne",
		"pimple",
		"blemish",
		"breakout",
		"salicylic",
		"acne prone",
	],

	oily: [
		"oily",
		"oil control",
		"excess oil",
		"oil free",
	],

	dry: [
		"dry skin",
		"dryness",
		"hydrating",
		"hydration",
		"moisturizing",
		"moisturiser",
		"moisturizer",
		"moisture",
		"hydrated",
	],

	sensitive: [
		"sensitive",
		"gentle",
		"calming",
		"soothing",
	],

	pigmentation: [
		"pigmentation",
		"dark spot",
		"dark spots",
		"hyperpigmentation",
	],

	dullness: [
		"dull",
		"brightening",
		"glow",
		"radiance",
	],

	pores: [
		"pores",
		"pore",
	],
};

function getConcernEvidenceScore(
	product: any,
	concerns: Concern[],
): number {
	if (!concerns.length) return 0;

	const text = getText(product);

	let score = 0;

	for (const concern of concerns) {
		const keywords =
			CONCERN_EVIDENCE[concern] || [];

		const matches = keywords.filter((keyword) =>
			text.includes(keyword),
		);

		if (matches.length === 0) {
			// No evidence for this concern
			return -100;
		}

		score += matches.length * 5;
	}

	return score;
}

/* ============================================================
   EXACT PRODUCT INTENT
   ============================================================ */

function getLatestRelevantUserText(
	messages: ChatMessage[],
): string {
	const userMessages = messages
		.filter((m) => m.role === "user")
		.slice(-5)
		.reverse();

	return (
		userMessages[0]?.content ||
		""
	);
}

/* ============================================================
   PRODUCT DATA BUILDER
   ============================================================ */

function buildRelevantProductData(
	products: any[],
	messages: ChatMessage[],
): string {
	const latestUserText =
		getLatestRelevantUserText(messages);

	const requestedType =
		detectLatestRequestedProductType(messages);

	/*
	 * Concern detection uses recent customer context,
	 * but latest request remains most important.
	 */

	const recentUserText = messages
		.filter((m) => m.role === "user")
		.slice(-4)
		.map((m) => String(m.content || ""))
		.join("\n");

	const latestConcerns =
		detectConcerns(latestUserText);

	const concerns =
		latestConcerns.length > 0
			? latestConcerns
			: detectConcerns(recentUserText);

	/*
	 * STEP 1:
	 * Strict product type filtering.
	 * NO fallback to unrelated products.
	 */

	let allowed =
		requestedType === "none"
			? [...products]
			: products.filter((product) =>
					productMatchesType(
						product,
						requestedType,
					),
				);

	/*
	 * Requested specific product type does not exist.
	 * Return explicit instruction to AI.
	 */

	if (
		requestedType !== "none" &&
		allowed.length === 0
	) {
		return `
STRICT CATALOGUE RESULT:
REQUESTED PRODUCT TYPE: ${requestedType}

NO EXACT MATCHING PRODUCT OF THIS TYPE WAS FOUND IN THE CURRENT WOOCommerce CATALOGUE.

MANDATORY RESPONSE RULE:
- Do not recommend unrelated products.
- Do not invent availability.
- Tell the customer that this requested product type is currently not confirmed as available at Royal Beauty Hub.
- Ask what other product category they would like help with.
`;
	}

	/*
	 * STEP 2:
	 * Strict skincare concern evidence.
	 */

	if (concerns.length > 0) {
		const concernMatched = allowed.filter(
			(product) =>
				getConcernEvidenceScore(
					product,
					concerns,
				) >= 0,
		);

		/*
		 * If customer specifically asks dry skin Face Wash,
		 * and no Face Wash has dry/hydrating evidence,
		 * DO NOT fallback to Retinol or random Face Wash.
		 */

		if (concernMatched.length === 0) {
			return `
STRICT CATALOGUE RESULT:
REQUESTED PRODUCT TYPE: ${
				requestedType || "not specifically stated"
			}
SKIN CONCERN: ${concerns.join(", ")}

NO PRODUCT IN THE CURRENT MATCHING PRODUCT TYPE HAS SUFFICIENT WOOCommerce DATA CONFIRMING SUITABILITY FOR THIS SKIN CONCERN.

MANDATORY RESPONSE RULE:
- Do not guess.
- Do not recommend a product based on general skincare knowledge.
- Do not recommend another unrelated product type.
- Clearly tell the customer that there is currently no catalogue-confirmed match for their exact request.
`;
		}

		allowed = concernMatched;
	}

	/*
	 * STEP 3:
	 * Score exact relevance.
	 */

	const queryTerms = normalize(
		latestUserText,
	)
		.split(" ")
		.filter(
			(word) =>
				word.length >= 4 &&
				![
					"mujhe",
					"chahiye",
					"product",
					"please",
				].includes(word),
		);

	const scored = allowed.map((product) => {
		const text = getText(product);
		const name = normalize(
			String(product.name || ""),
		);

		let score =
			getConcernEvidenceScore(
				product,
				concerns,
			) > 0
				? getConcernEvidenceScore(
						product,
						concerns,
					)
				: 0;

		for (const term of queryTerms) {
			if (name.includes(term)) {
				score += 6;
			} else if (text.includes(term)) {
				score += 1;
			}
		}

		return {
			product,
			score,
		};
	});

	scored.sort(
		(a, b) => b.score - a.score,
	);

	const selected = scored
		.slice(0, MAX_PRODUCTS_FOR_AI)
		.map((item) => item.product);

	if (!selected.length) {
		return `
STRICT CATALOGUE RESULT:
No confirmed matching WooCommerce products were found.

MANDATORY RESPONSE:
Do not guess or invent products.
`;
	}

	return `
MATCHING WOOCommerce PRODUCTS ONLY:

${selected
	.map(formatProduct)
	.join("\n--------------------\n")}
`;
}

/* ============================================================
   RECENT CONVERSATION
   ============================================================ */

function buildRecentMessages(
	messages: ChatMessage[],
): ChatMessage[] {
	return messages
		.filter(
			(message) =>
				message.role !== "system",
		)
		.slice(-MAX_HISTORY_MESSAGES)
		.map((message) => ({
			role: message.role,
			content: String(message.content).slice(
				0,
				1800,
			),
		}));
}

/* ============================================================
   WORKER
   ============================================================ */

export default {
	async fetch(
		request: Request,
		env: Env,
		_ctx: ExecutionContext,
	): Promise<Response> {
		const url = new URL(request.url);

		if (
			url.pathname === "/" ||
			!url.pathname.startsWith("/api/")
		) {
			return env.ASSETS.fetch(request);
		}

		if (url.pathname !== "/api/chat") {
			return new Response("Not found", {
				status: 404,
			});
		}

		if (request.method !== "POST") {
			return new Response(
				"Method not allowed",
				{
					status: 405,
				},
			);
		}

		return handleChatRequest(
			request,
			env,
		);
	},
} satisfies ExportedHandler<Env>;

/* ============================================================
   CHAT REQUEST
   ============================================================ */

async function handleChatRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	try {
		const body = (await request.json()) as {
			messages?: ChatMessage[];
		};

		const messages = Array.isArray(
			body.messages,
		)
			? body.messages
			: [];

		const latestUserMessage = [...messages]
			.reverse()
			.find(
				(message) =>
					message.role === "user",
			);

		const latestText = String(
			latestUserMessage?.content || "",
		).trim();

		if (!latestText) {
			return staticStream(
				"Ji 😊 Bataiye, main aapki kis cheez mein help kar sakta hoon?",
			);
		}

		/* ====================================================
		   ZERO-TOKEN AUTOMATION
		   ==================================================== */

		const staticReply =
			getStaticReply(latestText);

		/*
		 * Common greetings/questions get direct answers.
		 * Real product/business questions continue to AI.
		 */

		if (
			staticReply &&
			!(
				hasBusinessQuestion(latestText) &&
				!isPurchaseQuestion(latestText) &&
				!isSpinQuestion(latestText) &&
				!isIdentityQuestion(latestText) &&
				!isHowAreYou(latestText)
			)
		) {
			return staticStream(staticReply);
		}

		/* ====================================================
		   PRODUCT DATA DECISION
		   ==================================================== */

		const recentUserText = messages
			.filter(
				(message) =>
					message.role === "user",
			)
			.slice(-4)
			.map(
				(message) =>
					String(message.content || ""),
			)
			.join(" ");

		const needsProductData =
			/(product|face wash|facewash|cleanser|serum|cream|hand cream|lotion|sunscreen|scrub|shampoo|acne|pimple|skin|price|available|stock|buy|purchase|spf)/i.test(
				recentUserText,
			) ||
			latestText.length > 120;

		let products: any[] = [];

		if (needsProductData) {
			products =
				await getWooCommerceProducts(env);

			if (!products.length) {
				return new Response(
					JSON.stringify({
						error:
							"WooCommerce product catalogue is currently unavailable.",
					}),
					{
						status: 503,
						headers: {
							"content-type":
								"application/json",
						},
					},
				);
			}
		}

		const recentMessages =
			buildRecentMessages(messages);

		const productData =
			needsProductData
				? buildRelevantProductData(
						products,
						recentMessages,
					)
				: "Product catalogue not required for this request.";

		const language =
			detectLanguage(latestText);

		const languageInstruction =
			getLanguageInstruction(language);

		/* ====================================================
		   FINAL SYSTEM MESSAGE
		   ==================================================== */

		const systemMessage: ChatMessage = {
			role: "system",
			content: `${SYSTEM_PROMPT}

${languageInstruction}

${STORE_INFORMATION}

CURRENT CUSTOMER LANGUAGE:
${language}

CATALOGUE FOR THIS REQUEST:
${productData}

FINAL MANDATORY RULES:
1. Answer the customer's latest request.
2. Follow the required customer language exactly.
3. Roman Urdu must be Pakistani Roman Urdu, never Hindi-style wording.
4. Recommend only products supplied above.
5. If catalogue says NO EXACT MATCHING PRODUCT, do not recommend unrelated products.
6. If catalogue says NO CONFIRMED CONCERN MATCH, do not guess.
7. Never invent product availability or benefits.
8. Keep the answer concise and natural.`,
		};

		const conversationMessages: ChatMessage[] = [
			systemMessage,
			...recentMessages,
		];

		const inputs = {
			messages: conversationMessages,
			max_tokens: MAX_OUTPUT_TOKENS,
			stream: false,
			temperature: 0.2,
			top_p: 0.8,
		} satisfies AiTextGenerationInput & {
			stream: false;
		};

		const stream =
			await env.AI.run<typeof MODEL_ID>(
				MODEL_ID,
				inputs,
			);

		return new Response(stream, {
			headers: {
				"content-type":
					"text/event-stream; charset=utf-8",
				"cache-control": "no-cache",
				connection: "keep-alive",
			},
		});
	} catch (error) {
		console.error(
			"Error processing chat request:",
			error,
		);

		return new Response(
			JSON.stringify({
				error: "Failed to process request",
			}),
			{
				status: 500,
				headers: {
					"content-type":
						"application/json",
				},
			},
		);
	}
}
