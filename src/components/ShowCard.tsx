// Poster card used in Discover rows and search results, with a quick-add button.

import { Link } from 'react-router-dom'
import { trackShow, type ShowSeed } from '../lib/actions'
import { useLibrary } from '../store/library'
import { IconCheck, IconPlus } from './Icons'
import { PosterImg } from './PosterImg'

interface ShowCardProps {
  seed: ShowSeed
  /** Extra line under the title (defaults to the show's network). */
  meta?: string
}

export function ShowCard({ seed, meta }: ShowCardProps) {
  const inLibrary = useLibrary((s) => !!s.shows[seed.id])
  const metaLine = [seed.year, meta ?? seed.network].filter(Boolean).join(' · ')
  return (
    <div className="show-card">
      <Link to={`/show/${seed.id}`} className="show-card-poster" tabIndex={-1}>
        <PosterImg src={seed.poster} alt={seed.name} className="poster" />
      </Link>
      <button
        className={`add-btn ${inLibrary ? 'added' : ''}`}
        title={inLibrary ? 'In your shows' : 'Add to your shows'}
        aria-label={inLibrary ? `${seed.name} is in your shows` : `Add ${seed.name}`}
        onClick={() => {
          if (!inLibrary) trackShow(seed)
        }}
      >
        {inLibrary ? <IconCheck size={15} /> : <IconPlus size={15} />}
      </button>
      <Link to={`/show/${seed.id}`} className="show-card-name" title={seed.name}>
        {seed.name}
      </Link>
      {metaLine && <div className="show-card-meta">{metaLine}</div>}
    </div>
  )
}
