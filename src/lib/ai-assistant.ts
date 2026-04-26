/**
 * Agentic AI Assistant — Server-side logic.
 * Uses the same Gemini API key already configured for OCR.
 * The assistant has READ access to agent context and can call
 * a fixed set of "tool functions" (sandboxed API actions).
 */

const GEMINI_CHAT_MODEL = "gemini-2.0-flash";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export interface ChatMessage {
  role: "user" | "model";
  text: string;
}

export interface AgentContext {
  agentName: string;
  employeeId: string;
  plantId: string;
  /** Lead/site names for the Local Context Dictionary */
  leadNames: string[];
  siteNames: string[];
  /** Active orders so AI can give status updates */
  pendingOrders: Array<{ id: string; siteName: string; grade: string; quantity: number; status: string }>;
  /** Today's tasks */
  openTasks: Array<{ subject: string; deadline: string }>;
}

function getApiKey() {
  return process.env.GEMINI_API_KEY?.trim() || null;
}

function buildSystemPrompt(ctx: AgentContext): string {
  const localDict =
    [...ctx.leadNames, ...ctx.siteNames].filter(Boolean).slice(0, 60).join(", ") || "None recorded yet";

  const orderSummary = ctx.pendingOrders.length
    ? ctx.pendingOrders
        .map((o) => `- Order #${o.id.slice(0, 8)}: ${o.siteName} | ${o.grade} | ${o.quantity} cum | ${o.status}`)
        .join("\n")
    : "No pending orders.";

  const taskSummary = ctx.openTasks.length
    ? ctx.openTasks.map((t) => `- ${t.subject} (due: ${t.deadline})`).join("\n")
    : "No open tasks.";

  return `You are SPD Assistant, a multilingual agentic AI for a Ready Mix Concrete (RMC) field sales agent.
You work for SPD Concrete and assist the sales agent "${ctx.agentName}" (Employee ID: ${ctx.employeeId}).

LANGUAGE RULES:
- Respond in the SAME language the user writes in.
- You support: English, Hindi (Devanagari or Romanised), and Odia.
- For ambiguous words, prefer the local RMC vocabulary from the dictionary below.

LOCAL CONTEXT DICTIONARY (use these exact names when recognising sites or leads in user messages):
${localDict}

AGENT CONTEXT:
Pending Orders:
${orderSummary}

Open Tasks:
${taskSummary}

YOUR CAPABILITIES:
1. ANSWER QUESTIONS about the agent's orders, tasks, leads, and RMC operations.
2. GUIDE the agent through creating a Sales Order (collect: Site Name, Concrete Grade, Quantity in cum, Required Date).
3. HELP with app navigation and common workflows.

WHEN CREATING A SALES ORDER:
- Collect all 4 fields by asking one question at a time if missing.
- When you have all 4, respond with a special JSON block ONLY at the end of your message:
  <<<ACTION>>>{"type":"CREATE_ORDER","siteName":"...","grade":"...","quantityCum":0,"requiredDate":"YYYY-MM-DD"}<<<END_ACTION>>>
- After the JSON block, add a human-readable confirmation message.

RULES:
- Never make up data. If you don't know something, say so clearly.
- Never directly modify the database. Only return ACTION blocks for the app to execute.
- Keep responses concise and friendly. Avoid technical jargon.
- If the agent asks about something outside your scope, say: "I can help with your orders, leads, and tasks."`;
}

/**
 * Call Gemini with a full conversation history and return the model's text reply.
 * Returns null if the API key is missing or the call fails.
 */
export async function callGeminiChat(
  history: ChatMessage[],
  ctx: AgentContext,
): Promise<{ text: string; actionBlock: string | null } | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  // Convert history to Gemini "contents" format
  const systemPrompt = buildSystemPrompt(ctx);

  // We prepend the system prompt as the first "user" message (Gemini Flash supports system instructions natively)
  const contents = history.map((msg) => ({
    role: msg.role,
    parts: [{ text: msg.text }],
  }));

  const response = await fetch(
    `${GEMINI_API_BASE}/${GEMINI_CHAT_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemPrompt }],
        },
        contents,
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 1024,
        },
      }),
    },
  );

  if (!response.ok) {
    console.error("Gemini chat error:", response.status, await response.text());
    return null;
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) return null;

  // Extract action block if present
  const actionMatch = text.match(/<<<ACTION>>>([\s\S]*?)<<<END_ACTION>>>/);
  const actionBlock = actionMatch ? actionMatch[1].trim() : null;

  // Clean the action block from the displayed text
  const cleanText = text.replace(/<<<ACTION>>>[\s\S]*?<<<END_ACTION>>>/, "").trim();

  return { text: cleanText, actionBlock };
}
