// Diagram validation utilities
import { JSDOM } from 'jsdom'
import mermaid from 'mermaid'
import { encode } from 'plantuml-encoder'

// Setup JSDOM for Mermaid (only once)
let mermaidInitialized = false
function initMermaid() {
  if (mermaidInitialized) return
  const { window } = new JSDOM('', { pretendToBeVisual: true, url: 'http://localhost' })
  globalThis.window = window
  globalThis.document = window.document
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'node.js' },
    configurable: true,
    writable: true,
  })
  mermaid.initialize({ startOnLoad: false, theme: 'dark' })
  mermaidInitialized = true
}

/**
 * Validates a Mermaid diagram definition
 * @param {string} definition - The Mermaid diagram code
 * @returns {Promise<{valid: boolean, error: string|null}>}
 */
export async function validateMermaid(definition) {
  try {
    initMermaid()
    const trimmed = definition.trim()
    if (!trimmed) {
      return { valid: false, error: 'Empty Mermaid definition' }
    }
    await mermaid.parse(trimmed)
    return { valid: true, error: null }
  } catch (error) {
    const errorMsg = error.message || error.str || String(error)
    return {
      valid: false,
      error: errorMsg,
    }
  }
}

/**
 * Validates a PlantUML diagram definition
 * @param {string} definition - The PlantUML diagram code
 * @returns {Promise<{valid: boolean, error: string|null}>}
 */
export async function validatePlantUML(definition) {
  try {
    const trimmed = definition.trim()
    if (!trimmed) {
      return { valid: false, error: 'Empty PlantUML definition' }
    }
    const encoded = encode(trimmed)
    // Fetch the txt version to check for errors
    const response = await fetch(`https://www.plantuml.com/plantuml/txt/${encoded}`)
    if (!response.ok) {
      return { valid: false, error: `HTTP ${response.status}: ${response.statusText}` }
    }
    
    const text = await response.text()
    
    // Check for error patterns in PlantUML output
    if (
      text.includes('cannot include') ||
      text.includes('syntax error') ||
      text.includes('Error') ||
      text.includes('^^^^^') // Error marker in PlantUML
    ) {
      // Extract error message if possible
      const errorMatch = text.match(/cannot [^\n]+|syntax error[^\n]*|Error[^\n]*/i)
      return {
        valid: false,
        error: errorMatch ? errorMatch[0].trim() : 'PlantUML syntax error detected',
      }
    }
    
    return { valid: true, error: null }
  } catch (error) {
    return {
      valid: false,
      error: error.message || String(error),
    }
  }
}

