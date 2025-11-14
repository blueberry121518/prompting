import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react'
import { BrowserRouter, Route, Routes, useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import mermaid from 'mermaid'
import encodePlantUml from 'plantuml-encoder'
import './index.css'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

const AnalysisContext = createContext(null)
const INITIAL_STATE = { status: 'idle', markdown: '', fileName: '', error: '' }

function AnalysisProvider({ children }) {
  const [state, setState] = useState(INITIAL_STATE)

  const analyzeFile = useCallback(async (file) => {
    if (!file) return
    setState({ status: 'loading', markdown: '', fileName: file.name, error: '' })
    const formData = new FormData()
    formData.append('file', file)
    try {
      const response = await fetch(`${API_BASE_URL}/analyze`, {
        method: 'POST',
        body: formData,
      })
      if (!response.ok) {
        throw new Error('Syntra could not reach the analyst core.')
      }
      const payload = await response.json()
      if (!payload?.markdown) {
        throw new Error('The analyst returned an empty dossier.')
      }
      setState({ status: 'ready', markdown: payload.markdown, fileName: file.name, error: '' })
    } catch (err) {
      setState({
        status: 'error',
        markdown: '',
        fileName: file.name,
        error: err.message ?? 'Unexpected failure.',
      })
    }
  }, [])

  const reset = useCallback(() => setState(INITIAL_STATE), [])

  return (
    <AnalysisContext.Provider value={{ state, analyzeFile, reset }}>
      {children}
    </AnalysisContext.Provider>
  )
}

function useAnalysis() {
  const ctx = useContext(AnalysisContext)
  if (!ctx) {
    throw new Error('useAnalysis must be used inside AnalysisProvider')
  }
  return ctx
}

function App() {
  return (
    <BrowserRouter>
      <AnalysisProvider>
        <Routes>
          <Route path="/" element={<UploadScreen />} />
          <Route path="/report" element={<ReportScreen />} />
        </Routes>
      </AnalysisProvider>
    </BrowserRouter>
  )
}

function UploadScreen() {
  const { analyzeFile } = useAnalysis()
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const description = useMemo(
    () =>
      'Upload a single code file. Syntra will translate it into living documentation that reads like the product brief you wish you had.',
    [],
  )

  const handleFileChange = useCallback(
    (event) => {
      const file = event.target.files?.[0]
      if (!file) return
      void analyzeFile(file)
      navigate('/report')
    },
    [analyzeFile, navigate],
  )

  return (
    <div className="min-h-screen bg-obsidian text-white">
      <div className="relative isolate overflow-hidden">
        <BackgroundGlow />
        <main className="relative z-10 mx-auto flex max-w-6xl flex-col gap-12 px-6 pb-16 pt-12 md:flex-row md:items-center md:justify-between md:pt-24">
          <div className="max-w-xl">
            <Logo />
            <p className="mt-6 text-sm uppercase tracking-[0.3em] text-slate">Vision</p>
            <h1 className="mt-4 font-grotesk text-4xl font-semibold leading-tight text-white md:text-5xl lg:text-6xl">
              Understand your codebase without reading it.
            </h1>
            <p className="mt-6 text-lg text-slate">{description}</p>
            <div className="mt-10 flex flex-col gap-4 text-sm text-slate">
              <p className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan shadow-glow" />
                Built with GPT-5.1 reasoning cores.
              </p>
              <p className="text-slate">Drag a file or use the uploader on the right.</p>
            </div>
          </div>

          <section className="w-full max-w-md rounded-3xl border border-white/5 bg-gradient-to-br from-graphite/70 via-black/70 to-black/20 p-6 shadow-2xl shadow-black/40 backdrop-blur">
            <UploadPanel inputRef={inputRef} onChange={handleFileChange} />
          </section>
        </main>
      </div>
    </div>
  )
}

function ReportScreen() {
  const { state, reset } = useAnalysis()
  const navigate = useNavigate()

  useEffect(() => {
    if (state.status === 'idle') {
      navigate('/')
    }
  }, [state.status, navigate])

  const handleUploadNew = useCallback(() => {
    reset()
    navigate('/')
  }, [navigate, reset])

  return (
    <div className="min-h-screen bg-obsidian text-white">
      <div className="relative isolate overflow-hidden">
        <BackgroundGlow />
        <main className="relative z-10 mx-auto max-w-6xl px-6 pb-16 pt-12">
          <header className="mb-8 flex items-center justify-between border-b border-white/10 pb-6">
            <div>
              <Logo />
              <p className="mt-4 text-sm uppercase tracking-[0.3em] text-slate">Output</p>
              <h1 className="mt-2 font-grotesk text-3xl font-semibold leading-tight text-white md:text-4xl">
                Analysis: {state.fileName || 'your file'}
              </h1>
            </div>
            <button
              onClick={handleUploadNew}
              className="inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-2 text-xs uppercase tracking-[0.2em] text-white transition hover:border-white/60"
            >
              Upload another file
            </button>
          </header>

          <div className="w-full">
            {state.status === 'loading' && <LoadingPanel fileName={state.fileName} />}
            {state.status === 'error' && <ErrorPanel message={state.error} />}
            {state.status === 'ready' && <MarkdownPanel markdown={state.markdown} />}
          </div>
        </main>
      </div>
    </div>
  )
}

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan/20 ring-1 ring-cyan/40">
        <div className="h-3 w-6 -skew-x-12 border border-cyan/70" />
      </div>
      <div>
        <p className="font-grotesk text-lg tracking-[0.4em] text-white">SYNTRA</p>
        <p className="text-xs uppercase tracking-[0.4em] text-slate">Atlas</p>
      </div>
    </div>
  )
}

function UploadPanel({ onChange, inputRef }) {
  return (
    <label className="group flex h-80 cursor-pointer flex-col justify-between rounded-2xl border border-dashed border-white/15 bg-white/5 p-6 text-white transition hover:border-white/40 hover:bg-white/10">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-slate">Input</p>
        <h2 className="mt-3 font-grotesk text-2xl font-semibold text-white">
          Drop your .ts, .js, .py, or .rs file
        </h2>
        <p className="mt-3 text-sm text-slate">
          We will never store your code. Files go straight to the GPT-5.1 analyst core.
        </p>
      </div>
      <div className="flex items-center justify-between rounded-xl bg-black/40 px-4 py-3 text-sm font-medium shadow-inner shadow-cyan/10">
        <span className="text-slate group-hover:text-white">Upload &rarr;</span>
        <span className="rounded-full border border-white/30 px-3 py-1 text-xs uppercase tracking-wide text-white/80">
          Browse
        </span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".js,.jsx,.ts,.tsx,.py,.rb,.go,.java,.rs,.c,.cpp,.json,.md,.txt"
        className="sr-only"
        onChange={onChange}
      />
    </label>
  )
}

function LoadingPanel({ fileName }) {
  return (
    <div className="flex h-80 flex-col justify-between rounded-2xl border border-white/10 bg-black/40 p-6 text-white">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-slate">Processing</p>
        <h2 className="mt-3 font-grotesk text-2xl font-semibold text-white">{fileName}</h2>
        <p className="mt-3 text-sm text-slate">
          Syntra is translating your code into a visual-first markdown briefing.
        </p>
      </div>
      <div className="overflow-hidden rounded-full bg-white/5">
        <div className="h-2 w-full origin-left animate-loading bg-gradient-to-r from-cyan via-white/90 to-cyan" />
      </div>
      <p className="text-xs uppercase tracking-[0.3em] text-slate">GPT-5.1 reasoning core</p>
    </div>
  )
}

function ErrorPanel({ message }) {
  return (
    <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-6 text-rose-100">
      <p className="text-sm uppercase tracking-[0.3em] text-rose-200/80">Error</p>
      <p className="mt-4 text-lg text-white">{message}</p>
      <p className="mt-2 text-sm text-rose-200">Return to upload and try again.</p>
    </div>
  )
}

function MarkdownPanel({ markdown }) {
  const markdownComponents = useMemo(
    () => ({
      code({ inline, className = '', children, ...props }) {
        const match = /language-(\w+)/.exec(className)
        const language = match?.[1]
        const content = String(children).replace(/\n$/, '')

        if (!inline && language === 'mermaid') {
          return <MermaidDiagram definition={content} />
        }

        if (!inline && ['plantuml', 'puml', 'uml'].includes(language ?? '')) {
          return <PlantUmlDiagram definition={content} />
        }

        if (inline) {
          return (
            <code className="rounded bg-white/10 px-1 py-0.5 text-[0.85em]" {...props}>
              {children}
            </code>
          )
        }

        return (
          <pre className="overflow-x-auto rounded-lg border border-white/5 bg-white/5 p-4 text-sm text-white/80">
            <code className={className} {...props}>
              {children}
            </code>
          </pre>
        )
      },
    }),
    [],
  )

  return (
    <article className="prose prose-invert prose-lg max-w-none rounded-2xl border border-white/10 bg-black/40 p-8 text-white">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {markdown}
      </ReactMarkdown>
    </article>
  )
}

function MermaidDiagram({ definition }) {
  const containerRef = useRef(null)
  const chartId = useId()
  const sanitizedId = useMemo(() => chartId.replace(/:/g, '-'), [chartId])
  const renderCounter = useRef(0)

  useEffect(() => {
    let cancelled = false
    mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' })
    async function renderMermaid() {
      try {
        renderCounter.current += 1
        const uniqueId = `${sanitizedId}-${renderCounter.current}`
        const { svg } = await mermaid.render(uniqueId, definition)
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg
        }
      } catch (err) {
        if (containerRef.current) {
          containerRef.current.innerHTML = `<pre class="text-rose-300 text-xs">Mermaid error: ${err.message}</pre>`
        }
      }
    }
    renderMermaid()
    return () => {
      cancelled = true
    }
  }, [definition, sanitizedId])

  return (
    <div
      ref={containerRef}
      className="my-4 w-full overflow-x-auto rounded-2xl border border-white/5 bg-gradient-to-br from-black/60 to-black/20 p-4"
    />
  )
}

function PlantUmlDiagram({ definition }) {
  const encoded = useMemo(() => {
    try {
      return encodePlantUml(definition)
    } catch {
      return null
    }
  }, [definition])

  if (!encoded) {
    return (
      <div className="my-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-200">
        Failed to render PlantUML diagram.
      </div>
    )
  }

  return (
    <div className="my-4 flex w-full justify-center rounded-2xl border border-white/5 bg-black/20 p-4">
      <img
        src={`https://www.plantuml.com/plantuml/svg/${encoded}`}
        alt="PlantUML diagram"
        className="max-h-[360px]"
        loading="lazy"
      />
    </div>
  )
}

function BackgroundGlow() {
  return (
    <>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(111,232,255,0.18),_transparent_50%)]" />
      <div className="pointer-events-none absolute -right-32 top-10 h-[520px] w-[520px] rounded-full border border-white/5 bg-black/60 blur-3xl" />
      <div className="pointer-events-none absolute -right-10 top-24 hidden h-96 w-96 rounded-full border border-white/10 bg-gradient-to-br from-cyan/10 via-transparent to-black/60 shadow-glow md:block">
        <div className="absolute inset-10 rounded-full border border-white/5 opacity-70" />
        <div className="absolute inset-20 rounded-full border border-white/5 opacity-50" />
        <div className="absolute inset-32 animate-pulseGlow rounded-full border border-white/5 opacity-30" />
      </div>
    </>
  )
}

export default App
