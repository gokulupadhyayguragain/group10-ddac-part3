import Shell from '../components/Shell';
import { panelClass } from '../lib/ui';

const guides = [
  {
    title: 'If you find a confused elderly person',
    points: ['Speak slowly and calmly', 'Do not crowd or physically pull them', 'Ask simple yes/no questions', 'Submit a sighting with exact location'],
  },
  {
    title: 'Caregiver missing-person checklist',
    points: ['Add last seen time and location', 'Add medication or medical notes', 'Keep phone contact reachable', 'Monitor alerts and verify sightings'],
  },
  {
    title: 'Cloud services used in the coursework',
    points: ['EC2 or Elastic Beanstalk for the app runtime', 'RDS PostgreSQL for records', 'S3 for patient/sighting photos', 'API Gateway, Lambda, SQS, and SNS for alert events'],
  },
];

export default function ResourcesPage() {
  return (
    <Shell title="Resources" subtitle="Simple guidance for Alzheimer wandering response and assignment evidence.">
      <section className="grid gap-4 xl:grid-cols-3">
        {guides.map((guide) => (
          <article key={guide.title} className={panelClass}>
            <h2 className="font-semibold">{guide.title}</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-600">
              {guide.points.map((point) => <li key={point}>{point}</li>)}
            </ul>
          </article>
        ))}
      </section>

      <section className={`${panelClass} mt-4`}>
        <h2 className="font-semibold">Project scope from Scenario 3</h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
          SafeTrace addresses Alzheimer&apos;s wandering by centralizing caregiver reports, community sightings,
          alert notifications, and admin monitoring. This matches the assignment brief requirement for a cloud-based
          web application with frontend, backend, database persistence, AWS deployment readiness, serverless alert
          integration, and performance monitoring evidence.
        </p>
      </section>
    </Shell>
  );
}
