interface Props {
  onNavigate: (page: 'practice' | 'online') => void
}

function Home({ onNavigate }: Props) {
  return (
    <section className="home">
      <pre className="ascii-title">{'='.repeat(38) + '\n   C I R C U I T   S O L V E R\n' + '='.repeat(38)}</pre>
      <p className="tagline">build and fix circuits.</p>
      <div className="home-actions">
        <button type="button" className="big-button" onClick={() => onNavigate('online')}>
          Start Online Match
        </button>
        <button type="button" className="big-button" onClick={() => onNavigate('practice')}>
          Practice
        </button>
      </div>
    </section>
  )
}

export default Home
