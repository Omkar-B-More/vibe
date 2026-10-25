import { Sandbox } from "@e2b/code-interpreter";
import { inngest } from "./client";
import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { getSandbox } from "./utils";
import { FRAGMENT_TITLE_PROMPT, PROMPT, RESPONSE_PROMPT } from "@/prompt";
import { prisma } from "@/lib/db";
import { SANDBOX_TIMEOUT } from "./types";
// --- Tool definitions ---

const terminalDeclaration: FunctionDeclaration = {
  name: "terminal",
  description: "Use the terminal to run commands in the sandbox",
  parameters: {
    type: Type.OBJECT,
    properties: {
      command: { type: Type.STRING, description: "The shell command to run" },
    },
    required: ["command"],
  },
};

const createOrUpdateFilesDeclaration: FunctionDeclaration = {
  name: "createOrUpdateFiles",
  description: "Create or update files in the sandbox. Write ALL files in a single call, never one file per call.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      files: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            path: { type: Type.STRING },
            content: { type: Type.STRING },
          },
          required: ["path", "content"],
        },
      },
    },
    required: ["files"],
  },
};

const readFilesDeclaration: FunctionDeclaration = {
  name: "readFiles",
  description: "Read files from the sandbox",
  parameters: {
    type: Type.OBJECT,
    properties: {
      files: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
      },
    },
    required: ["files"],
  },
};

// --- Helper: calls Gemini, and if it hits a 429 rate limit, waits and retries ---

// 1) Client with the shorter timeout (replaces your old `const ai = ...`)
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
  httpOptions: { timeout: 120000 }, // give up after 2 minutes instead of 5
});

// Models to try in order
const MODELS = ["gemini-3.8-flash", "gemini-3.5-flash-lite"];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function generateWithRetry(params: any, retriesPerModel = 4): Promise<any> {
  let lastError: any;

  for (const model of MODELS) {
    for (let attempt = 0; attempt < retriesPerModel; attempt++) {
      try {
        return await ai.models.generateContent({ ...params, model });
      } catch (e: any) {
        lastError = e;

        const status = Number(e?.status ?? e?.error?.code ?? e?.code);
        const msg = String(e?.message ?? "");

        const isRateLimit =
          status === 429 || msg.includes("RESOURCE_EXHAUSTED");
        const isOverloaded =
          status === 503 || msg.includes("UNAVAILABLE");

        // 2) Network timeout check (goes right after isOverloaded)
        const causeCode = String(e?.cause?.code ?? "");
        const isNetwork =
          msg.includes("fetch failed") ||
          msg.toLowerCase().includes("timeout") ||
          causeCode === "UND_ERR_HEADERS_TIMEOUT" ||
          causeCode === "ECONNRESET";

        // 3) Updated check (replaces your old `if (!isRateLimit && !isOverloaded) throw e;`)
        if (!isRateLimit && !isOverloaded && !isNetwork) throw e;

        let waitMs: number;
        if (isRateLimit) {
          const match = msg.match(/retry in ([\d.]+)s/i);
          waitMs = match ? Math.ceil(parseFloat(match[1]) * 1000) + 1000 : 30000;
        } else {
          waitMs = Math.min(2000 * 2 ** attempt, 30000);
        }

        console.log(
          `${model}: ${isRateLimit ? "rate limited" : isNetwork ? "network timeout" : "overloaded"} ` +
          `(try ${attempt + 1}/${retriesPerModel}). Waiting ${waitMs}ms...`
        );
        await sleep(waitMs);
      }
    }
    console.log(`${model} kept failing, switching to next model...`);
  }

  throw lastError;
}

// Helper: one-shot text generation with a system prompt (Gemini version of Antonio's
// fragmentTitleGenerator / responseGenerator agents)
async function generateText(systemPrompt: string, input: string): Promise<string> {
  const res = await generateWithRetry({
    contents: [{ role: "user", parts: [{ text: input }] }],
    config: {
      systemInstruction: systemPrompt,
      temperature: 0.1,
    },
  });
  const parts = res.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p: any) => p.text ?? "").join("").trim();
}

export const codeAgentFunction = inngest.createFunction(
  {
    id: "code-agent",
    triggers: {
      event: "code-agent/run",
    },
  },
  async ({ event, step }) => {
    const sandboxId = await step.run("get-sandbox-id", async () => {
      const sandbox = await Sandbox.create("omkars-project-54ce/vibe-dev--test");
      await sandbox.setTimeout(SANDBOX_TIMEOUT);
      return sandbox.sandboxId;
    });

    // Previous messages of this project, so the model remembers the conversation
    const previousMessages = await step.run("get-previous-messages", async () => {
      const messages = await prisma.message.findMany({
        where: {
          projectId: event.data.projectId,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 5, // only the last 5 messages
      });

      // reverse() puts them back in oldest-first order, which Gemini expects
      const history = messages
        .map((message) => ({
          role: message.role === "ASSISTANT" ? "model" : "user",
          parts: [{ text: message.content }],
        }))
        .reverse();

      // Gemini history must start with a user turn
      while (history.length > 0 && history[0].role === "model") {
        history.shift();
      }

      return history;
    });

    async function runTerminal(command: string) {
      return await step.run("terminal", async () => {
        const buffers = { stdout: "", stderr: "" };
        try {
          const sandbox = await getSandbox(sandboxId);
          const result = await sandbox.commands.run(command, {
            onStdout: (data: string) => { buffers.stdout += data; },
            onStderr: (data: string) => { buffers.stderr += data; },
          });
          return result.stdout;
        } catch (e) {
          return `Command failed: ${e}\nstdout: ${buffers.stdout}\nstderr: ${buffers.stderr}`;
        }
      });
    }

    async function runCreateOrUpdateFiles(files: { path: string; content: string }[]) {
      return await step.run("createOrUpdateFiles", async () => {
        try {
          const sandbox = await getSandbox(sandboxId);
          for (const file of files) {
            await sandbox.files.write(file.path, file.content);
            filesState[file.path] = file.content;
          }
          return "Files written successfully";
        } catch (e) {
          return "Error: " + e;
        }
      });
    }

    async function runReadFiles(files: string[]) {
      return await step.run("readFiles", async () => {
        try {
          const sandbox = await getSandbox(sandboxId);
          const contents = [];
          for (const file of files) {
            const content = await sandbox.files.read(file);
            contents.push({ path: file, content });
          }
          return JSON.stringify(contents);
        } catch (e) {
          return "Error: " + e;
        }
      });
    }

    const filesState: Record<string, string> = {};
    let summary: string | undefined;

    const contents: any[] = [
      ...previousMessages,
      { role: "user", parts: [{ text: event.data.value }] },
    ];

    const MAX_ITER = 15;

    for (let i = 0; i < MAX_ITER; i++) {
      const response = await step.run(`generate-${i}`, async () => {
        return generateWithRetry({
          model: "gemini-3.8-flash",
          contents,
          config: {
            systemInstruction: PROMPT,
            temperature: 0.1,
            tools: [
              {
                functionDeclarations: [
                  terminalDeclaration,
                  createOrUpdateFilesDeclaration,
                  readFilesDeclaration,
                ],
              },
            ],
          },
        });
      });

      const candidate = response.candidates?.[0];
      const parts = candidate?.content?.parts ?? [];
      const functionCalls = parts.filter((p: any) => p.functionCall).map((p: any) => p.functionCall);

      contents.push({ role: "model", parts });

      if (functionCalls.length === 0) {
        const text = parts.map((p: any) => p.text ?? "").join("");
        if (text.includes("<task_summary>")) {
          summary = text;
        }
        break;
      }

      for (const fc of functionCalls) {
        let result: string;
        if (fc.name === "terminal") {
          result = await runTerminal(fc.args.command);
        } else if (fc.name === "createOrUpdateFiles") {
          result = await runCreateOrUpdateFiles(fc.args.files);
        } else if (fc.name === "readFiles") {
          result = await runReadFiles(fc.args.files);
        } else {
          result = `Unknown tool: ${fc.name}`;
        }

        contents.push({
          role: "user",
          parts: [
            {
              functionResponse: {
                name: fc.name,
                response: { result },
              },
            },
          ],
        });
      }
    }

    // Safety net: loop ended without a summary but files were written -> still save as a result
    if (!summary && Object.keys(filesState).length > 0) {
      summary =
        "<task_summary>The app was generated in the sandbox. Open the preview to check it.</task_summary>";
    }

    const isError = !summary || Object.keys(filesState).length === 0;

    // Generate a short fragment title and a friendly reply from the summary (Gemini)
    let fragmentTitle = "Fragment";
    let responseText = summary ?? "";

    if (!isError) {
      fragmentTitle = await step.run("generate-fragment-title", async () => {
        try {
          return (await generateText(FRAGMENT_TITLE_PROMPT, summary!)) || "Fragment";
        } catch (e) {
          console.log("Title generation failed, using default:", e);
          return "Fragment";
        }
      });

      responseText = await step.run("generate-response", async () => {
        try {
          return (await generateText(RESPONSE_PROMPT, summary!)) || summary!;
        } catch (e) {
          console.log("Response generation failed, using summary:", e);
          return summary!;
        }
      });
    }

    const sandboxUrl = await step.run("get-sandbox-url", async () => {
      const sandbox = await getSandbox(sandboxId);
      const host = sandbox.getHost(3000);
      return `https://${host}`;
    });

    await step.run("save-result", async () => {
      if (isError) {
        return await prisma.message.create({
          data: {
            projectId: event.data.projectId,
            content: "Something went wrong. Please try again.",
            role: "ASSISTANT",
            type: "ERROR",
          },
        });
      }

      return await prisma.message.create({
        data: {
          projectId: event.data.projectId,
          content: responseText,
          role: "ASSISTANT",
          type: "RESULT",
          fragment: {
            create: {
              sandboxUrl: sandboxUrl,
              title: fragmentTitle,
              files: filesState,
            },
          },
        },
      });
    });

    return {
      url: sandboxUrl,
      title: fragmentTitle,
      files: filesState,
      summary,
    };
  },
);