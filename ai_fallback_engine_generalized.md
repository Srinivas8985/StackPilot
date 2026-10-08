# The 4-Layer AI Resilience & Fallback Engine

When integrating Large Language Models (LLMs) into production applications, developers often face issues like model deprecation, rate limits, API outages, and unexpected downtime.

The **4-Layer AI Fallback Engine** (as implemented in StackPilot) is a bulletproof architectural pattern designed to guarantee 100% uptime for core features, even if the AI provider goes completely offline.

This document abstracts the logic so you can implement this pattern in **any application**, for **any purpose** (e.g., generating code, summarizing text, extracting JSON).

---

## The 4 Architectural Layers

### Layer 1: Dynamic Model Discovery
**The Problem:** Hardcoding model names (e.g., `gemini-1.5-pro` or `gpt-4-turbo`) creates technical debt. When a provider deprecates an old model, your app breaks instantly.
**The Solution:** Query the provider's API on boot (or dynamically) to get a list of currently active, supported models. Filter this list to only include models suitable for your task (e.g., text-generation models).

### Layer 2: Sticky Success Caching
**The Problem:** If the primary model fails and the engine falls back to model #3, the next request will foolishly try model #1 and #2 again, wasting time and API calls.
**The Solution:** Maintain a global memory (or Redis cache) of the `lastSuccessfulModel`. Before iterating through the model list, bump the last known working model to the very front of the queue.

### Layer 3: Sequential Fallback Loop
**The Problem:** API calls can fail intermittently due to rate limits (429) or server errors (500).
**The Solution:** Wrap the AI generation logic in a loop. Try the first model. If it throws an error, catch the error, log a warning, and immediately try the next model in the list.

### Layer 4: Deterministic Static Fallback
**The Problem:** What happens if the entire API is down, your API key is revoked, or the user has no internet connection?
**The Solution:** Guarantee 100% feature uptime by providing a non-AI, algorithmic fallback. This could be static templates, a regex-based parser, or pre-computed generic responses. The user should never see an "AI is down" error if the core feature can still function without it.

---

## Generalized Code Template (Node.js)

Here is a generic implementation of the engine that can be adapted for any API (OpenAI, Anthropic, Gemini).

```javascript
/**
 * Generic AI Fallback Engine
 */

let lastSuccessfulModel = null;
let cachedModels = null;
let lastModelFetch = 0;

// 1. Dynamic Discovery
async function getAvailableModels() {
  const CACHE_TTL = 1000 * 60 * 60; // 1 hour
  
  // Return cached list if valid
  if (cachedModels && (Date.now() - lastModelFetch < CACHE_TTL)) {
    return cachedModels;
  }

  try {
    // Example: Fetch models from your AI provider
    const response = await fetch('https://api.provider.com/v1/models', {
      headers: { 'Authorization': `Bearer ${process.env.AI_API_KEY}` }
    });
    const data = await response.json();
    
    // Filter for text generation models
    const textModels = data.models
      .filter(m => m.id.includes('text') || m.id.includes('instruct'))
      .map(m => m.id);

    cachedModels = textModels;
    lastModelFetch = Date.now();
    return cachedModels;

  } catch (error) {
    console.warn("Failed to fetch models dynamically. Using hardcoded backups.");
    // Hardcoded backups in case discovery fails
    return ['model-v2-pro', 'model-v1-standard', 'model-lite'];
  }
}

// Core Engine Logic
export async function generateContentWithFallback(prompt, taskContext) {
  
  const models = await getAvailableModels();

  // 2. Sticky Success Cache: Reorder array to prioritize the last working model
  if (lastSuccessfulModel && models.includes(lastSuccessfulModel)) {
    models.sort((x, y) => x === lastSuccessfulModel ? -1 : y === lastSuccessfulModel ? 1 : 0);
  }

  // 3. Sequential Fallback Loop
  for (const model of models) {
    try {
      console.log(`[AI Engine] Attempting generation with model: ${model}`);
      
      const result = await makeApiCall(model, prompt);
      
      // Cache success for next time
      lastSuccessfulModel = model;
      return result;

    } catch (error) {
      console.warn(`[AI Engine] Model ${model} failed:`, error.message);
      // Loop continues to the next model...
    }
  }

  // 4. Deterministic Static Fallback
  // If the code reaches here, ALL AI models failed.
  console.error("[AI Engine] All AI models failed. Executing deterministic fallback.");
  return executeStaticFallback(taskContext);
}

// ---------------------------------------------------------
// Helpers

async function makeApiCall(model, prompt) {
  // Your specific AI provider logic goes here
  const res = await fetch('https://api.provider.com/v1/generate', {
    method: 'POST',
    body: JSON.stringify({ model, prompt })
  });
  if (!res.ok) throw new Error(`API Error: ${res.status}`);
  return await res.text();
}

function executeStaticFallback(taskContext) {
  // This must NOT rely on AI. It should use traditional programming logic.
  // Example for a DevOps app: Return a generic Dockerfile template
  // Example for an Email app: Return a generic "Thank you for your email" template
  
  if (taskContext.type === 'invoice') {
    return { status: 'manual_review_required', data: {} };
  }
  
  return "Fallback generated content based on predefined templates.";
}
```

## How to Adapt This for Other Purposes

### 1. Data Extraction / JSON Parsing
If your app uses AI to extract structured data (e.g., parsing receipts into JSON):
- **Prompt:** "Extract total amount and date from this text into JSON."
- **Deterministic Fallback:** Use Regex to search for `$DD.DD` and date formats. It won't be as accurate as AI, but it ensures the user still gets *some* data when the AI is down.

### 2. Customer Support Chatbot
- **Prompt:** "Respond to this customer inquiry politely."
- **Deterministic Fallback:** Search a local FAQ database using keyword matching (BM25 or simple `.includes()`) and return a canned response like: *"I am currently offline, but here is a related article that might help."*

### 3. Code Generation (Like StackPilot)
- **Prompt:** "Generate a configuration file for this framework."
- **Deterministic Fallback:** Keep a library of 10-15 static templates (e.g., standard React, standard Express). Map the user's framework to the closest static template.
