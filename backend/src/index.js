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
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI key missing on server.' })
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No code file received.' })
    }

    const codeSample = req.file.buffer.toString('utf-8')
    const prompt = buildPrompt(req.file.originalname, codeSample)

    // Request JSON output with separated markdown and diagrams
    const response = await openai.responses.create({
      model,
      temperature: 0.2,
      max_output_tokens: 4096,
      text: { format: { type: 'json_object' } },
      input: [
        {
          role: 'system',
          content: `You are Syntra, an elite code analyst. You analyze code and produce high-level business-focused documentation.

CRITICAL: You must respond with valid JSON in this exact structure:
{
  "markdown": "The main markdown content with placeholders like {{DIAGRAM_0}}, {{DIAGRAM_1}}, etc. where diagrams should appear",
  "diagrams": [
    {"type": "mermaid", "code": "graph TD; A-->B", "position": 0},
    {"type": "plantuml", "code": "@startuml\\nA->B\\n@enduml", "position": 1}
  ]
}

Focus on:
- High-level overview: What does this code do? What problem does it solve?
- Business logic: Input/output contracts, data transformations, decision points
- Architecture: Component relationships, data flows, state management
- Risks and considerations: Security, performance, edge cases

DO NOT:
- Explain syntax line-by-line
- Describe what each variable does
- Walk through code execution step-by-step

Include Mermaid or PlantUML diagrams when they clarify:
- Workflows and processes
- Component relationships
- State machines
- Data flows
- System architecture`,
        },
        { role: 'user', content: prompt },
      ],
    })

    const jsonText = extractText(response)
    if (!jsonText) {
      return res.status(502).json({ error: 'No response returned from GPT-5.1' })
    }

    // Parse JSON (with repair for common issues)
    let parsed
    try {
      parsed = JSON.parse(jsonText)
    } catch (e) {
      try {
        parsed = JSON.parse(jsonrepair(jsonText))
      } catch (e2) {
        console.error('Failed to parse JSON:', e2.message)
        return res.status(502).json({ error: 'Invalid JSON response from GPT-5.1' })
      }
    }

    if (!parsed.markdown || !Array.isArray(parsed.diagrams)) {
      return res.status(502).json({ error: 'Invalid response structure from GPT-5.1' })
    }

    // Validate and fix diagrams
    const validatedDiagrams = await validateAndFixDiagrams(parsed.diagrams, openai, model)

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

    res.json({ markdown: finalMarkdown })
  } catch (error) {
    console.error('Analysis failed', error)
    res.status(500).json({ error: 'Failed to process code file.' })
  }
})

app.listen(port, () => {
  console.log(`Syntra backend listening on http://localhost:${port}`)
})

function buildPrompt(filename, code) {
  return [
    `File name: ${filename}`,
    '',
    'Analyze this code and produce high-level documentation focusing on business logic, architecture, and purpose.',
    'Include diagrams where they add value. Use the JSON structure specified in the system prompt.',
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

async function validateAndFixDiagrams(diagrams, openai, model, maxRetries = 2) {
  const results = []

  for (let i = 0; i < diagrams.length; i++) {
    const diagram = diagrams[i]
    let currentCode = diagram.code
    let attempts = 0
    let isValid = false
    let lastError = null

    while (attempts <= maxRetries && !isValid) {
      // Validate based on type
      let validation
      if (diagram.type === 'mermaid') {
        validation = await validateMermaid(currentCode)
      } else if (diagram.type === 'plantuml' || diagram.type === 'puml' || diagram.type === 'uml') {
        validation = await validatePlantUML(currentCode)
      } else {
        // Unknown type, skip validation
        isValid = true
        break
      }

      if (validation.valid) {
        isValid = true
        break
      }

      lastError = validation.error

      // If invalid and we have retries left, ask GPT to fix it
      if (attempts < maxRetries) {
        try {
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
          attempts++
        } catch (error) {
          console.error(`Failed to fix diagram ${i}:`, error)
          break
        }
      } else {
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
  }

  return results
}

