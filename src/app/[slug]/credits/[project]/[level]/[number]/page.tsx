import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import { shareMetadata } from '@/lib/shareMetadata';
import { cardPath, creditLabel, creditsPath, isCreditLevel, projectSlug } from '@/lib/projectCredits/credits';
import { loadCreditsProject, loadListedCredit } from '@/lib/projectCredits/server';

// A fan's public credit card: /<artist>/credits/<project>/<level>/<number>. This URL is the proof
// the fan takes outside CRWN, so it exists ONLY for a credit that still stands and that its owner
// chose to print. An unlisted or refunded credit 404s exactly like one that never existed.

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ slug: string; project: string; level: string; number: string }>;
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function load(p: Awaited<Props['params']>) {
  if (!isCreditLevel(p.level)) return null;
  const db = admin();
  const project = await loadCreditsProject(db, p.slug, p.project);
  if (!project) return null;
  const credit = await loadListedCredit(db, project.album.id, p.level, Number(p.number));
  return credit ? { project, credit } : null;
}

function imagePath(artistSlug: string, albumTitle: string, level: string, n: number) {
  return `/api/credit-card/${artistSlug}/${projectSlug(albumTitle)}/${level}/${n}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await load(await params);
  if (!data) return { title: 'Not Found | CRWN' };
  const { project, credit } = data;
  return shareMetadata({
    title: `${credit.name}: ${creditLabel(credit.level, credit.number)}`,
    description: `Credited on ${project.album.title} by ${project.artist.name}.`,
    path: cardPath(project.artist.slug, project.album.title, credit.level, credit.number),
    image: `${imagePath(project.artist.slug, project.album.title, credit.level, credit.number)}?format=og`,
    wideImage: true,
  });
}

export default async function CreditCardPage({ params }: Props) {
  const data = await load(await params);
  if (!data) notFound();
  const { project, credit } = data;
  const image = imagePath(project.artist.slug, project.album.title, credit.level, credit.number);

  return (
    <div className="min-h-screen bg-[#0D0D0D] text-white">
      <div className="mx-auto max-w-md px-4 pb-24 pt-8 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${image}?format=story`}
          alt={`${credit.name}, ${creditLabel(credit.level, credit.number)} on ${project.album.title}`}
          width={1080}
          height={1920}
          className="mx-auto h-auto w-full max-w-[360px] rounded-2xl"
        />
        <p className="mt-6 text-lg">
          {`${credit.name} is ${creditLabel(credit.level, credit.number)} on ${project.album.title} by ${project.artist.name}.`}
        </p>
        <div className="mx-auto mt-4 max-w-[360px] rounded-xl border border-[#D4AF37]/40 bg-[#1A1A1A] p-4 text-left">
          <p className="text-sm font-semibold text-[#D4AF37]">Verified by CRWN</p>
          <p className="mt-1 text-sm text-white/80">{`Credit ID ${credit.code}`}</p>
          <p className="text-sm text-white/80">
            {`Credited ${new Date(credit.creditedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`}
          </p>
          <p className="mt-2 text-xs text-white/50">
            This page is the proof. A real credit opens here on thecrwn.app with the same name, number
            and ID as the image. Recognition only.
          </p>
        </div>
        <Link
          href={creditsPath(project.artist.slug, project.album.title)}
          prefetch
          className="mt-6 inline-block rounded-full bg-[#D4AF37] px-6 py-3 font-semibold text-black"
        >
          See the credits
        </Link>
      </div>
    </div>
  );
}
