import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Create Express app
const app = express();
const PORT = 3000;

// Setup JSON body parsing with reasonable size limit for base64 image uploads
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ limit: "15mb", extended: true }));

// Lazy init Gemini client to avoid crashes if API key is not ready during compile/run
let aiClient: GoogleGenAI | null = null;
function getAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY missing. Please configure it in the Secrets panel in AI Studio.");
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Word Schema for Structured JSON Response
const wordListSchema = {
  type: Type.ARRAY,
  description: "A list of English words extracted or generated based on the user request, complete with phonetic guides, Chinese definitions, and high-quality example sentences.",
  items: {
    type: Type.OBJECT,
    properties: {
      word: {
        type: Type.STRING,
        description: "The English word or professional phrase (e.g., 'concept' or 'artificial intelligence'). Correct capitalization if needed.",
      },
      phonetic: {
        type: Type.STRING,
        description: "The standard IPA (International Phonetic Alphabet) phonetic symbol enclosed in slashes, e.g. /æp.əl/ or /kənˈsept/.",
      },
      meaning: {
        type: Type.STRING,
        description: "The primary and accurate Chinese translation of the word, along with part of speech (e.g. 'n. 苹果' or 'v. 确认').",
      },
      example: {
        type: Type.STRING,
        description: "A natural, helpful English example sentence that clearly demonstrates the usage of the word.",
      },
      exampleTranslation: {
        type: Type.STRING,
        description: "The high-quality Chinese translation of the example sentence.",
      },
    },
    required: ["word", "phonetic", "meaning", "example", "exampleTranslation"],
  },
};

/**
 * Endpoint to extract vocabulary details from an uploaded image
 */
app.post("/api/generate-from-image", async (req, res) => {
  try {
    const { image, mimeType } = req.body;
    if (!image || !mimeType) {
      return res.status(400).json({ error: "Missing image data or mimeType." });
    }

    const ai = getAIClient();

    const imagePart = {
      inlineData: {
        mimeType: mimeType,
        data: image,
      },
    };

    const textPart = {
      text: "You are an expert English lexicographer and tutor. Scan this image. " +
        "Extract all English words or short vocabulary phrases written or pictured in it. " +
        "For each word or phrase found, generate its standard IPA phonetic symbols, its primary " +
        "Chinese meaning, write a very helpful English example sentence that highlights its context, " +
        "and provide a Chinese translation of the example sentence. " +
        "Output ONLY the JSON list corresponding to the requested schema. Do not include markdown wraps or conversational preambles.",
    };

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: { parts: [imagePart, textPart] },
      config: {
        responseMimeType: "application/json",
        responseSchema: wordListSchema,
        temperature: 0.2,
      },
    });

    const textResult = response.text;
    if (!textResult) {
      throw new Error("Did not receive a text response from Gemini.");
    }

    const data = JSON.parse(textResult.trim());
    res.json({ success: true, words: data });
  } catch (error: any) {
    console.error("Error generating from image:", error);
    res.status(500).json({
      success: false,
      error: error.message || "An error occurred while analyzing the image.",
    });
  }
});

/**
 * Endpoint to generate details for manually entered or pasted words/texts
 */
app.post("/api/generate-from-words", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Missing text input." });
    }

    const ai = getAIClient();

    const prompt = `You are an expert English teacher. The user provided the following input:
"${text}"

Extract or identify English vocabulary words/phrases from this input. If it is already a list of words, expand and enrich them. If it is a block of text, extract key educational interest/grade-appropriate English words from it (up to 20 words).

For each English word/phrase, provide:
1. The English word itself.
2. The standard IPA phonetic symbol enclosed in slashes (e.g., /ækˈtɪv.ə.ti/).
3. The accurate Chinese description and part of speech (e.g., 'n. 活动').
4. An illustrative, grammatically sound English example sentence.
5. The high-quality Chinese translation of the example sentence.

Avoid duplicates. Generate response strictly as a JSON array matching the schema.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: wordListSchema,
        temperature: 0.3,
      },
    });

    const textResult = response.text;
    if (!textResult) {
      throw new Error("No response content from Gemini.");
    }

    const data = JSON.parse(textResult.trim());
    res.json({ success: true, words: data });
  } catch (error: any) {
    console.error("Error generating from words:", error);
    res.status(500).json({
      success: false,
      error: error.message || "An error occurred while processing the word list.",
    });
  }
});

/**
 * Vite Dev or Static Production build serving
 */
async function setupVite() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite dev middleware loaded.");
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("Serving static production assets.");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  setupVite();
}

export default app;
