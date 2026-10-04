import { interfaceText, interfaceIcon } from '@/shared/content/interface';
import { useSiteContent } from '@/shared/content/runtime';
import type { Contact, TimelineItem } from '@/data/types';
import { publicUrl } from '@/shared/lib/url';
import { BrandIcon } from '@/shared/ui/BrandIcon';
import { Icon, type IconName } from '@/shared/ui/Icon';
import './profile.css';

const CONTACT_ICON: Record<Contact['kind'], IconName> = { email: 'mail', github: 'code', phone: 'user', link: 'external' };

function ContactLink({ c, index }: { c: Contact; index: number }) {
  return (
    <a className="contact" data-edit-region={`profile:contacts.${index}.href`} href={c.href} target={c.kind === 'github' || c.kind === 'link' ? '_blank' : undefined} rel="noopener noreferrer">
      {c.kind === 'github' ? <BrandIcon name="github" size={16} /> : <Icon name={interfaceIcon(`profile.contact.${c.kind}`,CONTACT_ICON[c.kind])} size={16} />}
      <span data-edit-region={`profile:contacts.${index}.label`} data-edit-inline="true">{c.label}</span>
    </a>
  );
}

function OrgMark({ item, path }: { item: TimelineItem; path: string }) {
  if (item.logo) return <span data-edit-region={`profile:${path}.logo`}><BrandIcon name={item.logo} size={22} /></span>;
  if (item.badge)
    return (
      <span className="org-badge" data-edit-region={`profile:${path}.badge.text`} data-edit-inline="true" style={{ background: item.badge.color }}>
        {item.badge.text}
      </span>
    );
  return <Icon name={interfaceIcon("profilesection.sparkle.0","sparkle")} size={18} />;
}

function Timeline({ title, icon, items, field }: { title: string; icon: IconName; items: TimelineItem[]; field: string }) {
  return (
    <section className="tl">
      <h3 className="section-title">
        <Icon name={icon} size={18} />
        <span data-edit-region={`site:copy.profile.${field}`} data-edit-inline="true">{title}</span>
      </h3>
      <ol>
        {items.map((it, index) => (
          <li key={index} className="tl-item" data-edit-region={`profile:${field}.${index}`}>
            <div className="tl-mark">
              <OrgMark item={it} path={`${field}.${index}`} />
            </div>
            <div className="tl-body">
              <div className="tl-head">
                <strong data-edit-region={`profile:${field}.${index}.org`} data-edit-inline="true">{it.org}</strong>
                <span className="tl-period" data-edit-region={`profile:${field}.${index}.period`} data-edit-inline="true">{it.period}</span>
              </div>
              <div className="tl-role">
                <span data-edit-region={`profile:${field}.${index}.role`} data-edit-inline="true">{it.role}</span>
                {it.place && <span className="muted"> {interfaceText("·")}<span data-edit-region={`profile:${field}.${index}.place`} data-edit-inline="true">{it.place}</span></span>}
              </div>
              <ul className="tl-points">
                {it.points.map((p, i) => (
                  <li key={i} data-edit-region={`profile:${field}.${index}.points.${i}`}>
                    {p.title && <b><span data-edit-region={`profile:${field}.${index}.points.${i}.title`} data-edit-inline="true">{p.title}</span>{interfaceText("：")}</b>}
                    <span data-edit-region={`profile:${field}.${index}.points.${i}.text`} data-edit-inline="true" data-edit-multiline="true">{p.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** 个人 profile —— everything is rendered from data/profile.ts. */
export function ProfileSection() {
  const { profile, settings, copy } = useSiteContent();
  if (!profile) return null;
  const timelines = { experience: { icon: 'briefcase' as const, items: profile.experience }, projects: { icon: 'flag' as const, items: profile.projects }, education: { icon: 'school' as const, items: profile.education } };
  return (
    <div className="profile">
      <section className="profile-hero card">
        <div className="hero-avatar">
          <img data-edit-region="profile:avatar" src={publicUrl(profile.avatar)} alt={`${profile.name}的头像`} />
        </div>
        <div className="hero-main">
          <div className="hero-name">
            <h2 data-edit-region="profile:name" data-edit-inline="true">{profile.name}</h2>
            <span className="hero-en" data-edit-region="profile:nameEn" data-edit-inline="true">{profile.nameEn}</span>
          </div>
          <p className="hero-headline" data-edit-region="profile:headline" data-edit-inline="true">{profile.headline}</p>
          <p className="hero-status">
            <span className="status-dot" aria-hidden />
            <span data-edit-region="profile:status" data-edit-inline="true">{profile.status}</span>
          </p>
          <p className="hero-intro" data-edit-region="profile:intro" data-edit-inline="true" data-edit-multiline="true">{profile.intro}</p>
          <div className="hero-contacts">
            {profile.contacts.map((c, index) => (
              <ContactLink key={index} c={c} index={index} />
            ))}
            {profile.resume && (
              <a className="btn btn-primary" data-edit-region="profile:resume" href={publicUrl(profile.resume)} download>
                <Icon name={interfaceIcon("profilesection.download.1","download")} size={16} /> <span data-edit-region="site:copy.profile.resume" data-edit-inline="true">{copy('profile.resume')}</span>
              </a>
            )}
          </div>
        </div>
        <dl className="hero-facts">
          {profile.facts.map((f, index) => (
            <div key={index} data-edit-region={`profile:facts.${index}`}>
              <dt data-edit-region={`profile:facts.${index}.label`} data-edit-inline="true">{f.label}</dt>
              <dd data-edit-region={`profile:facts.${index}.value`} data-edit-inline="true">{f.value}</dd>
            </div>
          ))}
          <div>
            <dt data-edit-region="site:copy.profile.interests" data-edit-inline="true">{copy('profile.interests')}</dt>
            <dd className="hero-interests" data-edit-region="profile:interests">
              {profile.interests.map((i, index) => (
                <span key={index} className="chip" data-edit-region={`profile:interests.${index}`} data-edit-inline="true">
                  {i}
                </span>
              ))}
              <button type="button" className="chip profile-interest-add" data-edit-region="profile:interests" aria-label="添加或管理爱好">＋ 添加爱好</button>
            </dd>
          </div>
        </dl>
      </section>

      <div className="profile-grid">
        <div className="card profile-col">
          {settings.sections.filter(s => s.visible && s.id in timelines).map(s => { const item = timelines[s.id as keyof typeof timelines]; return <Timeline key={s.id} field={s.id} title={copy(`profile.${s.id}`)} icon={interfaceIcon(`profile.${s.id}`,item.icon)} items={item.items} />; })}
        </div>
        <div className="profile-side">
          {settings.sections.find(s => s.id === 'skills')?.visible && <section className="card side-block" style={{order:settings.sections.findIndex(s=>s.id==='skills')}}>
            <h3 className="section-title">
              <Icon name={interfaceIcon("profilesection.sparkle.2","sparkle")} size={18} />
              <span data-edit-region="site:copy.profile.skills" data-edit-inline="true">{copy('profile.skills')}</span>
            </h3>
            {profile.skills.map((g, index) => (
              <div key={index} className="skill-group" data-edit-region={`profile:skills.${index}`}>
                <span className="skill-label" data-edit-region={`profile:skills.${index}.group`} data-edit-inline="true">{g.group}</span>
                <div className="skill-items">
                  {g.items.map((s, itemIndex) => (
                    <span key={itemIndex} className="chip skill" data-edit-region={`profile:skills.${index}.items.${itemIndex}`}>
                      {s.brand && <BrandIcon name={s.brand} size={14} />}
                      <span data-edit-region={`profile:skills.${index}.items.${itemIndex}.name`} data-edit-inline="true">{s.name}</span>
                    </span>
                  ))}
                </div>
                {g.note && <p className="skill-note" data-edit-region={`profile:skills.${index}.note`} data-edit-inline="true" data-edit-multiline="true">{g.note}</p>}
              </div>
            ))}
          </section>}
          {settings.sections.find(s => s.id === 'honors')?.visible && <section className="card side-block" style={{order:settings.sections.findIndex(s=>s.id==='honors')}}>
            <h3 className="section-title">
              <Icon name={interfaceIcon("profilesection.award.3","award")} size={18} />
              <span data-edit-region="site:copy.profile.honors" data-edit-inline="true">{copy('profile.honors')}</span>
            </h3>
            <ul className="honors">
              {profile.honors.map((h, index) => (
                <li key={index} data-edit-region={`profile:honors.${index}`}>
                  {h.brand ? <BrandIcon name={h.brand} size={14} /> : <Icon name={interfaceIcon("profilesection.award.4","award")} size={14} />}
                  <span data-edit-region={`profile:honors.${index}.text`} data-edit-inline="true" data-edit-multiline="true">{h.text}</span>
                </li>
              ))}
            </ul>
          </section>}
        </div>
      </div>
    </div>
  );
}
