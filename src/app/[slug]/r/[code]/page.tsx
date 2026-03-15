import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ slug: string; code: string }>;
}

export default async function ReferralRedirect({ params }: Props) {
  const { slug, code } = await params;
  redirect(`/${slug}?ref=${code}`);
}
