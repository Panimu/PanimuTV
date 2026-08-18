import { useState } from 'react'
import { IconTv } from './Icons'

interface PosterImgProps {
  src?: string
  alt: string
  className?: string
}

/** Poster image with a graceful placeholder when missing or failing to load. */
export function PosterImg({ src, alt, className = '' }: PosterImgProps) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <div className={`poster-fallback ${className}`} role="img" aria-label={alt}>
        <IconTv size={26} />
      </div>
    )
  }
  return (
    <img className={className} src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />
  )
}
