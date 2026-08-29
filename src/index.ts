/**
 * =========================================================
 * ROYAL BEAUTY HUB
 * RBH AI ASSISTANT
 * VERSION V5
 * OPTIMIZED CLOUDFLARE WORKER
 * =========================================================
 *
 * CORE ARCHITECTURE:
 *
 * 1. COMMON CUSTOMER QUESTIONS
 *    -> Automation
 *    -> ZERO AI TOKENS
 *
 * 2. GREETINGS / SALAM / HOW ARE YOU
 *    -> Automation
 *    -> ZERO AI TOKENS
 *
 * 3. BUY / ORDER / CART / CHECKOUT QUESTIONS
 *    -> Automation
 *    -> ZERO AI TOKENS
 *
 * 4. PRODUCT AVAILABILITY
 *    -> WooCommerce
 *    -> Deterministic response where possible
 *
 * 5. PRODUCT PURCHASE INTENT
 *    -> Detect previous product context
 *    -> Correct buying guidance
 *    -> NEVER fake order confirmation
 *
 * 6. COMPLEX / UNMATCHED QUESTIONS
 *    -> Cloudflare AI fallback
 *
 * IMPORTANT:
 * Customer is already interacting on the RBH website.
 * Never tell the customer to "open the website first".
 * =========================================================
 */

export interface Env {
  AI: any;
  ASSETS: Fetcher;
  WC_CONSUMER_KEY: string;
  WC_CONSUMER_SECRET: string;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface WooProduct {
  id: number;
  name: string;
  price?: string;
  regular_price?: string;
  sale_price?: string;
  stock_status?: string;
  short_description?: string;
  description?: string;
  permalink?: string;

  categories?: Array<{
    name?: string;
  }>;

  tags?: Array<{
    name?: string;
  }>;

  attributes?: Array<{
    name?: string;
    options?: string[];
  }>;
}

/* =========================================================
   MODEL
   ========================================================= */

const MODEL_ID =
  "@cf/meta/llama-3.1-8b-instruct-fp8";

/* =========================================================
   FIRST MESSAGE INTRODUCTION
   ========================================================= */

const FIRST_MESSAGE_INTRO_ROMAN =
  "Main Royal Beauty Hub (RBH) ka official AI Assistant hoon. Main aapki products, skincare, orders aur store se related sawalon mein help kar sakta hoon. Bataiye, main aapki kis cheez mein madad karun?";

const FIRST_MESSAGE_INTRO_URDU =
  "میں Royal Beauty Hub (RBH) کا official AI Assistant ہوں۔ میں آپ کی products، skincare، orders اور store سے related سوالات میں مدد کر سکتا ہوں۔ بتائیے، میں آپ کی کس چیز میں مدد کروں؟";

const FIRST_MESSAGE_INTRO_ENGLISH =
  "I'm the official AI Assistant of Royal Beauty Hub (RBH). I can help you with products, skincare, orders and store-related questions. How can I help you?";

/* =========================================================
   SYSTEM PROMPT
   ========================================================= */

const SYSTEM_PROMPT = `
You are the official AI Assistant of Royal Beauty Hub (RBH), an online beauty and skincare store.

==================================================
IDENTITY
==================================================

- You are Royal Beauty Hub's official AI Assistant.
- Never claim to be human.
- Never pretend to be a live human agent.
- Be warm, natural, respectful and helpful.
- Speak like a Pakistani customer-care assistant.

==================================================
LANGUAGE
==================================================

- Understand English, Urdu and Roman Urdu.
- If customer uses Roman Urdu, reply in natural Pakistani Roman Urdu.
- If customer uses Urdu script, reply in Urdu.
- If customer uses English, reply in English.
- Mixed Roman Urdu and English is natural.
- Never use Hindi-style vocabulary.
- Use simple Pakistani conversational language.

==================================================
MOST IMPORTANT CONVERSATION RULE
==================================================

Always answer the customer's ACTUAL question first.

Never ignore the customer's message and give a generic reply instead.

Examples:

Customer:
"Kya haal hai?"

Correct behavior:
Answer naturally first.

Customer:
"Acne ke liye face wash chahiye"

Correct behavior:
Answer the product question first.

Customer:
"Shampoo chahiye"

Correct behavior:
Check actual supplied catalogue information.

==================================================
CUSTOMER IS ALREADY ON THE WEBSITE
==================================================

The customer is already interacting with you on the Royal Beauty Hub website.

Therefore NEVER say:

- "Website open karein"
- "Hamari website visit karein"
- "Pehle website par jayein"
- "Website khol kar phir search karein"

Instead say naturally:

- Product page par jayein
- Search Bar se product search karein
- Product select karein
- Add to Cart karein
- Cart se Checkout complete karein

==================================================
PRODUCT ACCURACY
==================================================

The supplied WooCommerce catalogue is the ONLY source of truth for RBH products.

- Only mention products present in the supplied catalogue.
- Never invent products.
- Never invent product names.
- Never invent prices.
- Never invent sizes.
- Never invent ingredients.
- Never invent stock.
- Never invent availability.
- Never invent benefits.
- Never assume a famous product is sold by RBH.

If a requested product is not in the supplied catalogue:

Clearly say that the product is currently not available in the RBH listing.

Do NOT:

- invent an alternative product
- force another category
- ask unnecessary questions about an unavailable category
- push Face Wash when customer asked for Shampoo
- recommend unrelated products

Only mention an alternative if the customer specifically asks for an alternative.

==================================================
PRODUCT CONSISTENCY
==================================================

Remember actual products mentioned in conversation history.

If customer says:

- woh wala
- jo pehle bataya
- pehle wala
- that one
- the product you mentioned

Use the actual conversation history.

Never silently replace one product with another similar product.

If unclear, ask for clarification.

==================================================
FACE WASH AND CLEANSER
==================================================

Face Wash and Cleanser are separate product types.

Respect the customer's latest explicit preference.

If customer explicitly wants only Face Wash:

Do not recommend Cleanser.

If customer explicitly wants only Cleanser:

Do not recommend Face Wash.

Never rename one product type as another.

==================================================
RECOMMENDATIONS
==================================================

- Recommend only real catalogue products.
- Prefer the most relevant product first.
- Do not overwhelm the customer.
- Use actual WooCommerce information.
- Never guarantee results.
- Never diagnose medical conditions.

==================================================
PURCHASE
==================================================

IMPORTANT:

Never claim:

- Product was added to cart
- Order was placed
- Payment was completed
- Order is confirmed

unless the actual application explicitly confirms it.

If customer wants to buy:

Guide them to:

1. Open/select the product page or use the Search Bar.
2. Tap/click Add to Cart.
3. Open Cart.
4. Proceed to Checkout.
5. Complete required details.
6. Confirm the order.

Never say that these actions already happened unless confirmed.

==================================================
ORDERS
==================================================

- Never invent order status.
- Never invent tracking information.
- Never invent delivery dates.

==================================================
COUPONS
==================================================

- Never invent coupon codes.
- Never invent discounts.
- Never reveal internal/private coupon codes.

==================================================
SPIN & WIN
==================================================

Official Spin & Win process:

1. Add an eligible product to cart.
2. Spin & Win becomes unlocked.
3. Open Spin & Win.
4. Spin the wheel.
5. Wheel determines the reward.
6. Reward is automatically applied to the cart.
7. No manual coupon entry is required.
8. One Spin & Win chance is available every 24 hours.

Never:

- reveal internal coupon codes
- promise a reward before spinning
- claim customer won unless website confirms it
- invent extra Spin & Win rules

==================================================
HONESTY
==================================================

Never fabricate information.

Never pretend you performed an action that you did not perform.

If information is unavailable, clearly say it is unavailable.

==================================================
RESPONSE LENGTH
==================================================

Keep normal replies concise and useful.

Do not repeat unnecessary information.

Answer simple questions simply.
`;

/* =========================================================
   OFFICIAL STORE INFORMATION
   ========================================================= */

const STORE_INFORMATION = `
ROYAL BEAUTY HUB - OFFICIAL STORE INFORMATION

SPIN & WIN:

1. Customer adds an eligible product to cart.
2. Spin & Win becomes unlocked.
3. Customer opens Spin & Win.
4. Customer spins the wheel.
5. Wheel determines the available reward.
6. Reward is automatically applied to cart.
7. No manual coupon entry is required.
8. One Spin & Win chance is available every 24 hours.
`;

/* =========================================================
   AUTOMATION INTENTS
   ========================================================= */

type AutomationIntent =
  | "spin_info"
  | "spin_coupon"
  | "spin_reward"
  | "order_how"
  | "buy_how"
  | "add_to_cart"
  | "checkout_how"
  | "ai_identity"
  | "none";

/* =========================================================
   TEXT NORMALIZATION
   ========================================================= */

function normalizeText(text: string): string {
  return String(text || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[!?.,،۔:;()[\]{}"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* =========================================================
   LANGUAGE DETECTION
   ========================================================= */

function detectLanguage(
  text: string
): "roman" | "urdu" | "english" {
  const value = String(text || "");

  if (/[\u0600-\u06FF]/.test(value)) {
    return "urdu";
  }

  const lower = value.toLowerCase();

  const romanWords = [
    "kaise",
    "kese",
    "kaisay",
    "karna",
    "karun",
    "chahiye",
    "hai",
    "hain",
    "mujhe",
    "mujh",
    "aap",
    "kya",
    "kyun",
    "batao",
    "batayein",
    "lena",
    "layna",
    "buy",
    "order"
  ];

  const score = romanWords.reduce(
    (total, word) =>
      total + (lower.includes(word) ? 1 : 0),
    0
  );

  return score > 0
    ? "roman"
    : "english";
}

/* =========================================================
   LANGUAGE RESPONSE HELPERS
   ========================================================= */

function getFirstMessageIntro(
  language: "roman" | "urdu" | "english"
): string {
  if (language === "urdu") {
    return FIRST_MESSAGE_INTRO_URDU;
  }

  if (language === "english") {
    return FIRST_MESSAGE_INTRO_ENGLISH;
  }

  return FIRST_MESSAGE_INTRO_ROMAN;
}

function appendFirstMessageIntro(
  response: string,
  isNewConversation: boolean,
  language: "roman" | "urdu" | "english"
): string {
  if (!isNewConversation) {
    return response;
  }

  const intro =
    getFirstMessageIntro(language);

  if (
    normalizeText(response).includes(
      normalizeText("official AI Assistant")
    )
  ) {
    return response;
  }

  return `${response}\n\n${intro}`;
}

/* =========================================================
   WORD MATCHING
   ========================================================= */

function hasAny(
  text: string,
  words: string[]
): boolean {
  return words.some((word) =>
    text.includes(word)
  );
}

/* =========================================================
   GREETING DETECTION
   ========================================================= */

function isGreetingOrCasual(
  text: string
): boolean {
  const value = normalizeText(text);

  const greetings = [
    "hi",
    "hello",
    "hey",
    "salam",
    "aoa",
    "assalam o alaikum",
    "assalamualaikum",
    "assalamu alaikum",
    "kya haal hai",
    "kaise ho",
    "kese ho",
    "kaisay ho",
    "theek ho",
    "sab theek",
    "allah hafiz",
    "jazakallah",
    "thanks",
    "thank you",
    "shukriya"
  ];

  return greetings.includes(value);
}

/* =========================================================
   GREETING RESPONSE
   ========================================================= */

function getGreetingResponse(
  text: string,
  language: "roman" | "urdu" | "english"
): string | null {
  const value = normalizeText(text);

  if (!isGreetingOrCasual(value)) {
    return null;
  }

  const salamWords = [
    "salam",
    "aoa",
    "assalam o alaikum",
    "assalamualaikum",
    "assalamu alaikum"
  ];

  if (salamWords.includes(value)) {
    if (language === "urdu") {
      return "وعلیکم السلام! 😊";
    }

    if (language === "english") {
      return "Wa Alaikum Assalam! 😊";
    }

    return "Wa Alaikum Assalam! 😊";
  }

  const howAreYou = [
    "kya haal hai",
    "kaise ho",
    "kese ho",
    "kaisay ho",
    "theek ho",
    "sab theek"
  ];

  if (howAreYou.includes(value)) {
    if (language === "urdu") {
      return "الحمدللہ، میں ٹھیک ہوں 😊 آپ سنائیں، آپ کیسے ہیں؟";
    }

    if (language === "english") {
      return "Alhamdulillah, I'm doing well 😊 How are you?";
    }

    return "Alhamdulillah, main theek hoon 😊 Aap sunayein, aap kaise hain?";
  }

  if (value === "allah hafiz") {
    if (language === "urdu") {
      return "اللہ حافظ! 😊 اپنا خیال رکھیے۔";
    }

    return "Allah Hafiz! 😊 Apna khayal rakhein.";
  }

  if (
    value === "thanks" ||
    value === "thank you" ||
    value === "shukriya" ||
    value === "jazakallah"
  ) {
    if (language === "urdu") {
      return "Bohat shukriya! 😊";
    }

    if (language === "english") {
      return "You're most welcome! 😊";
    }

    return "Aapka bohat shukriya! 😊";
  }

  if (language === "english") {
    return "Hello! 😊";
  }

  if (language === "urdu") {
    return "السلام علیکم! 😊";
  }

  return "Hello! 😊";
}

/* =========================================================
   PRODUCT QUERY DETECTION
   ========================================================= */

function looksLikeProductQuery(
  text: string
): boolean {
  const value = normalizeText(text);

  const words = [
    "product",
    "face wash",
    "facewash",
    "cleanser",
    "cream",
    "serum",
    "lotion",
    "sunscreen",
    "sun screen",
    "shampoo",
    "hair oil",
    "oil",
    "moisturizer",
    "moisturiser",
    "acne",
    "pimple",
    "pimples",
    "dry skin",
    "oily skin",
    "sensitive skin",
    "pigmentation",
    "dark spots",
    "glow",
    "price",
    "kitne ka",
    "kitnay ka"
  ];

  return hasAny(value, words);
}

/* =========================================================
   AUTOMATION DETECTION
   ========================================================= */

function detectAutomationIntent(
  currentMessage: string
): AutomationIntent {
  const value =
    normalizeText(currentMessage);

  /* SPIN & WIN */

  if (
    hasAny(value, [
      "spin & win",
      "spin and win",
      "spin win",
      "spin to win",
      "spin2win",
      "spin wheel"
    ])
  ) {
    if (
      hasAny(value, [
        "coupon",
        "coupon code",
        "promo code",
        "discount code",
        "code"
      ])
    ) {
      return "spin_coupon";
    }

    if (
      hasAny(value, [
        "reward",
        "prize",
        "kya milega",
        "kya jeet",
        "what will i win",
        "what do i get"
      ])
    ) {
      return "spin_reward";
    }

    return "spin_info";
  }

  /* AI IDENTITY */

  if (
    hasAny(value, [
      "tum kon ho",
      "tum kaun ho",
      "aap kon ho",
      "aap kaun ho",
      "who are you",
      "what are you",
      "tum kya ho",
      "aap kya ho",
      "human ho",
      "insan ho",
      "real person ho",
      "ai ho"
    ])
  ) {
    return "ai_identity";
  }

  /*
   * IMPORTANT:
   *
   * Buying instructions should trigger even if
   * customer mentions "product".
   *
   * Previous V4/V1 style logic incorrectly blocked
   * some buying queries because product words existed.
   */

  /* ORDER HOW */

  if (
    hasAny(value, [
      "order kaise",
      "order kese",
      "order kaisay",
      "how to order",
      "how can i order",
      "how do i order",
      "order place kaise",
      "order dena kaise",
      "order kis tarah"
    ])
  ) {
    return "order_how";
  }

  /* BUY HOW */

  if (
    hasAny(value, [
      "buy kaise",
      "buy kese",
      "buy kaisay",
      "how to buy",
      "how can i buy",
      "how do i buy",
      "purchase kaise",
      "purchase kese",
      "product kaise loon",
      "product kese loon",
      "product kaisay loon",
      "kaise khareed",
      "kese khareed",
      "khareedna kaise"
    ])
  ) {
    return "buy_how";
  }

  /* ADD TO CART */

  if (
    hasAny(value, [
      "add to cart kaise",
      "cart mein add kaise",
      "cart me add kaise",
      "cart mein kaise add",
      "cart me kaise add",
      "how to add to cart",
      "how do i add to cart"
    ])
  ) {
    return "add_to_cart";
  }

  /* CHECKOUT */

  if (
    hasAny(value, [
      "checkout kaise",
      "checkout kese",
      "checkout kaisay",
      "how to checkout",
      "how do i checkout",
      "checkout process"
    ])
  ) {
    return "checkout_how";
  }

  return "none";
}

/* =========================================================
   AUTOMATED RESPONSES
   ========================================================= */

function getAutomationResponse(
  intent: AutomationIntent,
  language: "roman" | "urdu" | "english"
): string | null {
  if (language === "urdu") {
    switch (intent) {
      case "spin_info":
        return "Spin & Win 🎡 ek special reward feature hai۔ پہلے کوئی eligible product Cart میں Add کریں، پھر Spin & Win unlock ہو جائے گا۔ Wheel spin کریں اور جو reward wheel دے گا وہ automatically Cart میں apply ہو جائے گا۔ Coupon code manually enter کرنے کی ضرورت نہیں۔ ہر 24 گھنٹے میں 1 spin chance ملتا ہے۔ 🎁";

      case "spin_coupon":
        return "Spin & Win کا coupon code manually enter نہیں کرنا ہوتا۔ Eligible product Cart میں Add کریں، پھر Spin & Win unlock کرکے wheel spin کریں۔ Applicable reward automatically Cart میں apply ہو جائے گا۔ 🎁";

      case "spin_reward":
        return "Spin & Win کا reward پہلے سے confirm نہیں کیا جا سکتا۔ Wheel spin ہونے کے بعد available reward determine ہوتا ہے۔ 🎡🎁";

      case "order_how":
      case "buy_how":
        return "Kisi bhi product ko buy karne ke liye product page par jayein ya Search Bar se apna desired product search karein۔ Product select karke Add to Cart karein، phir Cart mein ja kar Checkout karein aur required details complete karke order confirm kar dein۔ 😊";

      case "add_to_cart":
        return "Product select karke uske product page par Add to Cart button par tap/click karein۔ Product Cart mein add ho jayega، phir aap Checkout continue kar sakte hain۔";

      case "checkout_how":
        return "Pehle product Cart mein Add karein، phir Cart open karke Checkout par jayein۔ Required details complete karke order confirm kar dein۔";

      case "ai_identity":
        return "Main Royal Beauty Hub (RBH) ka official AI Assistant hoon۔ 😊 Main products، skincare، orders aur store se related sawalon mein help kar sakta hoon۔";

      default:
        return null;
    }
  }

  if (language === "english") {
    switch (intent) {
      case "spin_info":
        return "Spin & Win 🎡 is a special reward feature. Add an eligible product to your Cart first, then Spin & Win will unlock. Spin the wheel and the available reward will automatically be applied to your Cart. No manual coupon entry is required. You get 1 chance every 24 hours. 🎁";

      case "spin_coupon":
        return "You don't need to enter a Spin & Win coupon code manually. Add an eligible product to your Cart, unlock Spin & Win and spin the wheel. The applicable reward will automatically be applied to your Cart. 🎁";

      case "spin_reward":
        return "The Spin & Win reward cannot be confirmed before spinning. The wheel determines the available reward. 🎡🎁";

      case "order_how":
      case "buy_how":
        return "To buy any product, go to its product page or use the Search Bar to find your desired product. Select it, tap Add to Cart, then open your Cart, proceed to Checkout and complete the required details to confirm your order. 😊";

      case "add_to_cart":
        return "Select the product and tap the Add to Cart button on its product page. It will then appear in your Cart and you can continue to Checkout.";

      case "checkout_how":
        return "First add the product to your Cart, then open your Cart and proceed to Checkout. Complete the required details and confirm your order.";

      case "ai_identity":
        return "I'm the official AI Assistant of Royal Beauty Hub (RBH). 😊 I can help you with products, skincare, orders and store-related questions.";

      default:
        return null;
    }
  }

  /* ROMAN URDU */

  switch (intent) {
    case "spin_info":
      return "Spin & Win 🎡 ek special reward feature hai. Pehle koi eligible product Cart mein Add karein, phir Spin & Win unlock ho jayega. Wheel spin karein aur jo reward wheel dega woh automatically Cart mein apply ho jayega. Coupon code manually enter karne ki zarurat nahi. Har 24 ghantay mein 1 spin chance milta hai. 🎁";

    case "spin_coupon":
      return "Spin & Win ka coupon code manually enter nahi karna hota. Pehle eligible product Cart mein Add karein, phir Spin & Win unlock karke wheel spin karein. Jo applicable reward hoga woh automatically Cart mein apply ho jayega. 🎁";

    case "spin_reward":
      return "Spin & Win ka reward pehle se confirm nahi kiya ja sakta. Wheel spin hone ke baad available reward determine hota hai. 🎡🎁";

    case "order_how":
    case "buy_how":
      return "Kisi bhi product ko buy karne ke liye product page par jayein ya Search Bar se apna desired product search karein. Product select karke Add to Cart karein, phir Cart mein ja kar Checkout karein aur required details complete karke order confirm kar dein. 😊";

    case "add_to_cart":
      return "Product select karke uske product page par Add to Cart button par tap/click karein. Product Cart mein add ho jayega, phir aap Checkout continue kar sakte hain.";

    case "checkout_how":
      return "Pehle product Cart mein Add karein, phir Cart open karke Checkout par jayein. Required details complete karke order confirm kar dein.";

    case "ai_identity":
      return "Main Royal Beauty Hub (RBH) ka official AI Assistant hoon. 😊 Main aapko products, skincare, orders aur store se related sawalon mein help kar sakta hoon.";

    default:
      return null;
  }
}

/* =========================================================
   PURCHASE INTENT DETECTION
   ========================================================= */

function isPurchaseIntent(
  text: string
): boolean {
  const value =
    normalizeText(text);

  /*
   * Clear positive / buying intent.
   */

  const purchaseWords = [
    "buy karna hai",
    "buy karunga",
    "buy karungi",
    "mujhe buy karna hai",
    "main buy karna chahta hoon",
    "main buy karna chahti hoon",
    "lena hai",
    "mujhe lena hai",
    "yeh lena hai",
    "ye lena hai",
    "order karna hai",
    "mujhe order karna hai",
    "haan buy karna hai",
    "han buy karna hai",
    "yes buy",
    "i want to buy",
    "i want this",
    "i want to order",
    "i want it"
  ];

  return hasAny(value, purchaseWords);
}

/* =========================================================
   WOO COMMERCE
   ========================================================= */

async function getWooCommerceProducts(
  env: Env
): Promise<WooProduct[]> {
  try {
    const baseUrl =
      "https://theroyalbeautyhub.com/wp-json/wc/v3/products";

    const auth = btoa(
      `${env.WC_CONSUMER_KEY}:${env.WC_CONSUMER_SECRET}`
    );

    const allProducts: WooProduct[] =
      [];

    /*
     * Maximum 300 products.
     */

    for (
      let page = 1;
      page <= 3;
      page++
    ) {
      const params =
        new URLSearchParams();

      params.set("status", "publish");
      params.set("per_page", "100");
      params.set("page", String(page));

      const response =
        await fetch(
          `${baseUrl}?${params.toString()}`,
          {
            method: "GET",
            headers: {
              Authorization:
                `Basic ${auth}`,
              Accept:
                "application/json"
            }
          }
        );

      if (!response.ok) {
        console.error(
          "WooCommerce API error:",
          response.status
        );

        return [];
      }

      const products =
        await response.json()
          as WooProduct[];

      if (
        !Array.isArray(products) ||
        !products.length
      ) {
        break;
      }

      allProducts.push(
        ...products
      );

      if (products.length < 100) {
        break;
      }
    }

    return Array.from(
      new Map(
        allProducts.map(
          (product) => [
            product.id,
            product
          ]
        )
      ).values()
    );
  } catch (error) {
    console.error(
      "WooCommerce connection error:",
      error
    );

    return [];
  }
}

/* =========================================================
   HTML STRIPPER
   ========================================================= */

function stripHtml(
  value: string
): string {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* =========================================================
   PRODUCT SEARCH TEXT
   ========================================================= */

function getProductSearchText(
  product: WooProduct
): string {
  return [
    product.name || "",
    product.short_description || "",
    product.description || "",

    Array.isArray(product.categories)
      ? product.categories
          .map(
            (category) =>
              category.name || ""
          )
          .join(" ")
      : "",

    Array.isArray(product.tags)
      ? product.tags
          .map(
            (tag) =>
              tag.name || ""
          )
          .join(" ")
      : ""
  ]
    .join(" ")
    .toLowerCase();
}

/* =========================================================
   REQUESTED PRODUCT CATEGORY DETECTION
   ========================================================= */

type RequestedCategory =
  | "shampoo"
  | "hair_oil"
  | "sunscreen"
  | "facewash"
  | "cleanser"
  | "serum"
  | "cream"
  | "lotion"
  | "none";

function detectRequestedCategory(
  text: string
): RequestedCategory {
  const value =
    normalizeText(text);

  if (
    hasAny(value, [
      "shampoo",
      "shampo"
    ])
  ) {
    return "shampoo";
  }

  if (
    hasAny(value, [
      "hair oil",
      "hairoil"
    ])
  ) {
    return "hair_oil";
  }

  if (
    hasAny(value, [
      "sunscreen",
      "sun screen",
      "spf"
    ])
  ) {
    return "sunscreen";
  }

  if (
    hasAny(value, [
      "face wash",
      "facewash",
      "facial wash"
    ])
  ) {
    return "facewash";
  }

  if (
    hasAny(value, [
      "cleanser",
      "cleansing"
    ])
  ) {
    return "cleanser";
  }

  if (
    value.includes("serum")
  ) {
    return "serum";
  }

  if (
    hasAny(value, [
      "cream",
      "beauty cream"
    ])
  ) {
    return "cream";
  }

  if (
    hasAny(value, [
      "lotion",
      "moisturizer",
      "moisturiser"
    ])
  ) {
    return "lotion";
  }

  return "none";
}

/* =========================================================
   CATEGORY MATCH
   ========================================================= */

function productMatchesCategory(
  product: WooProduct,
  category: RequestedCategory
): boolean {
  const text =
    getProductSearchText(product);

  switch (category) {
    case "shampoo":
      return text.includes("shampoo");

    case "hair_oil":
      return (
        text.includes("hair oil") ||
        (
          text.includes("hair") &&
          text.includes("oil")
        )
      );

    case "sunscreen":
      return (
        text.includes("sunscreen") ||
        text.includes("sun screen")
      );

    case "facewash":
      return (
        text.includes("face wash") ||
        text.includes("facewash") ||
        text.includes("facial wash")
      );

    case "cleanser":
      return (
        text.includes("cleanser") ||
        text.includes("cleansing")
      );

    case "serum":
      return text.includes("serum");

    case "cream":
      return text.includes("cream");

    case "lotion":
      return (
        text.includes("lotion") ||
        text.includes("moisturizer") ||
        text.includes("moisturiser")
      );

    default:
      return false;
  }
}

/* =========================================================
   UNAVAILABLE PRODUCT RESPONSE
   ========================================================= */

function getUnavailableProductResponse(
  category: RequestedCategory,
  language: "roman" | "urdu" | "english"
): string {
  const names: Record<
    RequestedCategory,
    string
  > = {
    shampoo: "Shampoo",
    hair_oil: "Hair Oil",
    sunscreen: "Sunscreen",
    facewash: "Face Wash",
    cleanser: "Cleanser",
    serum: "Serum",
    cream: "Cream",
    lotion: "Lotion",
    none: "Yeh product"
  };

  const productName =
    names[category];

  if (language === "urdu") {
    return `Sorry, hamari current product listing mein ${productName} abhi available nahi hai۔`;
  }

  if (language === "english") {
    return `Sorry, ${productName} is currently not available in our product listing.`;
  }

  return `Sorry, hamari current product listing mein ${productName} abhi available nahi hai.`;
}

/* =========================================================
   PRODUCT FORMATTER
   ========================================================= */

function formatProduct(
  product: WooProduct
): string {
  const description =
    stripHtml(
      product.short_description ||
      product.description ||
      ""
    ).slice(0, 450);

  const categories =
    Array.isArray(product.categories)
      ? product.categories
          .map(
            (category) =>
              category.name || ""
          )
          .join(", ")
      : "";

  const tags =
    Array.isArray(product.tags)
      ? product.tags
          .map(
            (tag) =>
              tag.name || ""
          )
          .join(", ")
      : "";

  return `
PRODUCT ID: ${product.id}
EXACT PRODUCT NAME: ${product.name}
PRICE: ${product.price || "Not available"}
REGULAR PRICE: ${product.regular_price || "Not available"}
SALE PRICE: ${product.sale_price || "Not available"}
STOCK STATUS: ${product.stock_status || "Not available"}
CATEGORIES: ${categories || "Not available"}
TAGS: ${tags || "Not available"}
DESCRIPTION: ${description || "Not available"}
PRODUCT URL: ${product.permalink || "Not available"}
`;
}

/* =========================================================
   PRODUCT TYPE
   ========================================================= */

function detectProductType(
  text: string
): "facewash" | "cleanser" | "both" | "none" {
  const value =
    normalizeText(text);

  const faceWash =
    /\b(face\s*wash|facewash|facial\s*wash)\b/i.test(
      value
    );

  const cleanser =
    /\b(cleanser|cleansing)\b/i.test(
      value
    );

  if (faceWash && cleanser) {
    return "both";
  }

  if (faceWash) {
    return "facewash";
  }

  if (cleanser) {
    return "cleanser";
  }

  return "none";
}

/* =========================================================
   STRICT PREFERENCE
   ========================================================= */

function detectStrictPreference(
  text: string
): "facewash" | "cleanser" | "none" {
  const value =
    normalizeText(text);

  const strict =
    /\b(sirf|only|just)\b/i.test(
      value
    );

  const faceWash =
    /\b(face\s*wash|facewash)\b/i.test(
      value
    );

  const cleanser =
    /\bcleanser\b/i.test(
      value
    );

  const cleanserRejected =
    /\bcleanser\s*(nahi|nahin|na)\b/i.test(
      value
    );

  const faceWashRejected =
    /\bface\s*wash\s*(nahi|nahin|na)\b/i.test(
      value
    );

  if (
    faceWash &&
    (strict || cleanserRejected)
  ) {
    return "facewash";
  }

  if (
    cleanser &&
    (strict || faceWashRejected)
  ) {
    return "cleanser";
  }

  return "none";
}

/* =========================================================
   FACE WASH CHECK
   ========================================================= */

function isFaceWash(
  product: WooProduct
): boolean {
  const name =
    String(product.name || "")
      .toLowerCase();

  return (
    name.includes("face wash") ||
    name.includes("facewash") ||
    name.includes("facial wash")
  );
}

/* =========================================================
   CLEANSER CHECK
   ========================================================= */

function isCleanser(
  product: WooProduct
): boolean {
  const name =
    String(product.name || "")
      .toLowerCase();

  return (
    name.includes("cleanser") ||
    name.includes("cleansing")
  );
}

/* =========================================================
   CONCERNS
   ========================================================= */

function detectConcerns(
  text: string
): string[] {
  const value =
    normalizeText(text);

  const concerns: string[] =
    [];

  const concernWords: Record<
    string,
    string[]
  > = {
    acne: [
      "acne",
      "pimple",
      "pimples",
      "muhase",
      "munhase",
      "breakout"
    ],

    oily: [
      "oily",
      "oily skin",
      "oil control"
    ],

    dry: [
      "dry",
      "dry skin",
      "dryness",
      "khushk"
    ],

    sensitive: [
      "sensitive",
      "sensitive skin"
    ],

    pigmentation: [
      "pigmentation",
      "dark spot",
      "dark spots",
      "hyperpigmentation"
    ],

    dullness: [
      "dull",
      "dullness",
      "glow",
      "brightening"
    ],

    pores: [
      "pores",
      "open pores"
    ]
  };

  for (
    const [concern, words]
    of Object.entries(concernWords)
  ) {
    if (
      words.some(
        (word) =>
          value.includes(word)
      )
    ) {
      concerns.push(concern);
    }
  }

  return concerns;
}

/* =========================================================
   CONCERN SCORE
   ========================================================= */

function concernScore(
  product: WooProduct,
  concerns: string[]
): number {
  if (!concerns.length) {
    return 0;
  }

  const text =
    getProductSearchText(product);

  const keywords: Record<
    string,
    string[]
  > = {
    acne: [
      "acne",
      "blemish",
      "pimple",
      "breakout",
      "salicylic",
      "benzoyl peroxide"
    ],

    oily: [
      "oily",
      "oil control"
    ],

    dry: [
      "dry",
      "hydrating",
      "hydration",
      "hyaluronic"
    ],

    sensitive: [
      "sensitive",
      "gentle"
    ],

    pigmentation: [
      "pigmentation",
      "dark spot",
      "hyperpigmentation"
    ],

    dullness: [
      "dull",
      "brightening",
      "glow"
    ],

    pores: [
      "pores"
    ]
  };

  let score = 0;

  for (const concern of concerns) {
    for (
      const word of
      keywords[concern] || []
    ) {
      if (text.includes(word)) {
        score++;
      }
    }
  }

  return score;
}

/* =========================================================
   RELEVANT PRODUCT DATA
   ========================================================= */

function buildRelevantProductData(
  products: WooProduct[],
  conversationText: string
): string {
  const productType =
    detectProductType(
      conversationText
    );

  const strictPreference =
    detectStrictPreference(
      conversationText
    );

  const concerns =
    detectConcerns(
      conversationText
    );

  let allowedProducts =
    products;

  if (
    strictPreference === "facewash"
  ) {
    allowedProducts =
      products.filter(isFaceWash);
  } else if (
    strictPreference === "cleanser"
  ) {
    allowedProducts =
      products.filter(isCleanser);
  } else if (
    productType === "facewash"
  ) {
    allowedProducts =
      products.filter(isFaceWash);
  } else if (
    productType === "cleanser"
  ) {
    allowedProducts =
      products.filter(isCleanser);
  } else if (
    productType === "both"
  ) {
    allowedProducts =
      products.filter(
        (product) =>
          isFaceWash(product) ||
          isCleanser(product)
      );
  }

  const scoredProducts =
    allowedProducts.map(
      (product) => ({
        product,
        score: concernScore(
          product,
          concerns
        )
      })
    );

  scoredProducts.sort(
    (a, b) =>
      b.score - a.score
  );

  /*
   * Keep AI catalogue context small.
   */

  const limit =
    productType === "none"
      ? 18
      : 12;

  const limited =
    scoredProducts
      .slice(0, limit)
      .map(
        (item) =>
          item.product
      );

  if (!limited.length) {
    return "No matching WooCommerce products were found.";
  }

  return limited
    .map(formatProduct)
    .join(
      "\n==============================\n"
    );
}

/* =========================================================
   FIND PRODUCT FROM CONVERSATION
   ========================================================= */

function findLastConversationProduct(
  products: WooProduct[],
  messages: ChatMessage[]
): WooProduct | null {
  /*
   * Search newest messages first.
   */

  const relevantMessages =
    [...messages]
      .reverse()
      .filter(
        (message) =>
          message.role === "assistant" ||
          message.role === "user"
      );

  for (
    const message of relevantMessages
  ) {
    const content =
      normalizeText(message.content);

    for (const product of products) {
      const productName =
        normalizeText(product.name);

      if (
        productName &&
        content.includes(productName)
      ) {
        return product;
      }
    }
  }

  return null;
}

/* =========================================================
   PURCHASE RESPONSE
   ========================================================= */

function getPurchaseResponse(
  product: WooProduct | null,
  language: "roman" | "urdu" | "english"
): string {
  if (!product) {
    if (language === "english") {
      return "Sure 😊 Please select the product you want to buy, tap Add to Cart, then open your Cart and proceed to Checkout to complete your order.";
    }

    if (language === "urdu") {
      return "بالکل 😊 اپنا desired product select کریں، Add to Cart کریں، پھر Cart کھول کر Checkout complete کریں اور required details fill کرکے order confirm کریں۔";
    }

    return "Bilkul 😊 Apna desired product select karein, Add to Cart karein, phir Cart open karke Checkout complete karein aur required details fill karke order confirm kar dein.";
  }

  const productName =
    product.name;

  if (language === "english") {
    return `Sure 😊 To buy ${productName}, open its product page, tap Add to Cart, then open your Cart and proceed to Checkout to complete the required details and confirm your order.`;
  }

  if (language === "urdu") {
    return `بالکل 😊 ${productName} buy کرنے کے لیے product page پر Add to Cart کریں، پھر Cart کھول کر Checkout complete کریں اور required details fill کرکے order confirm کریں۔`;
  }

  return `Bilkul 😊 ${productName} buy karne ke liye product page par Add to Cart karein, phir Cart open karke Checkout complete karein aur required details fill karke order confirm kar dein.`;
}

/* =========================================================
   JSON RESPONSE
   ========================================================= */

function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: Record<
    string,
    string
  > = {}
): Response {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        "content-type":
          "application/json; charset=utf-8",

        "cache-control":
          "no-cache",

        ...extraHeaders
      }
    }
  );
}

/* =========================================================
   CHAT REQUEST
   ========================================================= */

async function handleChatRequest(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const body =
      await request.json() as {
        messages?: ChatMessage[];
      };

    const messages =
      Array.isArray(body.messages)
        ? body.messages
        : [];

    const userMessages =
      messages.filter(
        (message) =>
          message.role === "user"
      );

    const currentUserMessage =
      userMessages[
        userMessages.length - 1
      ]?.content || "";

    if (!currentUserMessage) {
      return jsonResponse(
        {
          error:
            "Message is required."
        },
        400
      );
    }

    const language =
      detectLanguage(
        currentUserMessage
      );

    /*
     * A conversation is considered new if no assistant
     * response exists yet.
     */

    const hasPreviousAssistantMessage =
      messages.some(
        (message) =>
          message.role === "assistant"
      );

    const isNewConversation =
      !hasPreviousAssistantMessage;

    /* =====================================================
       LAYER 1
       GREETING / CASUAL AUTOMATION
       ZERO AI TOKENS
       ===================================================== */

    const greetingResponse =
      getGreetingResponse(
        currentUserMessage,
        language
      );

    if (greetingResponse) {
      const response =
        appendFirstMessageIntro(
          greetingResponse,
          isNewConversation,
          language
        );

      return jsonResponse({
        response
      });
    }

    /* =====================================================
       LAYER 2
       COMMON AUTOMATION
       ZERO AI TOKENS
       ===================================================== */

    const automationIntent =
      detectAutomationIntent(
        currentUserMessage
      );

    const automatedResponse =
      getAutomationResponse(
        automationIntent,
        language
      );

    if (automatedResponse) {
      const response =
        appendFirstMessageIntro(
          automatedResponse,
          isNewConversation,
          language
        );

      return jsonResponse({
        response
      });
    }

    /* =====================================================
       FROM HERE:
       PRODUCT / PURCHASE / COMPLEX QUESTION
       MAY REQUIRE WOO DATA
       ===================================================== */

    const products =
      await getWooCommerceProducts(
        env
      );

    if (!products.length) {
      return jsonResponse(
        {
          error:
            "WooCommerce product catalogue is currently unavailable."
        },
        503
      );
    }

    /* =====================================================
       LAYER 3
       PURCHASE INTENT AUTOMATION
       ZERO AI TOKENS
       ===================================================== */

    if (
      isPurchaseIntent(
        currentUserMessage
      )
    ) {
      const product =
        findLastConversationProduct(
          products,
          messages
        );

      const purchaseResponse =
        getPurchaseResponse(
          product,
          language
        );

      const response =
        appendFirstMessageIntro(
          purchaseResponse,
          isNewConversation,
          language
        );

      return jsonResponse({
        response
      });
    }

    /* =====================================================
       LAYER 4
       PRODUCT AVAILABILITY CHECK
       ===================================================== */

    const requestedCategory =
      detectRequestedCategory(
        currentUserMessage
      );

    if (
      requestedCategory !== "none"
    ) {
      const categoryProducts =
        products.filter(
          (product) =>
            productMatchesCategory(
              product,
              requestedCategory
            )
        );

      /*
       * If requested product category does not exist,
       * answer directly.
       *
       * IMPORTANT:
       * No unnecessary AI call.
       * No unrelated recommendation.
       */

      if (!categoryProducts.length) {
        const unavailableResponse =
          getUnavailableProductResponse(
            requestedCategory,
            language
          );

        const response =
          appendFirstMessageIntro(
            unavailableResponse,
            isNewConversation,
            language
          );

        return jsonResponse({
          response
        });
      }
    }

    /* =====================================================
       LAYER 5
       LIMIT CONVERSATION
       ===================================================== */

    const conversationMessages =
      messages
        .filter(
          (message) =>
            message.role !== "system"
        )
        .slice(-8);

    const conversationText =
      conversationMessages
        .map(
          (message) =>
            `${message.role}: ${message.content}`
        )
        .join("\n");

    /* =====================================================
       LAYER 6
       SMALL RELEVANT PRODUCT CONTEXT
       ===================================================== */

    const productData =
      buildRelevantProductData(
        products,
        conversationText
      );

    /* =====================================================
       SYSTEM MESSAGE
       ===================================================== */

    const systemMessage: ChatMessage = {
      role: "system",

      content: `${SYSTEM_PROMPT}

${STORE_INFORMATION}

==================================================
REAL RBH WOOCOMMERCE CATALOGUE
==================================================

${productData}

==================================================
END CATALOGUE
==================================================

FINAL SOURCE RULES:

1. WooCommerce catalogue is the ONLY source of truth for RBH products.
2. Only recommend products with exact names shown in the catalogue.
3. Never invent product information.
4. If customer asks for an unavailable product, clearly say it is not currently available in the listing.
5. Do not force unrelated products as alternatives.
6. Customer is already on the website. Never tell them to open or visit the website first.
7. For buying guidance use:
   Product page or Search Bar -> Add to Cart -> Cart -> Checkout.
8. Never claim an order is placed unless actual system confirms it.
9. Never claim a product was added to Cart unless actual system confirms it.
10. Answer the customer's actual question first.
`
    };

    /* =====================================================
       AI INPUT
       ===================================================== */

    const inputs = {
      messages: [
        systemMessage,
        ...conversationMessages
      ],

      /*
       * Concise customer replies.
       */

      max_tokens: 420,

      stream: false
    };

    /* =====================================================
       AI FALLBACK
       ===================================================== */

    const result =
      await env.AI.run(
        MODEL_ID,
        inputs
      );

    /*
     * Guarantee first-message introduction at CODE level.
     *
     * AI answers actual question first.
     * Then RBH introduction is appended automatically.
     */

    if (
      isNewConversation &&
      result &&
      typeof result === "object" &&
      typeof result.response === "string"
    ) {
      result.response =
        appendFirstMessageIntro(
          result.response,
          true,
          language
        );
    }

    return jsonResponse(
      result
    );
  } catch (error) {
    console.error(
      "Error processing chat request:",
      error
    );

    return jsonResponse(
      {
        error:
          "Failed to process request"
      },
      500
    );
  }
}

/* =========================================================
   WORKER
   ========================================================= */

const index_default = {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    void ctx;

    const url =
      new URL(request.url);

    /* =====================================================
       CORS
       ===================================================== */

    const corsHeaders = {
      "Access-Control-Allow-Origin":
        "https://theroyalbeautyhub.com",

      "Access-Control-Allow-Methods":
        "POST, OPTIONS",

      "Access-Control-Allow-Headers":
        "Content-Type",

      "Access-Control-Max-Age":
        "86400"
    };

    /* =====================================================
       PREFLIGHT
       ===================================================== */

    if (
      request.method === "OPTIONS"
    ) {
      return new Response(
        null,
        {
          status: 204,
          headers: corsHeaders
        }
      );
    }

    /* =====================================================
       API CHAT
       ===================================================== */

    if (
      url.pathname === "/api/chat"
    ) {
      if (
        request.method !== "POST"
      ) {
        return new Response(
          "Method not allowed",
          {
            status: 405,
            headers: corsHeaders
          }
        );
      }

      const response =
        await handleChatRequest(
          request,
          env
        );

      /*
       * Preserve CORS on every API response.
       */

      const headers =
        new Headers(
          response.headers
        );

      Object.entries(
        corsHeaders
      ).forEach(
        ([key, value]) => {
          headers.set(
            key,
            value
          );
        }
      );

      return new Response(
        response.body,
        {
          status: response.status,

          statusText:
            response.statusText,

          headers
        }
      );
    }

    /* =====================================================
       WEBSITE / ASSETS
       ===================================================== */

    if (
      url.pathname === "/" ||
      !url.pathname.startsWith("/api/")
    ) {
      return env.ASSETS.fetch(
        request
      );
    }

    /* =====================================================
       NOT FOUND
       ===================================================== */

    return new Response(
      "Not found",
      {
        status: 404,
        headers: corsHeaders
      }
    );
  }
};

export default index_default;
