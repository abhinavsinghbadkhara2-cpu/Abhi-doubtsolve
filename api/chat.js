
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

const MODEL = "gemini-2.5-flash";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const {
      GEMINI_API_KEY,
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY
    } = process.env;

    if (
      !GEMINI_API_KEY ||
      !SUPABASE_URL ||
      !SUPABASE_PUBLISHABLE_KEY
    ) {
      return res.status(500).json({
        error: "Server environment variables are missing."
      });
    }

    // Verify the user's Supabase login
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : "";

    if (!token) {
      return res.status(401).json({
        error: "Please login first."
      });
    }

    const supabase = createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      }
    );

    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({
        error: "Your session is invalid. Please login again."
      });
    }

    // Check request
    const messages = req.body?.messages;

    if (
      !Array.isArray(messages) ||
      messages.length === 0 ||
      messages.length > 20
    ) {
      return res.status(400).json({
        error: "Invalid chat messages."
      });
    }

    // Convert website messages into Gemini format
    const contents = messages.slice(-20).map(message => {
      if (
        message.role !== "user" &&
        message.role !== "model"
      ) {
        throw new Error("Invalid message role.");
      }

      const parts = [];

      if (typeof message.text === "string") {
        const text = message.text.trim();

        if (text.length > 10000) {
          throw new Error("Message is too long.");
        }

        if (text) {
          parts.push({ text });
        }
      }

      // Support attached images
      if (message.image) {
        if (
          typeof message.image !== "string" ||
          message.image.length > 4000000
        ) {
          throw new Error("Image is too large.");
        }

        const match = message.image.match(
          /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/
        );

        if (!match) {
          throw new Error("Invalid image format.");
        }

        parts.push({
          inlineData: {
            mimeType: match[1],
            data: match[2]
          }
        });
      }

      if (!parts.length) {
        throw new Error("Empty message.");
      }

      return {
        role: message.role,
        parts
      };
    });

    // Connect to Gemini
    const ai = new GoogleGenAI({
      apiKey: GEMINI_API_KEY
    });

    const result = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: {
        systemInstruction: `
You are Abhi Doubt Solve.ai, a friendly AI study tutor.

Your job:
1. Solve student doubts accurately.
2. Explain answers step by step.
3. Use simple Hindi or English based on the student's language.
4. Understand attached question images.
5. Explain mathematics with clear calculations.
6. Explain science concepts with examples.
7. If a question is unclear, ask a helpful follow-up.
8. Never invent facts or pretend to read an unclear image.

Be friendly, educational and easy to understand.
`
      }
    });

    const reply = result.text;

    if (!reply) {
      throw new Error("AI returned an empty answer.");
    }

    return res.status(200).json({ reply });
} catch (error) {
  console.error("Chat API error:", error);

  return res.status(500).json({
    error: error.message || "Unable to generate an answer. Please try again."
  });
  }
  
}
