require("dotenv").config();
const { streamText } = require("ai");
const { createGoogleGenerativeAI } = require("@ai-sdk/google");

async function main() {
  try {
    const google = createGoogleGenerativeAI({
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY
    });
    const result = streamText({
      model: google("gemini-2.5-flash"),
      messages: [{ role: "user", content: "what is 2+2" }]
    });
    
    for await (const textPart of result.textStream) {
      process.stdout.write(textPart);
    }
  } catch (e) {
    console.error("SDK Error:", e);
  }
}
main();
