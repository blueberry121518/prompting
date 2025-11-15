import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import multer from 'multer'
import OpenAI from 'openai'
import { jsonrepair } from 'jsonrepair'
import { validateMermaid, validatePlantUML } from './validate-diagrams.js'

dotenv.config()

const app = express()
const port = process.env.PORT || 8000
const clientOrigins = process.env.CLIENT_ORIGIN?.split(',').map((origin) => origin.trim()) ?? ['http://localhost:3000']
const model = process.env.OPENAI_MODEL ?? 'gpt-5.1'
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1024 * 1024 * 2,
  },
})

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

app.use(
  cors({
    origin: clientOrigins,
    credentials: true,
  }),
)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', model })
})

app.post('/analyze', upload.single('file'), async (req, res) => {
  const requestId = Date.now().toString(36)
  console.log(`[${requestId}] Analysis request received`)
  
  try {
    if (!process.env.OPENAI_API_KEY) {
      console.error(`[${requestId}] ERROR: OpenAI API key missing`)
      return res.status(500).json({ error: 'OpenAI key missing on server.' })
    }
    
    if (!req.file) {
      console.error(`[${requestId}] ERROR: No file received`)
      return res.status(400).json({ error: 'No code file received.' })
    }

    console.log(`[${requestId}] File received: ${req.file.originalname}, size: ${req.file.size} bytes`)
    const codeSample = req.file.buffer.toString('utf-8')
    console.log(`[${requestId}] Code sample length: ${codeSample.length} characters`)
    
    const prompt = buildPrompt(req.file.originalname, codeSample)
    console.log(`[${requestId}] Prompt built, length: ${prompt.length} characters`)

    console.log(`[${requestId}] Calling OpenAI API with model: ${model}`)
    // Request JSON output with separated markdown and diagrams
    const response = await openai.responses.create({
      model,
      temperature: 0.2,
      max_output_tokens: 4096,
      text: { format: { type: 'json_object' } },
      input: [
        {
          role: 'system',
          content: `You are Syntra, an elite code analyst. You analyze code files and produce function-by-function documentation with narrative explanations.

CRITICAL: You must respond with valid JSON in this exact structure:
{
  "markdown": "The main markdown content with placeholders like {{DIAGRAM_0}}, {{DIAGRAM_1}}, etc. where diagrams should appear",
  "diagrams": [
    {"type": "mermaid", "code": "graph TD; A-->B", "position": 0},
    {"type": "plantuml", "code": "@startuml\\nA->B\\n@enduml", "position": 1}
  ]
}

DOCUMENTATION STRUCTURE:
For each function/class method in the code, create a section with:

1. **Function Metadata** (in a table or structured format):
   - Function name
   - Parameters: name, type, description, required/optional
   - Return type and description
   - Side effects (if any): mutations, I/O operations, exceptions thrown

2. **Narrative Logic Flow**:
   Write a story-like explanation structured for readability. Break the flow into logical phases with clear sections.
   
   Structure it like this:
   - **Opening**: One sentence describing the function's purpose
   - **Phases**: Break the logic into 3-5 logical phases (e.g., "Validation", "Processing", "Persistence", "Response")
   - **Each phase should have**:
     - A clear heading (### Phase Name)
     - 2-4 bullet points describing what happens in that phase
     - Bold text for important decisions or conditions
     - Natural, narrative language
   
   Example structure:
   ### Initialization
   - The function begins by...
   - It captures...
   
   ### Validation
   - The incoming data is scrutinized to ensure...
   - **If validation fails**, the process halts and...
   - **If validation succeeds**, the function proceeds to...
   
   ### Processing
   - The function then...
   - During this phase...
   
   Use natural language and focus on the "what" and "why", not the "how" of syntax.

3. **Diagrams** (STRONGLY ENCOURAGED for complex logic):
   Diagrams are preferred over long text explanations for complex logic flows. Include diagrams when:
   - **Flowcharts (Mermaid)**: The function has branching logic, decision trees, conditional flows, or multi-step processes that are easier to visualize than describe
   - **Sequence diagrams (Mermaid/PlantUML)**: The function orchestrates interactions between multiple components, makes async calls, or has complex request/response patterns
   - **State diagrams**: The function manages state transitions or has complex state-based logic
   - **Data flow diagrams**: The function transforms data through multiple stages or pipelines
   
   **When to include diagrams:**
   - If the function has 3+ conditional branches or decision points → Use a flowchart
   - If the function calls multiple services/components → Use a sequence diagram
   - If the function has complex state changes → Use a state diagram
   - If explaining the logic flow in text would require more than 2-3 paragraphs → Use a diagram
   
   Place diagrams immediately after the phase they illustrate, or at the end of the Logic Flow section if they summarize the entire flow.

EXAMPLE STRUCTURE:
## functionName

**Metadata:**
- Parameters: ...
- Returns: ...
- Side effects: ...

**Logic Flow:**

This function orchestrates the complete user registration process, transforming raw registration data into an authenticated user session.

### Initial Setup
- The function begins by recording the registration attempt for traceability
- It captures the email address to track the registration source

### Input Validation
- The incoming registration data is scrutinized to ensure the username meets minimum length requirements
- The email and password are validated against the system's security rules
- **If any validation fails**, the process halts immediately and an error is raised

### Identity Verification
- The function checks whether the requested identity (email or username) is already taken
- It searches the user store for existing accounts with matching credentials
- **If a duplicate is found**, the process stops and signals that the user already exists
- **If the identity is available**, the function proceeds to user creation

### User Creation
- A new user entity is constructed with the provided details
- Optional fields like profile picture and bio are filled with sensible defaults when absent
- The new user is persisted to the database

### Session Establishment
- The function generates a pair of tokens: an access token for short-lived authorization and a refresh token for renewal
- The refresh token is stored in cache for future validation
- Both tokens are prepared for return to the client

### Completion
- A welcome notification is triggered (represented as a log entry)
- Registration analytics are recorded for monitoring
- The function returns a sanitized user view (sensitive details removed) along with the tokens
- **If any error occurs**, it's logged and rethrown for the caller to handle

{{DIAGRAM_0}}

*Note: The diagram above visualizes the complete registration flow, showing all decision points and error paths.*

**Key Decisions:**
- Why certain validations exist
- Edge cases handled
- Performance considerations

CRITICAL RULES:
- DO NOT explain code syntax or line-by-line execution
- DO NOT describe what variables store or their types in detail
- DO write as if telling a story about what happens
- DO abstract implementation details into logical concepts
- DO use diagrams liberally for complex logic - prefer visual explanation over long text
- DO include diagrams for functions with branching logic, multiple components, or complex flows
- DO focus on the narrative: "The function orchestrates a validation pipeline" not "The function calls validate() then process()"
- DO explain the "why" behind decisions, not just the "what"
- DO use diagrams to replace verbose text explanations - if it's complex, diagram it

For files with multiple functions, organize them in a logical order (public API first, then helpers, or by dependency order).`,
        },
        { role: 'user', content: prompt },
      ],
    })

    console.log(`[${requestId}] OpenAI API response received`)
    const jsonText = extractText(response)
    console.log(`[${requestId}] Extracted text length: ${jsonText?.length || 0} characters`)
    
    if (!jsonText) {
      console.error(`[${requestId}] ERROR: No text extracted from OpenAI response`)
      console.error(`[${requestId}] Response structure:`, JSON.stringify(response, null, 2).substring(0, 500))
      return res.status(502).json({ error: 'No response returned from GPT-5.1' })
    }

    // Parse JSON (with repair for common issues)
    let parsed
    try {
      parsed = JSON.parse(jsonText)
      console.log(`[${requestId}] JSON parsed successfully`)
    } catch (e) {
      console.warn(`[${requestId}] Initial JSON parse failed: ${e.message}, attempting repair`)
      try {
        parsed = JSON.parse(jsonrepair(jsonText))
        console.log(`[${requestId}] JSON repaired and parsed successfully`)
      } catch (e2) {
        console.error(`[${requestId}] ERROR: Failed to parse JSON after repair:`, e2.message)
        console.error(`[${requestId}] JSON text preview:`, jsonText.substring(0, 500))
        return res.status(502).json({ error: `Invalid JSON response from GPT-5.1: ${e2.message}` })
      }
    }

    if (!parsed.markdown) {
      console.error(`[${requestId}] ERROR: Missing markdown in response`)
      console.error(`[${requestId}] Parsed keys:`, Object.keys(parsed))
      console.error(`[${requestId}] Parsed structure preview:`, JSON.stringify(parsed, null, 2).substring(0, 1000))
      return res.status(502).json({ error: 'Missing markdown in response from GPT-5.1' })
    }

    // Handle missing or invalid diagrams array - treat as empty
    if (!Array.isArray(parsed.diagrams)) {
      console.warn(`[${requestId}] WARNING: diagrams is not an array, type: ${typeof parsed.diagrams}`)
      console.warn(`[${requestId}] diagrams value:`, parsed.diagrams)
      console.warn(`[${requestId}] Full parsed structure keys:`, Object.keys(parsed))
      if (parsed.diagrams !== undefined && parsed.diagrams !== null) {
        console.warn(`[${requestId}] diagrams structure:`, JSON.stringify(parsed.diagrams, null, 2).substring(0, 500))
      }
      parsed.diagrams = []
    }

    console.log(`[${requestId}] Response structure valid: ${parsed.diagrams.length} diagrams found`)
    console.log(`[${requestId}] Markdown length: ${parsed.markdown.length} characters`)

    // Validate and fix diagrams
    console.log(`[${requestId}] Starting diagram validation for ${parsed.diagrams.length} diagrams`)
    const validatedDiagrams = await validateAndFixDiagrams(parsed.diagrams, openai, model, requestId)
    console.log(`[${requestId}] Diagram validation complete`)

    // Reassemble markdown with validated diagrams
    let finalMarkdown = parsed.markdown
    validatedDiagrams.forEach((diagram, index) => {
      const placeholder = `{{DIAGRAM_${diagram.originalPosition}}}`
      const diagramBlock =
        diagram.type === 'mermaid'
          ? `\`\`\`mermaid\n${diagram.code}\n\`\`\``
          : `\`\`\`plantuml\n${diagram.code}\n\`\`\``
      finalMarkdown = finalMarkdown.replace(placeholder, diagramBlock)
    })

    // Remove any remaining placeholders
    finalMarkdown = finalMarkdown.replace(/\{\{DIAGRAM_\d+\}\}/g, '')

    console.log(`[${requestId}] Final markdown length: ${finalMarkdown.length} characters`)
    console.log(`[${requestId}] Analysis complete, sending response`)
    res.json({ markdown: finalMarkdown })
  } catch (error) {
    console.error(`[${requestId}] ERROR: Analysis failed:`, error.message)
    console.error(`[${requestId}] Error stack:`, error.stack)
    console.error(`[${requestId}] Error details:`, {
      name: error.name,
      code: error.code,
      status: error.status,
      response: error.response?.data || error.response,
    })
    res.status(500).json({ 
      error: 'Failed to process code file.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    })
  }
})

app.listen(port, () => {
  console.log(`\n🚀 Syntra backend listening on http://localhost:${port}`)
  console.log(`📊 Model: ${model}`)
  console.log(`🌐 CORS origins: ${clientOrigins.join(', ')}`)
  console.log(`🔑 OpenAI API key: ${process.env.OPENAI_API_KEY ? '✅ Set' : '❌ Missing'}\n`)
})

function buildPrompt(filename, code) {
  return [
    `File name: ${filename}`,
    '',
    'Analyze this code file and produce function-by-function documentation.',
    'For each function, provide metadata (parameters, return type, side effects) and a narrative explanation of its logic flow.',
    'Write the narrative as if telling a story - abstract the implementation into logical concepts.',
    'Include diagrams (flowcharts, sequence diagrams) when they help visualize complex logic flows.',
    'Use the JSON structure specified in the system prompt.',
    '',
    'Code:',
    '```',
    code.slice(0, 12000),
    '```',
  ].join('\n')
}

function extractText(response) {
  if (!response) return ''
  if (response.output) {
    const chunks = response.output
      .flatMap((node) => node.content ?? [])
      .map((chunk) => chunk.text?.value ?? chunk.text ?? '')
      .filter(Boolean)
    return chunks.join('\n').trim()
  }
  if (response.choices) {
    return response.choices.map((choice) => choice.message?.content ?? '').join('\n').trim()
  }
  return ''
}

async function validateAndFixDiagrams(diagrams, openai, model, requestId = 'unknown', maxRetries = 2) {
  const results = []

  for (let i = 0; i < diagrams.length; i++) {
    const diagram = diagrams[i]
    console.log(`[${requestId}] Validating diagram ${i + 1}/${diagrams.length}: type=${diagram.type}`)
    let currentCode = diagram.code
    let attempts = 0
    let isValid = false
    let lastError = null

    while (attempts <= maxRetries && !isValid) {
      // Validate based on type
      let validation
      if (diagram.type === 'mermaid') {
        console.log(`[${requestId}] Validating Mermaid diagram ${i + 1}, attempt ${attempts + 1}`)
        validation = await validateMermaid(currentCode)
      } else if (diagram.type === 'plantuml' || diagram.type === 'puml' || diagram.type === 'uml') {
        console.log(`[${requestId}] Validating PlantUML diagram ${i + 1}, attempt ${attempts + 1}`)
        validation = await validatePlantUML(currentCode)
      } else {
        // Unknown type, skip validation
        console.log(`[${requestId}] Unknown diagram type '${diagram.type}', skipping validation`)
        isValid = true
        break
      }

      if (validation.valid) {
        console.log(`[${requestId}] Diagram ${i + 1} is valid`)
        isValid = true
        break
      }

      lastError = validation.error
      console.warn(`[${requestId}] Diagram ${i + 1} validation failed: ${lastError}`)

      // If invalid and we have retries left, ask GPT to fix it
      if (attempts < maxRetries) {
        try {
          console.log(`[${requestId}] Attempting to fix diagram ${i + 1} with GPT (attempt ${attempts + 1}/${maxRetries})`)
          const fixResponse = await openai.responses.create({
            model,
            temperature: 0.1,
            max_output_tokens: 1024,
            input: [
              {
                role: 'system',
                content: `You are a diagram syntax expert. Fix ${diagram.type} diagram syntax errors. Return ONLY the corrected diagram code, no explanations, no markdown, no code fences.`,
              },
              {
                role: 'user',
                content: `The following ${diagram.type} diagram has a syntax error:\n\n${currentCode}\n\nError: ${lastError}\n\nProvide the corrected diagram code:`,
              },
            ],
          })

          const fixedCode = extractText(fixResponse).trim()
          // Remove code fences if present
          currentCode = fixedCode.replace(/^```\w*\n/, '').replace(/\n```$/, '').trim()
          console.log(`[${requestId}] Diagram ${i + 1} fixed, retrying validation`)
          attempts++
        } catch (error) {
          console.error(`[${requestId}] ERROR: Failed to fix diagram ${i + 1}:`, error.message)
          break
        }
      } else {
        console.error(`[${requestId}] Diagram ${i + 1} failed validation after ${maxRetries} attempts`)
        break
      }
    }

    results.push({
      type: diagram.type,
      code: currentCode,
      originalPosition: diagram.position ?? i,
      valid: isValid,
      error: isValid ? null : lastError,
    })
    
    if (isValid) {
      console.log(`[${requestId}] Diagram ${i + 1} validated successfully`)
    } else {
      console.error(`[${requestId}] Diagram ${i + 1} remains invalid: ${lastError}`)
    }
  }

  return results
}


