export default function Pagination({ page, total, pageSize = 50, onChange }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (totalPages <= 1) return null

  const pages = []
  const delta = 2
  const left  = Math.max(1, page - delta)
  const right = Math.min(totalPages, page + delta)

  if (left > 1) {
    pages.push(1)
    if (left > 2) pages.push('…')
  }
  for (let p = left; p <= right; p++) pages.push(p)
  if (right < totalPages) {
    if (right < totalPages - 1) pages.push('…')
    pages.push(totalPages)
  }

  return (
    <div className="pagination">
      <button className="page-btn" disabled={page === 1} onClick={() => onChange(page - 1)}>‹</button>
      {pages.map((p, i) =>
        p === '…'
          ? <span key={`e${i}`} className="page-info">…</span>
          : <button key={p} className={`page-btn${p === page ? ' active' : ''}`} onClick={() => onChange(p)}>{p}</button>
      )}
      <button className="page-btn" disabled={page === totalPages} onClick={() => onChange(page + 1)}>›</button>
      <span className="page-info">{total.toLocaleString()}건 / {totalPages}페이지</span>
    </div>
  )
}
