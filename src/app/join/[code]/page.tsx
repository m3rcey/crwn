import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ code: string }>;
}

export default async function RecruiterJoinRedirect({ params }: Props) {
  const { code } = await params;
  redirect(`/signup?recruiter=${code}`);
}
