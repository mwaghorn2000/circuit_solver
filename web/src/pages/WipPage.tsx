interface Props {
  title: string
}

function WipPage({ title }: Props) {
  return (
    <section className="wip">
      <pre>{`[ ${title.toUpperCase()} ]\n\n... work in progress ...`}</pre>
    </section>
  )
}

export default WipPage
