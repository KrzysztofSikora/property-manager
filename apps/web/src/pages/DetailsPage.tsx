import { useParams } from 'react-router';

export function DetailsPage() {
  const { id = '' } = useParams();
  return <h1 className="text-2xl font-bold">Property {id}</h1>;
}
