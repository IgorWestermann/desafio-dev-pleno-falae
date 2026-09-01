import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'

type ReviewStatus = 'pending' | 'processing' | 'completed' | 'failed'

type ReviewAnalysis = {
  sentiment: string
  category: string
  confidence: number
  matched_keywords: string[]
}

type Review = {
  id: string
  external_id: string
  company_id: string
  rating: number
  comment: string
  status: ReviewStatus
  analysis: ReviewAnalysis | null
  attempts: number
  created_at: string
  processed_at: string | null
  last_error: string | null
}

type ReviewForm = {
  externalId: string
  companyId: string
  rating: number
  comment: string
}

const initialForm: ReviewForm = {
  externalId: '',
  companyId: '',
  rating: 5,
  comment: '',
}

function App() {
  const [form, setForm] = useState(initialForm)
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const loadReviews = useCallback(async () => {
    try {
      const response = await fetch('/api/reviews')

      if (!response.ok) {
        throw new Error(`Não foi possível carregar as avaliações (${response.status})`)
      }

      const data = await response.json() as Review[]
      setReviews(data)
      setLoadError(null)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Erro ao carregar avaliações')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadReviews()

    const interval = window.setInterval(() => {
      void loadReviews()
    }, 2000)

    return () => window.clearInterval(interval)
  }, [loadReviews])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setSubmitError(null)

    const externalId = form.externalId.trim()

    try {
      const response = await fetch('/api/reviews', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': externalId,
        },
        body: JSON.stringify({
          external_id: externalId,
          company_id: form.companyId.trim(),
          rating: form.rating,
          comment: form.comment.trim(),
        }),
      })

      const result = await response.json() as { message?: string }

      if (!response.ok) {
        throw new Error(result.message ?? `Erro ao cadastrar avaliação (${response.status})`)
      }

      setForm(initialForm)
      await loadReviews()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Erro ao cadastrar avaliação')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="page">
      <header>
        <h1>Falaê!</h1>
        <p>Cadastro e análise assíncrona de avaliações.</p>
      </header>

      <section className="panel">
        <h2>Nova avaliação</h2>

        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>
              ID externo
              <input
                required
                value={form.externalId}
                onChange={(event) => setForm({ ...form, externalId: event.target.value })}
              />
            </label>

            <label>
              Empresa
              <input
                required
                value={form.companyId}
                onChange={(event) => setForm({ ...form, companyId: event.target.value })}
              />
            </label>

            <label>
              Nota
              <input
                required
                type="number"
                min="1"
                max="5"
                value={form.rating}
                onChange={(event) => setForm({ ...form, rating: Number(event.target.value) })}
              />
            </label>
          </div>

          <label>
            Comentário
            <textarea
              required
              rows={3}
              value={form.comment}
              onChange={(event) => setForm({ ...form, comment: event.target.value })}
            />
          </label>

          {submitError && <p className="error">{submitError}</p>}

          <button disabled={submitting} type="submit">
            {submitting ? 'Enviando...' : 'Cadastrar avaliação'}
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>Avaliações</h2>
          <span>Atualização automática a cada 2 segundos</span>
        </div>

        {loadError && <p className="error">{loadError}</p>}
        {loading && reviews.length === 0 && <p>Carregando...</p>}
        {!loading && reviews.length === 0 && <p>Nenhuma avaliação cadastrada.</p>}

        <div className="reviews">
          {reviews.map((review) => (
            <article className="review" key={review.id}>
              <div className="review-heading">
                <strong>{review.external_id}</strong>
                <span className={`status status-${review.status}`}>{review.status}</span>
              </div>

              <p>{review.comment}</p>
              <small>
                Empresa: {review.company_id} · Nota: {review.rating} · Tentativas: {review.attempts}
              </small>

              {review.analysis && (
                <div className="analysis">
                  <strong>Análise</strong>
                  <span>Sentimento: {review.analysis.sentiment}</span>
                  <span>Categoria: {review.analysis.category}</span>
                  <span>Confiança: {Math.round(review.analysis.confidence * 100)}%</span>
                  <span>Palavras: {review.analysis.matched_keywords.join(', ') || 'nenhuma'}</span>
                </div>
              )}

              {review.last_error && <p className="error">{review.last_error}</p>}
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}

export default App
