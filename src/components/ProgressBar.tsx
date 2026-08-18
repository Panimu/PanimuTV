interface ProgressBarProps {
  /** 0..1 */
  value: number
  className?: string
}

export function ProgressBar({ value, className = '' }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <div className={`progress ${className}`}>
      <div className="progress-fill" style={{ width: `${pct}%` }} />
    </div>
  )
}
