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
import { Sandbox } from "@e2b/code-interpreter";
import { inngest } from "./client";
import { GoogleGenAI } from "@google/genai";
import { getSandbox } from "./utils";

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
  async ({ event, step }) => {
    const sandboxId = await step.run("get-sandbox-id", async () => {
      const sandbox = await Sandbox.create("omkars-project-54ce/vibe-dev--test");
      return sandbox.sandboxId;
    });
    const codeAgent = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `You are an expert next.js developer.You write readable, maintanable code.You write simple Next.js & React snippets.:\n\n${event.data.value}`,
    });

    const sandboxUrl = await step.run("get-sandbox-url", async () => {
      const sandbox = await getSandbox(sandboxId);
      const host = sandbox.getHost(3000);
      return `https://${host}`;
    })

    return {
      output: codeAgent.text,
      sandboxUrl
    };
  }
);