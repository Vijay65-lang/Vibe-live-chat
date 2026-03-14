import { GoogleGenAI, Type } from '@google/genai';

// We use the Gemini API key from the environment
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface ModerationResult {
  isSafe: boolean;
  reason?: string;
  suggestion?: string;
}

export async function moderateMessage(text: string): Promise<ModerationResult> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analyze the following message for inappropriate, abusive, hate speech, explicit, or offensive language.
      If it is safe and respectful, return { "isSafe": true }.
      If it is inappropriate, return { "isSafe": false, "reason": "Brief explanation of why it's inappropriate", "suggestion": "A polite, positive rewrite of the message" }.
      
      Message: "${text}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isSafe: { type: Type.BOOLEAN },
            reason: { type: Type.STRING },
            suggestion: { type: Type.STRING }
          },
          required: ["isSafe"]
        }
      }
    });

    const jsonStr = response.text?.trim();
    if (jsonStr) {
      return JSON.parse(jsonStr) as ModerationResult;
    }
    return { isSafe: true };
  } catch (error) {
    console.error("Moderation error:", error);
    // Fail open if moderation service is down
    return { isSafe: true };
  }
}
