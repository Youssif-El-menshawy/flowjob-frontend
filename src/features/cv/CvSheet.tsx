import type { CvContent } from '@/shared/api/types';
import { linkKind, linkLabel } from '@/shared/lib/links';
import { cn } from '@/shared/lib/utils';

/** The printable CV. Always paper-white so it looks like the real document in both themes. */
export function CvSheet({
  cv,
  highlight,
  className,
  compact,
}: {
  cv: CvContent;
  highlight?: string;
  className?: string;
  compact?: boolean;
}) {
  const H = ({ id, children }: { id: string; children: string }) => (
    <h3
      className={cn(
        'mt-5 mb-1.5 text-[11px] font-bold tracking-[0.14em] text-[#2e5b44] uppercase',
        highlight === id && 'text-[#b4561b]',
      )}
    >
      {children}
    </h3>
  );
  const hl = (id: string) =>
    cn('-mx-2 rounded-md px-2 transition-colors duration-300', highlight === id && 'bg-[#fde8d6]');
  // Same labels as the Harvard PDF: LinkedIn / GitHub instead of raw URLs; other links unchanged.
  const contact = [cv.location, cv.email, cv.phone, ...cv.links.map((l) => { const k = linkKind(l); return k ? linkLabel(k) : l; })]
    .filter(Boolean)
    .join(' · ');
  return (
    <div
      className={cn(
        'rounded-md bg-white text-[13px] leading-[1.55] text-[#1c2b22] shadow-[0_18px_40px_rgb(28_43_34/0.12)]',
        compact ? 'p-6' : 'p-9 sm:p-10',
        className,
      )}
    >
      <div className={hl('personal')}>
        <p className="font-display text-[26px] leading-tight font-semibold tracking-tight">
          {cv.fullName || 'Your name'}
        </p>
        {contact && <p className="mt-1 text-[#56665b]">{contact}</p>}
      </div>
      {cv.summary && (
        <div className={hl('summary')}>
          <H id="summary">Summary</H>
          <p>{cv.summary}</p>
        </div>
      )}
      {cv.experience.length > 0 && (
        <div className={hl('experience')}>
          <H id="experience">Experience</H>
          {cv.experience.map((e) => (
            <div key={e.id} className="mb-2.5">
              <p className="font-semibold">
                {e.title}, {e.company}{' '}
                <span className="font-normal text-[#56665b]">
                  · {e.start} – {e.end || 'Present'}
                </span>
              </p>
              <ul className="list-disc pl-4">
                {e.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {cv.education.length > 0 && (
        <div className={hl('education')}>
          <H id="education">Education</H>
          {cv.education.map((e) => (
            <p key={e.id} className="mb-1">
              <span className="font-semibold">{e.degree}</span>, {e.school}{' '}
              <span className="text-[#56665b]">
                · {e.start} – {e.end}
              </span>
              {e.note && <span className="block text-[#56665b]">{e.note}</span>}
            </p>
          ))}
        </div>
      )}
      {cv.projects.length > 0 && (
        <div className={hl('projects')}>
          <H id="projects">Projects</H>
          {cv.projects.map((p) => (
            <p key={p.id} className="mb-1">
              <span className="font-semibold">{p.name}</span>{' '}
              <span className="text-[#56665b]">· {p.tech}</span>
              <span className="block">{p.description}</span>
            </p>
          ))}
        </div>
      )}
      {(cv.skills.length > 0 || cv.languages) && (
        <div className={hl('skills')}>
          <H id="skills">Skills</H>
          <p>{cv.skills.join(', ')}</p>
          {cv.languages && <p className="text-[#56665b]">{cv.languages}</p>}
        </div>
      )}
    </div>
  );
}
