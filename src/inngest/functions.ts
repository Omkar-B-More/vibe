// // src/inngest/functions.ts
// import { inngest } from "./client";
// import { gemini, createAgent } from "@inngest/agent-kit";

// export const helloWorld = inngest.createFunction(
//   {
//     id: "hello-world",
//     triggers: { event: "test/hello.world" },
//   },
//   async ({ event, step }) => {
//     const summarizer = createAgent({
//       name: "summarizer",
//       system: "You are an expert summarizer. You summarize in 2 words",
//       model: gemini({
//         model: "gemini-2.0-flash",
//       }),
//     });

//     const { output } = await summarizer.run(
//       `Summarize the following text: ${event.data.value}`
//     );

//     return { output };
//   },
// );
import { inngest } from "./client";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

export const helloWorld = inngest.createFunction(
  {
    id: "hello-world",
    triggers: {
      event: "test/hello.world",
    },
  },
  async ({ event }) => {
    const codeAgent = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `You are an expert next.js developer.You write readable, maintanable code.You write simple Next.js & React snippets.:\n\n${event.data.value}`,
    });

    return {
      output: codeAgent.text,
    };
  }
);