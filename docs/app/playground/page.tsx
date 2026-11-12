import { Playground } from '../../playground/playground';

export const metadata = {
  title: 'Playground',
  alternates: { canonical: '/playground' },
};

export default function Page() {
  return <Playground />;
}
