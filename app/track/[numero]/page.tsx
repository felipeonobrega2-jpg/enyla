import { getTracking } from '../../utils/tracking-store'
import TrackingClient from './TrackingClient'

export default async function TrackingPage({
  params,
}: {
  params: Promise<{ numero: string }>
}) {
  const { numero } = await params
  const entry = getTracking(decodeURIComponent(numero))
  return <TrackingClient initialData={entry} numero={decodeURIComponent(numero)} />
}
