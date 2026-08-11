#!/usr/bin/env node
import { readFileSync } from "node:fs";

const MAX_INPUT_BYTES = 1024 * 1024;

function fail(message) {
  console.error(`openai-compatible-agent: ${message}`);
  process.exitCode = 1;
}

function readRequest() {
  const source = readFileSync(0, "utf8");
  if (Buffer.byteLength(source, "utf8") > MAX_INPUT_BYTES) throw new Error("input exceeds 1 MiB");
  const request = JSON.parse(source);
  if (request === null || typeof request !== "object" || Array.isArray(request)) {
    throw new Error("input must be an object");
  }
  if (typeof request.model !== "string" || request.model.trim() === "") {
    throw new Error("model is required");
  }
  if (!Array.isArray(request.messages) || request.messages.length === 0) {
    throw new Error("messages are required");
  }
  for (const message of request.messages) {
    if (message === null || typeof message !== "object" || typeof message.role !== "string" || typeof message.content !== "string") {
      throw new Error("each message requires string role and content");
    }
  }
  return request;
}

function endpointFromEnvironment() {
  const baseUrl = process.env.OPENAI_BASE_URL;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!baseUrl || !apiKey) throw new Error("OPENAI_BASE_URL and OPENAI_API_KEY are required");
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("OPENAI_BASE_URL must use http or https");
  }
  return {
    apiKey,
    url: new URL("chat/completions", `${parsed.toString().replace(/\/$/u, "")}/`).toString(),
  };
}

async function main() {
  const request = readRequest();
  const { apiKey, url } = endpointFromEnvironment();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: request.model, messages: request.messages }),
  });
  if (!response.ok) throw new Error(`provider returned HTTP ${response.status}`);
  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new Error("provider response has no non-empty choices[0].message.content");
  }
  process.stdout.write(`${JSON.stringify({ content })}\n`);
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
